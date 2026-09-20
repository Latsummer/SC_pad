#!/usr/bin/env python3
"""Bundle canonical data and editable translations for the offline static site."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--locale", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    dataset = json.loads(args.dataset.read_text(encoding="utf-8"))
    locale = json.loads(args.locale.read_text(encoding="utf-8"))
    script = (
        "window.SCMINER_DATA = "
        + json.dumps(dataset, ensure_ascii=False, separators=(",", ":"))
        + ";\nwindow.SCMINER_LOCALE = "
        + json.dumps(locale, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(script, encoding="utf-8")
    print(f"wrote {args.output} ({len(script)} bytes)")


if __name__ == "__main__":
    main()
