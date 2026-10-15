"""Build a YOLO dataset (train / val split) from labelled photos.

Photos taken in the same burst look almost identical, so they always go to the same side of the split —
otherwise the validation score would look much better than the model really is.

  python prepare.py --src ~/Downloads/medsync-training --out dataset
  python prepare.py --src photos/monotrate --src photos/clopilet --out dataset   # plain folders after autolabel.py
"""
from __future__ import annotations

import argparse
import random
import re
import shutil
from collections import defaultdict
from pathlib import Path

from regions import CLASSES


def session_of(stem: str) -> str:
    """Burst photos share a timestamp: "Monotrate 10__2026-10-12T09-30-00-123Z-2" -> "Monotrate 10__2026-10-12T09-30-00"."""
    m = re.match(r"^(.*?\d{4}-\d{2}-\d{2}T\d{2}-\d{2})", stem)
    return m.group(1) if m else stem


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, action="append", required=True, help="folder with images/ (or photos) and labels/")
    ap.add_argument("--out", type=Path, default=Path("dataset"))
    ap.add_argument("--val", type=float, default=0.2, help="share of capture sessions kept for validation")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()

    pairs = []
    for src in a.src:
        img_dir = src / "images" if (src / "images").is_dir() else src
        for img in sorted(p for p in img_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}):
            lab = src / "labels" / f"{img.stem}.txt"
            # A photo where no box was found is "not labelled yet", not "nothing here": training on an empty label
            # file would teach the model that the strip has no name, so such photos are left out.
            if lab.exists() and lab.read_text().strip():
                pairs.append((img, lab, f"{src.name}__{img.stem}"))
    if not pairs:
        raise SystemExit("No labelled photos found — run autolabel.py first.")

    sessions = defaultdict(list)
    for p in pairs:
        sessions[session_of(p[2])].append(p)
    keys = sorted(sessions)
    random.Random(a.seed).shuffle(keys)
    n_val = max(1, round(len(keys) * a.val)) if len(keys) > 1 else 0
    split = {k: ("val" if i < n_val else "train") for i, k in enumerate(keys)}

    if a.out.exists():
        shutil.rmtree(a.out)
    counts = {"train": 0, "val": 0}
    boxes = {"train": [0] * len(CLASSES), "val": [0] * len(CLASSES)}
    for k, items in sessions.items():
        s = split[k]
        for img, lab, name in items:
            (a.out / "images" / s).mkdir(parents=True, exist_ok=True)
            (a.out / "labels" / s).mkdir(parents=True, exist_ok=True)
            shutil.copy(img, a.out / "images" / s / f"{name}{img.suffix.lower()}")
            shutil.copy(lab, a.out / "labels" / s / f"{name}.txt")
            counts[s] += 1
            for line in lab.read_text().splitlines():
                if line.strip():
                    boxes[s][int(line.split()[0])] += 1
    if not counts["val"]:  # tiny datasets: validate on the training photos (score will be optimistic)
        shutil.copytree(a.out / "images" / "train", a.out / "images" / "val")
        shutil.copytree(a.out / "labels" / "train", a.out / "labels" / "val")
        print("Only one capture session — validating on training photos; the score will be optimistic.")

    (a.out / "data.yaml").write_text(
        f"path: {a.out.resolve()}\ntrain: images/train\nval: images/val\nnames:\n" + "".join(f"  {i}: {c}\n" for i, c in enumerate(CLASSES))
    )
    print(f"{len(sessions)} capture sessions -> train {counts['train']} photos, val {counts['val']} photos")
    for s in ("train", "val"):
        print(f"  {s} boxes: " + ", ".join(f"{c} {n}" for c, n in zip(CLASSES, boxes[s])))


if __name__ == "__main__":
    main()
