#!/usr/bin/env python3
"""Build browser payloads from the locally imported SCMDB public capture."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scminer-local/data/scmdb-blueprints.json"
SLOT_LOCALE = ROOT / "scminer-local/data/blueprint-slots.zh-CN.json"
DIST = ROOT / "scminer-local/dist"


def write_js(path: Path, name: str, value: dict) -> None:
    path.write_text(f"window.{name} = {json.dumps(value, ensure_ascii=False, separators=(',', ':'))};\n", encoding="utf-8")


def main() -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    slot_locale = json.loads(SLOT_LOCALE.read_text(encoding="utf-8"))
    missing_slots = sorted(set(source["slot_counts"]) - set(slot_locale["slots"]))
    if missing_slots:
        raise SystemExit(f"Missing Chinese translations for blueprint slots: {', '.join(missing_slots)}")
    blueprints = []
    material_index: dict[str, int] = Counter()
    for item in source["blueprints"]:
        materials = []
        for material in item["materials"]:
            payload = {key: material.get(key) for key in ("slot", "name", "amount_scu", "amount_count", "mineral")}
            materials.append(payload)
            if payload["mineral"]:
                material_index[payload["mineral"]["id"]] += 1
        blueprints.append({
            key: item.get(key)
            for key in ("id", "name", "name_zh", "name_en", "category", "type_group", "type_subtype", "manufacturer", "size", "craft_time_seconds")
        } | {"materials": materials})

    payload = {
        "schema_version": 1,
        "source": source["source"],
        "counts": source["counts"],
        "slot_counts": source["slot_counts"],
        "blueprints": blueprints,
    }
    index = {"byMineral": dict(sorted(material_index.items())), "blueprintCount": len(blueprints)}
    write_js(DIST / "blueprints-data.js", "SCMDB_BLUEPRINTS", payload)
    write_js(DIST / "blueprint-index.js", "SCMDB_BLUEPRINT_INDEX", index)
    write_js(DIST / "blueprint-locale.js", "SCMDB_BLUEPRINT_LOCALE", slot_locale)
    print(f"Built {len(blueprints)} browser blueprints and {len(material_index)} mineral links")


if __name__ == "__main__":
    main()
