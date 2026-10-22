#!/usr/bin/env python3
"""Refresh local blueprint asset URLs and PWA cache after an offline build."""
import hashlib
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
ASSETS=('missions/index.json','missions/blueprint-sources.json','missions.js','missions.css','theme.js','styles.css','app.js','app-data.js','blueprint-index.js','blueprints-data.js','blueprint-locale.js','blueprint-quality-model.js','blueprint-quality.js','blueprints.js')


def refresh(dist):
    # Data hashes must be embedded before hashing their consuming scripts.
    for asset,consumers in {'missions/index.json':['missions.js'],'missions/blueprint-sources.json':['blueprints.js']}.items():
        digest=hashlib.sha256((dist/asset).read_bytes()).hexdigest()[:12]
        for consumer in consumers:
            page=dist/consumer
            page.write_text(re.sub(r"fetch\('"+re.escape(asset)+r"(?:\?[^']*)?'\)","fetch('"+asset+'?v='+digest+"')",page.read_text()))
    versions={name:hashlib.sha256((dist/name).read_bytes()).hexdigest()[:12] for name in ASSETS}
    for name in ('index.html','blueprints.html','missions.html'):
        page=dist/name
        text=page.read_text()
        for asset,digest in versions.items():
            text=re.sub(r'((?:src|href)=")'+re.escape(asset)+r'(?:\?[^"\s]*)?"',lambda match:match[1]+asset+'?v='+digest+'"',text)
        page.write_text(text)
    sw=dist/'sw.js'
    text=sw.read_text()
    match=re.search(r'const APP_SHELL = (\[[\s\S]*?\]);',text)
    if not match:raise ValueError('Cannot find APP_SHELL')
    # Keep one canonical URL per asset, including the exact HTML script versions.
    shell=['./','./index.html','./blueprints.html','./missions.html','./manifest.webmanifest','./icons/icon.svg?v=xinghang-2','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png?v=xinghang-2']
    shell+=['./'+name+'?v='+digest for name,digest in versions.items()]
    text=text[:match.start(1)]+json.dumps(shell,ensure_ascii=False,indent=2)+text[match.end(1):]
    worker=re.sub(r'const CACHE_NAME = \"[^\"]+\";', 'const CACHE_NAME = \"release\";',text)
    digest=hashlib.sha256(worker.encode()+b''.join((dist/name).read_bytes() for name in (*ASSETS,'index.html','blueprints.html','missions.html'))).hexdigest()[:16]
    text=re.sub(r'const CACHE_NAME = "[^"]+";',f'const CACHE_NAME = "xinghang-assistant-{digest}";',text)
    sw.write_text(text)
    print('Refreshed blueprint asset URLs and PWA cache:',digest)


if __name__=='__main__':refresh(ROOT/'scminer-local/dist')
