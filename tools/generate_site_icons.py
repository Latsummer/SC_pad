#!/usr/bin/env python3
"""Generate Xinghang navigation insignia SVG and PWA PNGs (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / 'scminer-local/dist/icons'
BACKGROUND = '#101820'
# Shared vector primitives keep SVG and raster versions identical.
POLYGONS = [
    ('#f2c365', [(256,130),(256,300),(163,349),(188,278)]),
    ('#b77a2e', [(256,130),(324,278),(349,349),(256,300)]),
    ('#ffe9ac', [(256,130),(266,259),(256,280),(246,259)]),
    ('#6bdbe3', [(256,332),(269,347),(256,362),(243,347)]),
]
LINES = [
    ('#315460', 7, [(220,91),(174,91),(91,174),(91,222)]),
    ('#315460', 7, [(292,91),(338,91),(421,174),(421,222)]),
    ('#315460', 7, [(91,290),(91,338),(174,421),(222,421)]),
    ('#315460', 7, [(421,290),(421,338),(338,421),(290,421)]),
    ('#70dce4', 8, [(91,197),(91,174),(121,144)]),
    ('#70dce4', 8, [(391,368),(421,338),(421,315)]),
    ('#dca84e', 7, [(197,421),(174,421),(144,391)]),
    ('#dca84e', 7, [(315,91),(338,91),(368,121)]),
    ('#5d818b', 4, [(123,256),(147,256)]),
    ('#5d818b', 4, [(365,256),(389,256)]),
    ('#5d818b', 4, [(256,93),(256,107)]),
    ('#5d818b', 4, [(256,391),(256,409)]),
    ('#dca84e', 5, [(208,378),(256,402),(304,378)]),
]


def points(values):
    return ' '.join(f'{x},{y}' for x,y in values)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    shapes = [f'<rect width="512" height="512" fill="{BACKGROUND}"/>']
    shapes += [f'<polyline points="{points(p)}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linejoin="bevel"/>' for c,w,p in LINES]
    shapes += [f'<polygon points="{points(p)}" fill="{c}"/>' for c,p in POLYGONS]
    (ROOT / 'icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n'+'\n'.join(shapes)+'\n</svg>\n')
    scale = 4
    image = Image.new('RGB', (512*scale,512*scale), BACKGROUND)
    draw = ImageDraw.Draw(image)
    for color,width,vertices in LINES:
        draw.line([(x*scale,y*scale) for x,y in vertices],fill=color,width=width*scale,joint='curve')
    for color,vertices in POLYGONS:
        draw.polygon([(x*scale,y*scale) for x,y in vertices],fill=color)
    for name,size in [('icon-192.png',192),('icon-512.png',512),('apple-touch-icon.png',180)]:
        image.resize((size,size),Image.Resampling.LANCZOS).save(ROOT / name)


if __name__ == '__main__':
    main()
