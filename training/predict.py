"""Try the trained detector on new photos: draws the brand / contents / strength rotated boxes it finds.

  python predict.py --weights runs/obb/strip-regions/weights/best.pt --images new_photos/
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

COLORS = {"brand": (40, 160, 40), "contents": (200, 120, 0), "strength": (30, 30, 220), "expiry": (180, 40, 180)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", type=Path, required=True)
    ap.add_argument("--images", type=Path, required=True)
    ap.add_argument("--imgsz", type=int, default=960)
    ap.add_argument("--conf", type=float, default=0.25)
    ap.add_argument("--out", type=Path, default=Path("predictions"))
    a = ap.parse_args()
    a.out.mkdir(exist_ok=True)
    model = YOLO(str(a.weights))
    for img_path in sorted(p for p in a.images.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}):
        img = cv2.imread(str(img_path))
        r = model.predict(img, imgsz=a.imgsz, conf=a.conf, verbose=False)[0]
        found = []
        boxes = r.obb if r.obb is not None else r.boxes  # rotated-box model, or an older upright-box one
        quads = boxes.xyxyxyxy.tolist() if r.obb is not None else [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]] for x0, y0, x1, y1 in boxes.xyxy.tolist()]
        for quad, c, s in zip(quads, boxes.cls.tolist(), boxes.conf.tolist()):
            name = model.names[int(c)]
            found.append(f"{name} {s:.2f}")
            col = COLORS.get(name, (0, 0, 0))
            pts = np.array(quad, dtype=np.int32).reshape(-1, 1, 2)
            cv2.polylines(img, [pts], True, col, max(2, img.shape[1] // 400))
            x0, y0 = pts[:, 0, :].min(axis=0)
            cv2.putText(img, f"{name} {s:.2f}", (int(x0), max(14, int(y0) - 6)), cv2.FONT_HERSHEY_SIMPLEX, max(0.5, img.shape[1] / 1600), col, 2)
        cv2.imwrite(str(a.out / img_path.name), img)
        print(f"{img_path.name}: {', '.join(found) or 'nothing found'}")


if __name__ == "__main__":
    main()
