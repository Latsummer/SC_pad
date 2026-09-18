#!/usr/bin/env python3
"""Build the local SCMINER search dataset from three public page artifacts.

The script performs no network requests. Download the two public HTML pages and
the static Next.js chunk containing the mineral payload, then pass their paths
to this tool. This keeps refreshes explicit and makes it easy to cache sources.
"""

from __future__ import annotations

import argparse
import ast
import csv
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata


METHOD_HEADERS = {
    "Ship Laser Ores (": "ship",
    "ROC Vehicle Gems (": "roc",
    "FPS Hand Gems (": "fps",
}

CATEGORY_TO_METHOD = {
    "ship": "ship",
    "vehicle": "roc",
    "fps": "fps",
}

ROC_GEMS = {"Hadanite", "Aphorite", "Dolivine", "Feynmaline", "Glacosite", "Beradom"}
FPS_GEMS = {"Janalite", "Hadanite", "Aphorite", "Dolivine", "Jaclium", "Sadaryx", "Saldynium"}


def mining_methods(name: str, category: str) -> list[str]:
    if category == "ship":
        return ["ship"]
    methods = []
    if name in ROC_GEMS:
        methods.append("roc")
    if name in FPS_GEMS:
        methods.append("fps")
    return methods or [CATEGORY_TO_METHOD[category]]


class VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self.skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self.skip_depth:
            self.skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.skip_depth and data.strip():
            self.parts.append(" ".join(data.split()))


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")


def parse_number(value: str) -> float | None:
    value = value.replace(",", "").strip()
    if value in {"", "-", "N/A"}:
        return None
    return float(value)


def parse_mineral_reference(value: str | None) -> str | None:
    if value in {None, "", "-", "N/A"}:
        return None
    return value


def extract_mineral_payload(chunk_text: str) -> dict:
    pattern = re.compile(r"JSON\.parse\(('(?:\\.|[^'])*')\)")
    for match in pattern.finditer(chunk_text):
        decoded = ast.literal_eval(match.group(1))
        candidate = json.loads(decoded)
        if isinstance(candidate, dict) and isinstance(candidate.get("minerals"), list):
            return candidate
    raise ValueError("No SCMINER mineral JSON payload found in the supplied chunk")


def parse_location_page(html: str) -> tuple[list[dict], dict[tuple[str, str, str], float]]:
    parser = VisibleTextParser()
    parser.feed(html)
    tokens = parser.parts
    locations: list[dict] = []
    displayed_abundance: dict[tuple[str, str, str], float] = {}

    for orbit_index, token in enumerate(tokens):
        if token != "Orbit:":
            continue
        end = tokens.index("Scan Log", orbit_index)
        part = tokens[orbit_index:end]
        first_method = next((i for i, item in enumerate(part) if item in METHOD_HEADERS), len(part))
        environments = part[5:first_method]
        location = {
            "id": slugify(tokens[orbit_index - 1]),
            "name": tokens[orbit_index - 1],
            "orbit": part[1],
            "system": part[2].title(),
            "body_type": part[3],
            "gravity": part[4],
            "environment": environments,
        }
        locations.append(location)

        cursor = first_method
        while cursor < len(part):
            header = part[cursor]
            if header not in METHOD_HEADERS:
                cursor += 1
                continue
            method = METHOD_HEADERS[header]
            count = int(part[cursor + 1])
            cursor += 4  # header, count, closing parenthesis, equipment label
            for _ in range(count):
                mineral_name, value, unit = part[cursor : cursor + 3]
                if unit != "%":
                    raise ValueError(f"Unexpected abundance sequence: {part[cursor:cursor + 3]}")
                displayed_abundance[(location["name"], mineral_name, method)] = float(value)
                cursor += 3

    if len(locations) != 53:
        raise ValueError(f"Expected 53 location cards, found {len(locations)}")
    return locations, displayed_abundance


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def build_dataset(payload: dict, location_html: str, retrieved_at: str) -> tuple[dict, list[dict], list[dict], list[dict]]:
    locations, displayed_abundance = parse_location_page(location_html)
    location_ids = {location["name"]: location["id"] for location in locations}

    minerals: list[dict] = []
    distributions: list[dict] = []
    signatures: list[dict] = []
    unmatched_locations: set[str] = set()

    for raw in payload["minerals"]:
        mineral_id = slugify(raw["name"])
        methods = mining_methods(raw["name"], raw["category"])
        source_method = CATEGORY_TO_METHOD[raw["category"]]
        price_amount = parse_number(str(raw["props"].get("value", "")))
        price_unit = "aUEC/SCU" if source_method == "ship" else "aUEC/unit"
        scan_supported = source_method == "ship" and (raw.get("scanSignature") or 0) > 0
        scan_values = raw["values"] if scan_supported else []
        secondary = parse_mineral_reference(raw["props"].get("secondary"))
        tertiary = parse_mineral_reference(raw["props"].get("tertiary"))
        if scan_supported:
            expected_values = [raw["scanSignature"] * count for count in range(1, len(scan_values) + 1)]
            if scan_values != expected_values:
                raise ValueError(f"Unexpected signature sequence for {raw['name']}: {scan_values}")
        mineral = {
            "id": mineral_id,
            "name": raw["name"],
            "category": raw["category"],
            "mining_methods": methods,
            "source_category": raw["category"],
            "tier": raw["tier"],
            "price": {
                "amount": price_amount,
                "unit": price_unit,
                "scu_equivalent": price_amount if source_method == "ship" or price_amount is None else price_amount * 1000,
                "basis": "SCMINER server base",
            },
            "scan": {
                "supported_by_signature_scanner": scan_supported,
                "base_signature": raw.get("scanSignature") if scan_supported else None,
                "unit_signature": raw.get("scanSignature") if scan_supported else None,
                "rule": "unit_signature * rock_count" if scan_supported else None,
                "same_mineral_cluster": True if scan_supported else None,
                "maximum_indexed_rock_count": len(scan_values) if scan_supported else 0,
                "cluster_signatures": scan_values,
            },
            "composition": {
                "secondary": secondary,
                "tertiary": tertiary,
                "associated_minerals": [
                    {
                        "role": role,
                        "mineral_id": slugify(name),
                        "mineral": name,
                    }
                    for role, name in (("secondary", secondary), ("tertiary_trace", tertiary))
                    if name is not None
                ],
            },
            "properties": {
                "instability": raw["props"].get("instability"),
                "resistance": raw["props"].get("resistance"),
                "density": raw["props"].get("density"),
            },
            "raw_stats": raw.get("rawStats", {}),
        }
        minerals.append(mineral)

        if scan_supported:
            for rock_count, signature in enumerate(scan_values, start=1):
                signatures.append(
                    {
                        "signature": signature,
                        "unit_signature": raw["scanSignature"],
                        "mineral_id": mineral_id,
                        "mineral": raw["name"],
                        "rock_count": rock_count,
                    }
                )

        for system_key, entries in raw.get("locations", {}).items():
            for entry in entries:
                name = entry["name"]
                if name not in location_ids:
                    unmatched_locations.add(name)
                    continue
                abundance = float(entry["abundance"])
                distributions.append(
                    {
                        "location_id": location_ids[name],
                        "location": name,
                        "system": system_key.title(),
                        "mineral_id": mineral_id,
                        "mineral": raw["name"],
                        "mining_methods": methods,
                        "abundance": abundance,
                        "display_percent": displayed_abundance.get((name, raw["name"], source_method)),
                        "available": abundance > 0,
                    }
                )

    if unmatched_locations:
        raise ValueError(f"Mineral payload contains unknown locations: {sorted(unmatched_locations)}")

    minerals.sort(key=lambda item: item["name"])
    locations.sort(key=lambda item: item["name"])
    distributions.sort(key=lambda item: (item["location"], item["mineral"]))
    signatures.sort(key=lambda item: (item["signature"], item["mineral"], item["rock_count"]))

    dataset = {
        "schema_version": 1,
        "source": {
            "site": "SCMINER",
            "mineral_directory": "https://scminer.rocks/data/mineral-directory",
            "ore_by_location": "https://scminer.rocks/data/ore-by-location",
            "signature_scanner": "https://scminer.rocks/data/signature-scanner",
            "retrieved_at": retrieved_at,
            "robots_policy_observed": "Public pages allowed; /api/ excluded",
        },
        "game_data_version": payload.get("version"),
        "source_updated_at": payload.get("updatedAt"),
        "notes": {
            "abundance": "Source telemetry used for ranking; display_percent is the rounded value shown on the location page.",
            "price": "Static SCMINER server-base price, not live UEX pricing.",
            "signature": "For ship-mined ores, observed signature = unit_signature × same-mineral rock count. Exact collisions may produce multiple candidates.",
            "availability": "Rows with abundance 0 are retained but marked unavailable.",
        },
        "counts": {
            "minerals": len(minerals),
            "locations": len(locations),
            "distributions": len(distributions),
            "signature_rows": len(signatures),
        },
        "minerals": minerals,
        "locations": locations,
        "distributions": distributions,
        "signature_index": signatures,
    }
    return dataset, minerals, distributions, signatures


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--chunk", required=True, type=Path)
    parser.add_argument("--locations-html", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--retrieved-at", default=datetime.now(timezone.utc).isoformat())
    args = parser.parse_args()

    payload = extract_mineral_payload(args.chunk.read_text(encoding="utf-8"))
    dataset, minerals, distributions, signatures = build_dataset(
        payload,
        args.locations_html.read_text(encoding="utf-8"),
        args.retrieved_at,
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "scminer-data.json").write_text(
        json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    mineral_rows = []
    for item in minerals:
        mineral_rows.append(
            {
                "id": item["id"],
                "name": item["name"],
                "mining_methods": "|".join(item["mining_methods"]),
                "tier": item["tier"],
                "price": item["price"]["amount"],
                "price_unit": item["price"]["unit"],
                "scu_equivalent": item["price"]["scu_equivalent"],
                "base_signature": item["scan"]["base_signature"],
                "secondary_ore": item["composition"]["secondary"],
                "tertiary_trace": item["composition"]["tertiary"],
                "instability": item["properties"]["instability"],
                "resistance": item["properties"]["resistance"],
                "density": item["properties"]["density"],
            }
        )
    write_csv(
        args.output_dir / "minerals.csv",
        mineral_rows,
        ["id", "name", "mining_methods", "tier", "price", "price_unit", "scu_equivalent", "base_signature", "secondary_ore", "tertiary_trace", "instability", "resistance", "density"],
    )
    write_csv(
        args.output_dir / "distributions.csv",
        distributions,
        ["location_id", "location", "system", "mineral_id", "mineral", "mining_methods", "abundance", "display_percent", "available"],
    )
    write_csv(
        args.output_dir / "signatures.csv",
        signatures,
        ["signature", "unit_signature", "mineral_id", "mineral", "rock_count"],
    )

    print(json.dumps(dataset["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
