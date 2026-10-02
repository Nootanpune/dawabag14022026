#!/usr/bin/env python3
"""Make the app's brand images from the owner's DAWA BAG logo (Sprint 35).

Run from mobile/:  python3 assets/brand/source/make_brand_assets.py <logo.pdf>
Needs: pymupdf (render the vector PDF / SVG) and pillow (compose icons).

Writes:
  assets/brand/logo.png (+ 2.0x/, 3.0x/)        in-app logo with tagline
  assets/brand/wordmark.png (+ 2.0x/, 3.0x/)    DAWA | BAG without tagline (app bar)
  android mipmap-*/ic_launcher.png               legacy launcher icon (Android 7)
  android mipmap-*/ic_launcher_foreground.png    adaptive icon foreground (8+)
  android mipmap-*/ic_launcher_monochrome.png    themed icon (13+)
  android drawable-*/splash_mark.png             Android 12+ splash icon
  android drawable-*/launch_logo.png             splash logo before Android 12
  ios AppIcon.appiconset/*.png, LaunchImage.imageset/*.png

The icon "mark" is the logo's bag shape only (teal + green pill and the green
handle, no letters), taken from paths 0-2 of the logo's SVG export.
"""
import io
import os
import re
import sys

import pymupdf
from PIL import Image, ImageDraw

TEAL = '#0397A6'   # DAWA (owner's PDF)
GREEN = '#87A959'  # BAG + handle (owner's PDF)
HERE = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
RES = os.path.join(MOBILE, 'android', 'app', 'src', 'main', 'res')
IOS = os.path.join(MOBILE, 'ios', 'Runner', 'Assets.xcassets')
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def mark_svg(colour_left=TEAL, colour_right=GREEN, letters=False):
    """The bag shape (with the white DAWA / BAG letters when [letters]), as SVG
    text from the logo's SVG export; the tagline is left out."""
    src = open(os.path.join(HERE, 'logo.svg'), encoding='utf-8').read()
    paths = re.findall(r'<path[^>]*/>', src)[:5 if letters else 3]
    paths[0] = re.sub(r'fill="[^"]*"', f'fill="{colour_left}"', paths[0])
    paths[1] = re.sub(r'fill="[^"]*"', f'fill="{colour_right}"', paths[1])
    paths[2] = re.sub(r'fill="[^"]*"', f'fill="{colour_right}"', paths[2])
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="239.344" height="110.5" '
            'viewBox="0 0 239.344 110.5">' + ''.join(paths) + '</svg>')


def render(doc_bytes, filetype, width_px):
    doc = pymupdf.open(stream=doc_bytes, filetype=filetype)
    page = doc[0]
    zoom = width_px / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=True)
    return Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGBA')


def mark(width_px, mono=False):
    svg = mark_svg('#FFFFFF', '#FFFFFF') if mono else mark_svg()
    return render(svg.encode(), 'svg', width_px)


def centred(canvas_px, img, bg=(0, 0, 0, 0)):
    out = Image.new('RGBA', (canvas_px, canvas_px), bg)
    out.alpha_composite(img, ((canvas_px - img.width) // 2, (canvas_px - img.height) // 2))
    return out


def save(img, path, rgb=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    (img.convert('RGB') if rgb else img).save(path, optimize=True)


def main(pdf_path):
    pdf = open(pdf_path, 'rb').read()

    # In-app logo, 240 logical px wide; wordmark (no tagline) for the app bar, 72 logical px wide
    for scale, sub in ((1, ''), (2, '2.0x'), (3, '3.0x')):
        save(render(pdf, 'pdf', 240 * scale), os.path.join(MOBILE, 'assets', 'brand', sub, 'logo.png'))
        save(render(mark_svg(letters=True).encode(), 'svg', 72 * scale),
             os.path.join(MOBILE, 'assets', 'brand', sub, 'wordmark.png'))

    for name, d in DENSITIES.items():
        px = lambda dp: int(round(dp * d))  # noqa: E731
        # Legacy icon (48 dp): white rounded square, mark 78 % wide
        icon = Image.new('RGBA', (px(48), px(48)), (0, 0, 0, 0))
        bg = Image.new('RGBA', icon.size, (255, 255, 255, 255))
        maskimg = Image.new('L', icon.size, 0)
        ImageDraw.Draw(maskimg).rounded_rectangle((0, 0, icon.width - 1, icon.height - 1), radius=px(10), fill=255)
        icon.paste(bg, (0, 0), maskimg)
        m = mark(px(37))
        icon.alpha_composite(m, ((icon.width - m.width) // 2, (icon.height - m.height) // 2))
        save(icon, os.path.join(RES, f'mipmap-{name}', 'ic_launcher.png'))
        # Adaptive foreground (108 dp canvas, mark 58 dp wide inside the 66 dp safe circle)
        save(centred(px(108), mark(px(58))), os.path.join(RES, f'mipmap-{name}', 'ic_launcher_foreground.png'))
        save(centred(px(108), mark(px(58), mono=True)), os.path.join(RES, f'mipmap-{name}', 'ic_launcher_monochrome.png'))
        # Android 12+ splash icon (288 dp canvas, content inside the 192 dp circle)
        save(centred(px(288), mark(px(168))), os.path.join(RES, f'drawable-{name}', 'splash_mark.png'))
        # Splash logo before Android 12 (200 dp wide)
        save(render(pdf, 'pdf', px(200)), os.path.join(RES, f'drawable-{name}', 'launch_logo.png'))

    # iOS app icons: opaque white square, mark 80 % wide
    appicon = os.path.join(IOS, 'AppIcon.appiconset')
    for f in os.listdir(appicon):
        m = re.match(r'Icon-App-([\d.]+)x[\d.]+@(\d)x\.png$', f)
        if not m:
            continue
        size = int(round(float(m.group(1)) * int(m.group(2))))
        img = centred(size, mark(max(1, int(size * 0.8))), (255, 255, 255, 255))
        save(img, os.path.join(appicon, f), rgb=True)

    # iOS launch image: logo 200 pt wide
    launch = os.path.join(IOS, 'LaunchImage.imageset')
    for scale, f in ((1, 'LaunchImage.png'), (2, 'LaunchImage@2x.png'), (3, 'LaunchImage@3x.png')):
        save(render(pdf, 'pdf', 200 * scale), os.path.join(launch, f))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'logo.pdf'))
