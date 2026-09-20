#!/usr/bin/env python3
"""Generate a drag-to-bookmarks page for the public SCMDB capture helper."""

from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import quote


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    code = args.source.read_text(encoding="utf-8")
    bookmarklet = "javascript:" + quote(code, safe="()[]{}:;,.!~=+-*/?&|'")
    page = f"""<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SCMDB 公开页面采集助手</title>
<style>body{{max-width:680px;margin:48px auto;padding:0 22px;background:#071114;color:#e8f6f7;font:16px system-ui,sans-serif;line-height:1.65}}a{{display:inline-block;padding:12px 18px;border-radius:10px;background:#35d9e8;color:#031014;font-weight:800;text-decoration:none}}code{{padding:2px 5px;border-radius:4px;background:#10262a}}</style>
<h1>SCMDB 公开页面采集助手</h1>
<p>把下方按钮拖到浏览器收藏栏。它只读取 Fabricator 页面已经渲染出来的蓝图卡片，不直接访问 <code>/data/</code>。</p>
<p><a href="{bookmarklet}">启动 SCMDB 采集</a></p>
<ol><li>打开 SCMDB 的 Fabricator 页面，等待列表出现。</li><li>点击收藏栏中的“启动 SCMDB 采集”。</li><li>缓慢滚到底部，让页面逐段显示蓝图；右下角会显示已记录数量。</li><li>点击“导出”，把下载的 JSON 放入项目后交给导入器处理。</li></ol>
</html>
"""
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(page, encoding="utf-8")
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
