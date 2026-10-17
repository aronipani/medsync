"""Turn training photos downloaded from the TakeSure server into the same layout as an emailed export.

The server keeps each photo as training/<YYYY-MM>/<id>.jpg with <id>.json beside it (spec 16). Download them, then
convert, then use the usual scripts:

  aws s3 sync s3://<Bucket output of the stack>/training ./server-training
  python server_photos.py ./server-training ./server-export
  python autolabel.py --export ./server-export

Output: images/ (named photos), labels/ (boxes the phone already found), unlabelled/ (failed scans, to name on a
computer) and manifest.json in the app's export format. Photos already converted are skipped, so it can be rerun
after every sync.
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


def convert(src: Path, out: Path) -> tuple[int, int]:
    (out / "images").mkdir(parents=True, exist_ok=True)
    (out / "labels").mkdir(exist_ok=True)
    (out / "unlabelled").mkdir(exist_ok=True)
    manifest_path = out / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    seen = {e["file"] for e in manifest}
    added = unlabelled = 0
    for meta in sorted(src.rglob("*.json")):
        jpg = meta.with_suffix(".jpg")
        if not jpg.exists():
            continue
        stem = f"{meta.parent.name}__{meta.stem}"  # month__id: unique and sortable
        file = f"{stem}.jpg"
        if file in seen:
            continue
        r = json.loads(meta.read_text())
        name, strength = r.get("name", ""), r.get("strength", "")
        is_unlabelled = bool(r.get("unlabelled")) or not name
        entry = {
            "file": file,
            "medicine": f"{name} {strength}".strip(),
            "name": name,
            "strength": strength,
            **{k: r[k] for k in ("contents", "how", "scan", "reason", "reader", "ocrText", "regions", "trace") if k in r},
            "at": r.get("month", ""),
            "source": "server",
            "platform": r.get("platform", ""),
            "appVersion": r.get("appVersion", ""),
        }
        if is_unlabelled:
            entry["unlabelled"] = True
            shutil.copyfile(jpg, out / "unlabelled" / file)
            unlabelled += 1
        else:
            shutil.copyfile(jpg, out / "images" / file)
            if r.get("yolo"):
                (out / "labels" / f"{stem}.txt").write_text(r["yolo"])
        manifest.append(entry)
        added += 1
    manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    return added, unlabelled


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", type=Path, help="folder synced from s3://<bucket>/training")
    ap.add_argument("out", type=Path, help="export-style folder to create or update")
    a = ap.parse_args()
    added, unl = convert(a.src, a.out)
    print(f"{added} new photos ({added - unl} named, {unl} unlabelled) → {a.out}")


if __name__ == "__main__":
    main()
