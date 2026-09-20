#!/usr/bin/env python3
"""Turn a user-exported public SCMDB Fabricator capture into offline data.

This importer deliberately accepts only the bookmarklet's public rendered-page
export.  It does not contact SCMDB, nor does it request its /data/ endpoints.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


CONTROL_LINES = {"☐", "●", "⚙️ —", "🛒", "DEFAULT"}
SIZE_RE = re.compile(r"^S(\d+)$", re.I)
TIME_RE = re.compile(r"^⏱\s*(\d+(?:\.\d+)?)s$")
AMOUNT_RE = re.compile(
    r"^(?P<name>.+?)\s+\((?:(?P<scu>\d+(?:\.\d+)?)\s*SCU|[×x]\s*(?P<count>\d+(?:\.\d+)?))\)$",
    re.I,
)
MAKER_RE = re.compile(r"^[A-Z0-9&.-]{2,8}$")
TYPE_LABEL_RE = re.compile(r"^(?P<icon>🔫|⚔️|🛡|⚡|❄️|🔰|🚀|📡|⛏️|🧲|💠|🔋|⛽|📦|♻️)\s*(?P<label>.+)$")
TYPE_GROUPS = {
    "🔫": "武器", "⚔️": "舰载武器", "🛡": "护甲与服装", "⚡": "电源", "❄️": "冷却器",
    "🔰": "量子驱动", "🚀": "推进器", "📡": "雷达", "⛏️": "采矿组件", "🧲": "牵引光束",
    "💠": "护盾", "🔋": "弹药与电池", "⛽": "燃料系统", "📦": "货运组件", "♻️": "回收组件",
}


def clean_lines(raw: str) -> list[str]:
    return [line.strip() for line in raw.splitlines() if line.strip()]


def parse_card(raw: str, index: int) -> dict:
    lines = clean_lines(raw)
    time_index = next((i for i, line in enumerate(lines) if TIME_RE.match(line)), None)
    if time_index is None:
        raise ValueError("missing manufacturing time")

    # The first user-facing line is the blueprint name; all leading controls
    # emitted by the page are excluded here.
    name = next((line for line in lines if line not in CONTROL_LINES), "")
    if not name:
        raise ValueError("missing blueprint name")

    size = None
    manufacturer = None
    category = None
    type_group = "其他"
    type_subtype = None
    materials: list[dict] = []
    for i, line in enumerate(lines[:time_index]):
        size_match = SIZE_RE.match(line)
        if size_match:
            size = int(size_match.group(1))
        type_match = TYPE_LABEL_RE.match(line)
        if type_match:
            type_group = TYPE_GROUPS[type_match.group("icon")]
            type_subtype = type_match.group("label").strip()
            category = type_subtype
        amount_match = AMOUNT_RE.match(line)
        if not amount_match or i == 0:
            continue
        slot = lines[i - 1]
        # A material amount always follows its slot.  This check prevents a
        # malformed card from treating its title or summary as a slot.
        if slot in CONTROL_LINES or SIZE_RE.match(slot) or slot.startswith("🔋"):
            continue
        materials.append(
            {
                "slot": slot,
                "name": amount_match.group("name").strip(),
                "amount_scu": float(amount_match.group("scu")) if amount_match.group("scu") else None,
                "amount_count": float(amount_match.group("count")) if amount_match.group("count") else None,
            }
        )

    # SCMDB's small maker badge, when present, is placed after the optional
    # type label and before S1/S2.  Keep it as metadata only when unambiguous.
    for i, line in enumerate(lines[:time_index]):
        if SIZE_RE.match(line) and i > 0 and MAKER_RE.match(lines[i - 1]):
            manufacturer = lines[i - 1]
            break

    craft_time = float(TIME_RE.match(lines[time_index]).group(1))
    return {
        "id": f"capture-{index:04d}",
        "name": name,
        "name_zh": name,
        "name_en": None,
        "category": category,
        "type_group": type_group,
        "type_subtype": type_subtype,
        "manufacturer": manufacturer,
        "size": size,
        "craft_time_seconds": craft_time,
        "materials": materials,
        "raw_text": raw,
    }


def mineral_lookup(locale_path: Path) -> dict[str, dict]:
    locale = json.loads(locale_path.read_text(encoding="utf-8"))
    lookup: dict[str, dict] = {}
    for mineral_id, values in locale.get("minerals", {}).items():
        for key in [values.get("zh"), values.get("en"), *values.get("aliases_zh", []), *values.get("aliases_en", [])]:
            if key:
                lookup.setdefault(key.strip().casefold(), {"id": mineral_id, "zh": values.get("zh"), "en": values.get("en")})
    return lookup


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, nargs="?", help="Capture JSON; defaults to the newest import.")
    parser.add_argument("--output", type=Path, default=Path("scminer-local/data/scmdb-blueprints.json"))
    parser.add_argument("--locale", type=Path, default=Path("scminer-local/data/names.zh-CN.json"))
    parser.add_argument("--expected-count", type=int, default=1607)
    args = parser.parse_args()

    if args.input is None:
        imports = sorted(Path("scminer-local/imports/scmdb").glob("scmdb-public-fabricator-*.json"), key=lambda path: path.stat().st_mtime)
        if not imports:
            raise SystemExit("No SCMDB capture found in scminer-local/imports/scmdb.")
        args.input = imports[-1]
    capture = json.loads(args.input.read_text(encoding="utf-8"))
    if capture.get("format") != "scmdb-public-fabricator-capture-v1":
        raise SystemExit("Unsupported capture format; export again using the SCMDB public-page helper.")

    lookup = mineral_lookup(args.locale)
    blueprints = []
    errors = []
    for index, card in enumerate(capture.get("cards", []), start=1):
        try:
            blueprint = parse_card(card.get("raw_text", ""), index)
        except ValueError as error:
            errors.append({"index": index, "error": str(error), "raw_text": card.get("raw_text", "")})
            continue
        for material in blueprint["materials"]:
            material["mineral"] = lookup.get(material["name"].casefold())
        blueprints.append(blueprint)

    slot_counts = Counter(material["slot"] for item in blueprints for material in item["materials"])
    material_count = sum(len(item["materials"]) for item in blueprints)
    known_mineral_count = sum(1 for item in blueprints for material in item["materials"] if material["mineral"])
    output = {
        "schema_version": 1,
        "source": {
            "site": "SCMDB",
            "mode": "user-exported-public-rendered-page",
            "source_url": capture.get("source_url"),
            "captured_at": capture.get("captured_at"),
            "imported_at": datetime.now(timezone.utc).isoformat(),
            "expected_public_count": args.expected_count,
            "captured_count": len(capture.get("cards", [])),
            "coverage_note": "The public page count is a visual reference. This file contains only cards observed by the user-initiated capture.",
        },
        "counts": {
            "blueprints": len(blueprints),
            "materials": material_count,
            "materials_matching_mining_locale": known_mineral_count,
            "unparsed_cards": len(errors),
        },
        "slot_counts": dict(sorted(slot_counts.items())),
        "blueprints": blueprints,
        "unparsed_cards": errors,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(blueprints)} blueprints and {material_count} material slots to {args.output}")
    print(f"Matched {known_mineral_count} slots to the mining mineral locale; unparsed cards: {len(errors)}")


if __name__ == "__main__":
    main()
