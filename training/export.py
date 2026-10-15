"""Export the trained detector for the phone.

  python export.py --weights runs/obb/strip-regions/weights/best.pt --imgsz 640

Writes a LiteRT (TFLite) model, float32, WITHOUT built-in NMS — the app decodes the raw output and does
rotated-box NMS itself (src/obb.ts), so it doesn't depend on how a given exporter version builds NMS.
The same file runs on Android and iPhone (react-native-fast-tflite). Then copies it to the app:
assets/models/strip-regions.tflite.

Output: one tensor [1, 4 + classes + 1, anchors] — centre x, y, width, height (0…1 of the input), a score per
class (brand, contents, strength, expiry), then the angle in radians. Input: [1, 3, size, size] float 0…1, RGB,
letterboxed with grey (114) padding.

Needs: pip install "litert-torch>=0.9.0" "ai-edge-litert>=2.1.4" (Linux x86-64 or macOS).
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from ultralytics import YOLO

APP_MODEL = Path(__file__).resolve().parent.parent / "assets" / "models" / "strip-regions.tflite"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", type=Path, required=True)
    ap.add_argument("--imgsz", type=int, default=640, help="must match the size the model was trained at")
    ap.add_argument("--no-copy", action="store_true", help="don't copy the model into the app")
    a = ap.parse_args()
    out = Path(YOLO(str(a.weights)).export(format="litert", imgsz=a.imgsz, nms=False))
    print(f"LiteRT model: {out} ({out.stat().st_size / 1e6:.1f} MB)")
    if not a.no_copy:
        APP_MODEL.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(out, APP_MODEL)
        print(f"Copied to {APP_MODEL}")


if __name__ == "__main__":
    main()
