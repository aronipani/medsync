"""Auto-label strip photos with brand / contents / strength boxes for YOLO.

Works on:
  * an unzipped MedSync export (images/ + manifest.json) — labels any photo that has no label file yet
  * a plain folder of photos, with --label "Monotrate 10" (one medicine per folder)

Reads every photo upright, upside down and sideways (RapidOCR, CPU), maps the boxes back onto the photo,
applies the same labelling rules as the app, writes labels/<stem>.txt and a preview with the boxes drawn.

  python autolabel.py --export ~/Downloads/medsync-training
  python autolabel.py --folder photos/monotrate --label "Monotrate 10"
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import cv2
import numpy as np
from rapidocr_onnxruntime import RapidOCR

from regions import CLASSES, Box, label_regions, to_yolo

COLORS = {"brand": (40, 160, 40), "contents": (200, 120, 0), "strength": (30, 30, 220)}
_ocr = RapidOCR()
TILE = 1100  # photos are read in overlapping tiles so the small print on foil gets enough pixels


def _read(img: np.ndarray) -> list[tuple[np.ndarray, str]]:
    """OCR one image, in overlapping tiles when it is large. Returns (4-point quad, text)."""
    h, w = img.shape[:2]
    out = []
    step = int(TILE * 0.75)
    ys = list(range(0, max(1, h - TILE // 4), step)) if h > TILE else [0]
    xs = list(range(0, max(1, w - TILE // 4), step)) if w > TILE else [0]
    for y0 in ys:
        for x0 in xs:
            tile = img[y0 : y0 + TILE, x0 : x0 + TILE]
            res, _ = _ocr(tile)
            for quad, text, score in res or []:
                if float(score) >= 0.5 and text.strip():
                    out.append((np.array(quad, dtype=float) + [x0, y0], text))
    return out


def read_boxes(img: np.ndarray) -> list[Box]:
    """Text lines with axis-aligned boxes on the original photo, from all four orientations."""
    h, w = img.shape[:2]
    out: list[Box] = []
    for k in range(4):  # k * 90 degrees counter-clockwise
        rot = np.ascontiguousarray(np.rot90(img, k))
        for quad, text in _read(rot):
            pts = _unrotate(quad, k, w, h)  # back onto the original photo
            x0, y0 = pts.min(axis=0)
            x1, y1 = pts.max(axis=0)
            out.append(Box(text=text, left=float(x0), top=float(y0), width=float(x1 - x0), height=float(y1 - y0)))
    return out


def _unrotate(pts: np.ndarray, k: int, w: int, h: int) -> np.ndarray:
    """Points on np.rot90(img, k) back to img coordinates (img is w x h)."""
    x, y = pts[:, 0], pts[:, 1]
    if k == 1:  # rot90 CCW: (x, y) -> (y, w - 1 - x)
        return np.stack([w - 1 - y, x], axis=1)
    if k == 2:
        return np.stack([w - 1 - x, h - 1 - y], axis=1)
    if k == 3:  # rot90 CW: (x, y) -> (h - 1 - y, x)
        return np.stack([y, h - 1 - x], axis=1)
    return pts


def parse_label(label: str) -> tuple[str, str]:
    m = re.match(r"^(.*?)\s+([\d.]+(?:\s*/\s*[\d.]+)*\s*(?:mg|mcg|k)?)$", label.strip(), re.I)
    return (m.group(1), m.group(2)) if m else (label.strip(), "")


def label_photo(path: Path, name: str, strength: str, contents: str | None, labels_dir: Path, previews_dir: Path) -> int:
    img = cv2.imread(str(path))
    if img is None:
        return 0
    cache = labels_dir.parent / "ocr" / f"{path.stem}.json"  # reading is slow; relabelling after a rule change is instant
    if cache.exists():
        boxes = [Box(**b) for b in json.loads(cache.read_text())]
    else:
        boxes = read_boxes(img)
        cache.parent.mkdir(exist_ok=True)
        cache.write_text(json.dumps([vars(b) for b in boxes]))
    ingredients = [re.sub(r"\d.*$", "", x).strip() for x in contents.split("+")] if contents else None
    regions = label_regions(boxes, name, strength, ingredients)
    h, w = img.shape[:2]
    (labels_dir / f"{path.stem}.txt").write_text(to_yolo(regions, w, h))
    prev = img.copy()
    for r in regions:
        c = COLORS[r.cls]
        cv2.rectangle(prev, (int(r.left), int(r.top)), (int(r.left + r.width), int(r.top + r.height)), c, max(2, w // 400))
    for r in regions:  # tags drawn after all boxes so none is hidden under another box
        c = COLORS[r.cls]
        fs, th = max(0.6, w / 1400), max(1, w // 700)
        (tw, tht), _ = cv2.getTextSize(r.cls, cv2.FONT_HERSHEY_SIMPLEX, fs, th)
        x, y = int(r.left), max(tht + 8, int(r.top) - 4)
        cv2.rectangle(prev, (x, y - tht - 6), (x + tw + 6, y + 2), c, -1)
        cv2.putText(prev, r.cls, (x + 3, y - 3), cv2.FONT_HERSHEY_SIMPLEX, fs, (255, 255, 255), th)
    scale = 1280 / max(w, h)
    cv2.imwrite(str(previews_dir / f"{path.stem}.jpg"), cv2.resize(prev, (int(w * scale), int(h * scale))), [cv2.IMWRITE_JPEG_QUALITY, 85])
    counts = {c: sum(r.cls == c for r in regions) for c in CLASSES}
    print(f"{path.name}: {counts}")
    for r in sorted(regions, key=lambda r: CLASSES.index(r.cls)):
        print(f"    {r.cls:9s} {r.text}")
    return len(regions)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", type=Path, help="unzipped MedSync export (images/, manifest.json)")
    ap.add_argument("--folder", type=Path, help="folder of photos of one medicine")
    ap.add_argument("--label", help='medicine and strength for --folder, e.g. "Monotrate 10"')
    ap.add_argument("--redo", action="store_true", help="relabel photos that already have a label file")
    a = ap.parse_args()

    if a.export:
        root = a.export
        manifest = json.loads((root / "manifest.json").read_text())
        labels, previews = root / "labels", root / "previews"
        labels.mkdir(exist_ok=True)
        previews.mkdir(exist_ok=True)
        for e in manifest:
            stem = re.sub(r"[\\/]+", "__", re.sub(r"\.jpg$", "", e["file"], flags=re.I))
            img = root / "images" / f"{stem}.jpg"
            if not img.exists() or ((labels / f"{stem}.txt").exists() and not a.redo):
                continue
            label_photo(img, e["name"], e["strength"], e.get("contents"), labels, previews)
    elif a.folder and a.label:
        name, strength = parse_label(a.label)
        labels, previews = a.folder / "labels", a.folder / "previews"
        labels.mkdir(exist_ok=True)
        previews.mkdir(exist_ok=True)
        for img in sorted(p for p in a.folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}):
            label_photo(img, name, strength, None, labels, previews)
    else:
        ap.error("use --export DIR, or --folder DIR --label 'Name strength'")


if __name__ == "__main__":
    main()
