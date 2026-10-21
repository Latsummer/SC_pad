#!/usr/bin/env python3
"""Refresh local blueprint asset URLs and PWA cache after an offline build."""
import hashlib
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
ASSETS=('styles.css','app.js','app-data.js','blueprint-index.js','blueprints-data.js','blueprint-locale.js','blueprint-quality-model.js','blueprint-quality.js','blueprints.js')


def refresh(dist):
    versions={name:hashlib.sha256((dist/name).read_bytes()).hexdigest()[:12] for name in ASSETS}
    for name in ('index.html','blueprints.html'):
        page=dist/name
        text=page.read_text()
        for asset,digest in versions.items():
            text=re.sub(r'((?:src|href)=")'+re.escape(asset)+r'(?:\?[^"\s]*)?"',lambda match:match[1]+asset+'?v='+digest+'"',text)
        page.write_text(text)
    sw=dist/'sw.js'
    text=sw.read_text()
    match=re.search(r'const APP_SHELL = (\[[\s\S]*?\]);',text)
    if not match:raise ValueError('Cannot find APP_SHELL')
    shell=json.loads(match[1])
    shell=[url for url in shell if not ('?' in url and url.split('?')[0].removeprefix('./') in ASSETS)]
    for name,digest in versions.items():
        for url in ('./'+name,'./'+name+'?v='+digest):
            if url not in shell:shell.append(url)
    text=text[:match.start(1)]+json.dumps(shell,ensure_ascii=False,indent=2)+text[match.end(1):]
    digest=hashlib.sha256(b''.join((dist/name).read_bytes() for name in (*ASSETS,'index.html','blueprints.html'))).hexdigest()[:16]
    text=re.sub(r'const CACHE_NAME = "[^"]+";',f'const CACHE_NAME = "xinghang-assistant-{digest}";',text)
    sw.write_text(text)
    print('Refreshed blueprint asset URLs and PWA cache:',digest)


if __name__=='__main__':refresh(ROOT/'scminer-local/dist')
