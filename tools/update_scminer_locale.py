#!/usr/bin/env python3
"""Create or update the editable Simplified Chinese name catalog.

Existing Chinese names and aliases are preserved. New minerals and locations
from the canonical dataset are added with empty Chinese values.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def merge_entry(existing: dict, english_name: str) -> dict:
    return {
        "en": english_name,
        "zh": existing.get("zh", ""),
        "aliases_en": existing.get("aliases_en", []),
        "aliases_zh": existing.get("aliases_zh", []),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    dataset = json.loads(args.dataset.read_text(encoding="utf-8"))
    existing = {}
    if args.output.exists():
        existing = json.loads(args.output.read_text(encoding="utf-8"))

    old_minerals = existing.get("minerals", {})
    old_locations = existing.get("locations", {})
    catalog = {
        "schema_version": 1,
        "locale": "zh-CN",
        "display_format": "{zh} ({en})",
        "fallback_when_zh_empty": "{en}",
        "search_fields": ["en", "zh", "aliases_en", "aliases_zh"],
        "minerals": {
            item["id"]: merge_entry(old_minerals.get(item["id"], {}), item["name"])
            for item in dataset["minerals"]
        },
        "locations": {
            item["id"]: merge_entry(old_locations.get(item["id"], {}), item["name"])
            for item in dataset["locations"]
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"minerals={len(catalog['minerals'])} locations={len(catalog['locations'])}")


if __name__ == "__main__":
    main()
