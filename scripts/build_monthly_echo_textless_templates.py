from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "monthly-echo"


# Coordinates use each 941 x 1672 reference image. Only text-bearing regions are
# included so photographs, flowers, tape, rings, paths, and paper edges stay intact.
TEMPLATES: dict[str, list[tuple[int, int, int, int]]] = {
    "monthly-echo-story-reference.png": [
        (100, 105, 560, 350),
        (100, 365, 610, 485),
        (125, 495, 820, 680),
        (100, 700, 620, 930),
        (100, 955, 610, 1090),
        (105, 1090, 835, 1275),
        (295, 1290, 795, 1570),
    ],
    "monthly-echo-map-reference.png": [
        (95, 290, 720, 475),
        (115, 545, 445, 790),
        (545, 690, 835, 920),
        (225, 940, 545, 1215),
        (175, 1280, 805, 1580),
    ],
    "monthly-echo-moments-reference.png": [
        (120, 255, 665, 610),
        (120, 650, 665, 995),
        (120, 1030, 665, 1345),
        (215, 1400, 715, 1595),
    ],
    "monthly-echo-actions-reference.png": [
        (285, 250, 805, 1215),
        (295, 1220, 805, 1545),
    ],
    "monthly-echo-theme-reference.png": [
        (155, 70, 650, 365),
        (125, 380, 825, 545),
        (175, 540, 790, 950),
        (155, 960, 690, 1155),
        (125, 1145, 825, 1335),
        (235, 1360, 730, 1590),
    ],
    "monthly-echo-letter-reference.png": [
        (155, 145, 455, 235),
        (155, 230, 555, 1340),
        (280, 1340, 760, 1515),
        (615, 1510, 805, 1585),
    ],
}


def remove_text(source: Path, regions: list[tuple[int, int, int, int]]) -> Image.Image:
    image = Image.open(source).convert("RGB")
    pixels = np.asarray(image).astype(np.float32)
    repaired = pixels.copy()
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    rng = np.random.default_rng(20260712)

    for left, top, right, bottom in regions:
        roi = pixels[top:bottom, left:right]
        luminance = roi.mean(axis=2)
        paper = roi[luminance > 170]
        color = np.median(paper, axis=0) if len(paper) else np.median(roi.reshape(-1, 3), axis=0)
        noise = rng.normal(0, 1.35, size=roi.shape)
        repaired[top:bottom, left:right] = color + noise
        draw.rounded_rectangle((left, top, right, bottom), radius=18, fill=255)

    alpha = mask.filter(ImageFilter.GaussianBlur(6))
    return Image.composite(Image.fromarray(np.clip(repaired, 0, 255).astype(np.uint8)), image, alpha)


def main() -> None:
    for filename, regions in TEMPLATES.items():
        source = ASSET_DIR / filename
        target = ASSET_DIR / filename.replace("-reference.png", "-textless-v2.png")
        remove_text(source, regions).save(target, optimize=True)
        print(target.relative_to(ROOT))


if __name__ == "__main__":
    main()
