"""Export the trained detector for the phone.

  python export.py --weights runs/detect/strip-regions/weights/best.pt --imgsz 960

Writes:
  * TFLite (Android; also usable on iPhone via react-native-fast-tflite) — float16, small and fast
  * Core ML (iPhone) — only on macOS, where coremltools is supported
Copy the files into the app's assets/models/ folder.
"""
from __future__ import annotations

import argparse
import platform
from pathlib import Path

from ultralytics import YOLO


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", type=Path, required=True)
    ap.add_argument("--imgsz", type=int, default=960)
    a = ap.parse_args()
    model = YOLO(str(a.weights))
    out = model.export(format="tflite", imgsz=a.imgsz, half=True, nms=True)
    print(f"TFLite: {out}")
    if platform.system() == "Darwin":
        out = model.export(format="coreml", imgsz=a.imgsz, half=True, nms=True)
        print(f"Core ML: {out}")
    else:
        print("Core ML export needs a Mac; the TFLite model also runs on iPhone.")


if __name__ == "__main__":
    main()
