#!/usr/bin/env python3
"""Respectfully refresh the SCMINER dataset used by the offline site.

The sync only requests public pages that the site's current robots.txt permits:
the mineral directory, ore-by-location page, and the small set of first-party
Next.js chunks referenced by the mineral directory. Requests are serial, rate
limited, identified by a descriptive user agent, and saved as source snapshots.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Iterable
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from urllib import robotparser


BASE_URL = "https://scminer.rocks/"
USER_AGENT = "SCMinerLocalSync/1.0 (+offline personal mining reference; respects robots.txt)"
MAX_CHUNKS = 40
DATA_PAGES = ("data/mineral-directory", "data/ore-by-location")


class PoliteFetcher:
    def __init__(self, base_url: str, delay_seconds: float, user_agent: str) -> None:
        self.base_url = base_url.rstrip("/") + "/"
        self.delay_seconds = max(1.0, delay_seconds)
        self.user_agent = user_agent
        self.last_request_at = 0.0
        self.robots = robotparser.RobotFileParser()

    def check_robots(self) -> str:
        robots_url = urljoin(self.base_url, "robots.txt")
        text = self._request(robots_url, enforce_robots=False).decode("utf-8")
        self.robots.set_url(robots_url)
        self.robots.parse(text.splitlines())
        return text

    def fetch(self, url: str) -> bytes:
        if not self.robots.can_fetch(self.user_agent, url):
            raise PermissionError(f"robots.txt does not permit this request: {url}")
        return self._request(url, enforce_robots=True)

    def _request(self, url: str, enforce_robots: bool) -> bytes:
        if enforce_robots:
            wait_seconds = self.delay_seconds - (time.monotonic() - self.last_request_at)
            if wait_seconds > 0:
                time.sleep(wait_seconds)
        request = Request(url, headers={"User-Agent": self.user_agent, "Accept": "text/html,application/javascript,*/*;q=0.8"})
        with urlopen(request, timeout=45) as response:
            body = response.read()
        self.last_request_at = time.monotonic()
        return body


def first_party_chunk_urls(html: str, base_url: str) -> list[str]:
    srcs = re.findall(r'<script[^>]+\bsrc=["\']([^"\']+\.js(?:\?[^"\']*)?)["\']', html, flags=re.I)
    urls = []
    seen = set()
    for src in srcs:
        url = urljoin(base_url, src)
        parsed = urlparse(url)
        if parsed.netloc != urlparse(base_url).netloc or not parsed.path.startswith("/_next/static/chunks/"):
            continue
        if url not in seen:
            seen.add(url)
            urls.append(url)
    if not urls:
        raise ValueError("No first-party Next.js chunks were found in the mineral directory page")
    if len(urls) > MAX_CHUNKS:
        raise ValueError(f"Refusing to fetch {len(urls)} chunks; limit is {MAX_CHUNKS}")
    return urls


def snapshot_name(url: str, suffix: str) -> str:
    parsed = urlparse(url)
    stem = Path(parsed.path).name or "source"
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem)
    return f"{safe_stem}-{hashlib.sha256(url.encode()).hexdigest()[:12]}{suffix}"


def write_snapshot(directory: Path, name: str, content: bytes) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / name
    destination.write_bytes(content)
    return destination


def run(command: Iterable[str], cwd: Path) -> None:
    print("+", " ".join(command))
    subprocess.run(list(command), cwd=cwd, check=True)


def update_cache_name(service_worker: Path, app_data: Path) -> None:
    digest = hashlib.sha256(app_data.read_bytes()).hexdigest()[:12]
    updated_name = f"scminer-atlas-data-{digest}"
    source = service_worker.read_text(encoding="utf-8")
    updated, replacements = re.subn(r'const CACHE_NAME = "[^"]+";', f'const CACHE_NAME = "{updated_name}";', source, count=1)
    if replacements != 1:
        raise ValueError(f"Could not update CACHE_NAME in {service_worker}")
    service_worker.write_text(updated, encoding="utf-8")


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Refresh local SCMINER data without bypassing robots.txt")
    parser.add_argument("--base-url", default=BASE_URL)
    parser.add_argument("--delay", type=float, default=2.0, help="minimum seconds between requests; values below 1 become 1")
    parser.add_argument("--cache-dir", type=Path, default=repo_root / "scminer-local" / ".sync-cache")
    parser.add_argument("--dry-run", action="store_true", help="validate sources and extraction without replacing app data")
    args = parser.parse_args()

    site_root = repo_root / "scminer-local"
    data_dir = site_root / "data"
    dist_dir = site_root / "dist"
    scripts_dir = repo_root / "tools"
    cache_dir = args.cache_dir.resolve()
    snapshots_dir = cache_dir / "latest"

    fetcher = PoliteFetcher(args.base_url, args.delay, USER_AGENT)
    robots_text = fetcher.check_robots()
    page_urls = [urljoin(fetcher.base_url, page) for page in DATA_PAGES]
    for page_url in page_urls:
        if not fetcher.robots.can_fetch(USER_AGENT, page_url):
            raise PermissionError(f"robots.txt disallows required public page: {page_url}")

    mineral_html = fetcher.fetch(page_urls[0])
    locations_html = fetcher.fetch(page_urls[1])
    mineral_page_path = write_snapshot(snapshots_dir, "mineral-directory.html", mineral_html)
    locations_page_path = write_snapshot(snapshots_dir, "ore-by-location.html", locations_html)
    write_snapshot(snapshots_dir, "robots.txt", robots_text.encode("utf-8"))

    chunk_paths: list[Path] = []
    payload_chunk: Path | None = None
    from extract_scminer_data import extract_mineral_payload

    for chunk_url in first_party_chunk_urls(mineral_html.decode("utf-8"), fetcher.base_url):
        if not fetcher.robots.can_fetch(USER_AGENT, chunk_url):
            raise PermissionError(f"robots.txt disallows required static chunk: {chunk_url}")
        content = fetcher.fetch(chunk_url)
        chunk_path = write_snapshot(snapshots_dir, snapshot_name(chunk_url, ".js"), content)
        chunk_paths.append(chunk_path)
        try:
            extract_mineral_payload(content.decode("utf-8"))
        except ValueError:
            continue
        payload_chunk = chunk_path
        break

    if payload_chunk is None:
        raise ValueError("No referenced script chunk contained the SCMINER mineral payload; no local data was changed")

    run_metadata = {
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "base_url": fetcher.base_url,
        "user_agent": USER_AGENT,
        "delay_seconds": fetcher.delay_seconds,
        "pages": [str(mineral_page_path), str(locations_page_path)],
        "chunks_checked": [str(path) for path in chunk_paths],
        "payload_chunk": str(payload_chunk),
    }
    (cache_dir / "sync-metadata.json").parent.mkdir(parents=True, exist_ok=True)
    (cache_dir / "sync-metadata.json").write_text(json.dumps(run_metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    with tempfile.TemporaryDirectory(prefix="scminer-sync-", dir=repo_root) as temporary:
        staging_root = Path(temporary)
        staging_data = staging_root / "data"
        staging_locale = staging_data / "names.zh-CN.json"
        staging_app_data = staging_root / "app-data.js"
        staging_sw = staging_root / "sw.js"

        run(
            [sys.executable, str(scripts_dir / "extract_scminer_data.py"), "--chunk", str(payload_chunk), "--locations-html", str(locations_page_path), "--output-dir", str(staging_data)],
            repo_root,
        )
        shutil.copy2(data_dir / "names.zh-CN.json", staging_locale)
        run(
            [sys.executable, str(scripts_dir / "update_scminer_locale.py"), "--dataset", str(staging_data / "scminer-data.json"), "--output", str(staging_locale)],
            repo_root,
        )
        run(
            [sys.executable, str(scripts_dir / "build_scminer_site_data.py"), "--dataset", str(staging_data / "scminer-data.json"), "--locale", str(staging_locale), "--output", str(staging_app_data)],
            repo_root,
        )
        shutil.copy2(dist_dir / "sw.js", staging_sw)
        update_cache_name(staging_sw, staging_app_data)

        if args.dry_run:
            print("Dry run succeeded; staged data was discarded and current app files were unchanged.")
            return

        for name in ("scminer-data.json", "minerals.csv", "distributions.csv", "signatures.csv"):
            shutil.copy2(staging_data / name, data_dir / name)
        shutil.copy2(staging_locale, data_dir / "names.zh-CN.json")
        shutil.copy2(staging_app_data, dist_dir / "app-data.js")
        shutil.copy2(staging_sw, dist_dir / "sw.js")

    print(f"Sync complete. Source snapshots: {snapshots_dir}")


if __name__ == "__main__":
    main()
