"""Draw what each scan step saw onto exported photos, to see why a scan failed.

  python review.py --export ~/Downloads/medsync-training
  python review.py --export ~/Downloads/medsync-training --only-failed

For every photo in images/ and unlabelled/ it draws:
  * the region detector's boxes (predictions/<stem>.txt) — dashed, with class and confidence; cropped-and-read
    areas are listed in scans/<stem>.txt
  * the labels (labels/<stem>.txt) when there are any — solid
and puts the text read at each step (scans/<stem>.txt) in a side panel. Results go to review/.

Reading the result:
  * no box on the name or strength          → step 1 (finding) failed: label the photo and retrain the detector
  * a box in the right place, wrong text     → step 2 (reading) failed: glare, blur, too small — or a reader problem
  * right text, still not matched            → the medicine's saved name/strength, or the matching rules
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

from regions import CLASSES

COLORS = {"brand": (40, 160, 40), "contents": (200, 120, 0), "strength": (30, 30, 220), "expiry": (180, 40, 180)}


def read_boxes(path: Path) -> list[tuple[str, list[tuple[float, float]], float | None]]:
    out = []
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        v = line.split()
        if len(v) < 9:
            continue
        pts = [(float(v[1 + 2 * i]), float(v[2 + 2 * i])) for i in range(4)]
        out.append((CLASSES[int(v[0])], pts, float(v[9]) if len(v) > 9 else None))
    return out


def dashed(img, pts, color, th):
    for i in range(4):
        a, b = np.array(pts[i]), np.array(pts[(i + 1) % 4])
        n = max(2, int(np.linalg.norm(b - a) / 14))
        for k in range(0, n, 2):
            p, q = a + (b - a) * k / n, a + (b - a) * min(n, k + 1) / n
            cv2.line(img, tuple(int(x) for x in p), tuple(int(x) for x in q), color, th)


def render(img_path: Path, root: Path, out_dir: Path):
    img = cv2.imread(str(img_path))
    if img is None:
        return
    h, w = img.shape[:2]
    th = max(2, w // 450)
    stem = img_path.stem
    for cls, pts, _ in read_boxes(root / "labels" / f"{stem}.txt"):
        poly = np.array([(x * w, y * h) for x, y in pts], dtype=np.int32).reshape(-1, 1, 2)
        cv2.polylines(img, [poly], True, COLORS[cls], th)
    for cls, pts, score in read_boxes(root / "predictions" / f"{stem}.txt"):
        px = [(x * w, y * h) for x, y in pts]
        dashed(img, px, COLORS[cls], th)
        tag = f"{cls} {score:.2f}" if score is not None else cls
        x, y = int(px[0][0]), max(20, int(px[0][1]) - 6)
        cv2.putText(img, tag, (x, y), cv2.FONT_HERSHEY_SIMPLEX, max(0.6, w / 1600), COLORS[cls], max(1, th - 1))
    # Side panel with the text read at each step.
    scan = root / "scans" / f"{stem}.txt"
    lines = scan.read_text().splitlines() if scan.exists() else ["(no scan details — photo saved before ios-28 / build-31)"]
    panel_w = int(w * 0.75)
    panel = np.full((h, panel_w, 3), 255, np.uint8)
    fs = max(0.45, h / 2600)
    lh = int(28 * fs / 0.6)
    y = lh
    for line in lines:
        if y > h - 4:
            cv2.putText(panel, "…", (10, y), cv2.FONT_HERSHEY_SIMPLEX, fs, (0, 0, 0), 1)
            break
        bold = line.startswith(("Step", "Region", "Medicine", "Photo"))
        cv2.putText(panel, line[:90], (10, y), cv2.FONT_HERSHEY_SIMPLEX, fs, (0, 0, 0), 2 if bold else 1)
        y += lh
    both = np.hstack([img, panel])
    scale = 1800 / both.shape[1]
    cv2.imwrite(str(out_dir / f"{stem}.jpg"), cv2.resize(both, (int(both.shape[1] * scale), int(h * scale))), [cv2.IMWRITE_JPEG_QUALITY, 85])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", type=Path, required=True, help="unzipped MedSync training export")
    ap.add_argument("--only-failed", action="store_true", help="only photos in unlabelled/ (scans nobody confirmed)")
    a = ap.parse_args()
    out = a.export / "review"
    out.mkdir(exist_ok=True)
    folders = ["unlabelled"] if a.only_failed else ["images", "unlabelled"]
    n = 0
    for folder in folders:
        for p in sorted((a.export / folder).glob("*.jpg")):
            render(p, a.export, out)
            n += 1
    print(f"{n} photos drawn → {out}")


if __name__ == "__main__":
    main()
