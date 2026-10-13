"""Train a small YOLO-OBB detector (rotated boxes) that finds the brand, contents and strength areas on a strip.

  python train.py --data dataset/data.yaml                 # GPU if available, else CPU
  python train.py --data dataset/data.yaml --epochs 150 --imgsz 960

Rotated boxes fit tilted print tightly, where upright boxes on a slanted strip would swallow the neighbouring text.
Starts from pretrained YOLO11n-OBB weights (downloaded once) and fine-tunes. Augmentation is tuned for strips:
any rotation (strips are photographed every way up), strong brightness / contrast changes (glare),
perspective (tilted strips) and blur (shaky hands). No left-right flips — mirrored text doesn't occur.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--model", default="yolo11n-obb.pt", help="starting weights (yolo11n-obb.pt = nano rotated-box model, fastest on phones)")
    ap.add_argument("--epochs", type=int, default=120)
    ap.add_argument("--imgsz", type=int, default=960, help="small print needs a larger input than the usual 640")
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--device", default=None, help="'cpu', '0' for the first GPU, 'mps' on Apple silicon")
    ap.add_argument("--name", default="strip-regions")
    a = ap.parse_args()

    try:
        model = YOLO(a.model)
    except Exception as e:  # no internet for the pretrained weights: train from scratch (needs many more photos)
        print(f"Could not load {a.model} ({e}); training from scratch.")
        model = YOLO("yolo11n-obb.yaml")

    model.train(
        data=str(a.data),
        epochs=a.epochs,
        imgsz=a.imgsz,
        batch=a.batch,
        device=a.device,
        name=a.name,
        patience=40,
        # strips: every way up, glare, tilt — but never mirrored
        degrees=180,
        flipud=0.0,
        fliplr=0.0,
        perspective=0.0008,
        hsv_h=0.02,
        hsv_s=0.6,
        hsv_v=0.6,
        scale=0.5,
        translate=0.15,
        mosaic=1.0,
        close_mosaic=15,
        plots=True,
    )
    metrics = model.val(data=str(a.data), imgsz=a.imgsz, device=a.device)
    print("\nValidation (higher is better):")
    print(f"  mAP50     {metrics.box.map50:.3f}  (boxes in roughly the right place)")
    print(f"  mAP50-95  {metrics.box.map:.3f}  (boxes tightly placed)")
    for i, name in metrics.names.items():
        try:
            print(f"  {name:9s} precision {metrics.box.p[i]:.2f}  recall {metrics.box.r[i]:.2f}")
        except IndexError:
            pass
    print(f"\nBest weights: {Path(model.trainer.best).resolve()}")


if __name__ == "__main__":
    main()
