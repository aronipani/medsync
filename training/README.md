# Strip-region detector — training

Teaches a small model to **find where the brand, contents, strength and expiry date are printed** on a strip,
so the app can crop those areas, enlarge them and read them cleanly — even with glare or torn foil.

Boxes are **rotated** (YOLO-OBB: four corners per box), because strips are photographed at every angle and an
upright box around slanted print swallows the neighbouring lines.

Classes: `0 brand` (e.g. MONOTRATE®10), `1 contents` (e.g. "Isosorbide Mononitrate … 10 mg"), `2 strength` (e.g. "10 mg"),
`3 expiry` (e.g. "EXP. 03/2028" — any line with a readable expiry date).

Models trained before `expiry` was added have 3 classes; retrain once labels include it.

## 1. Set up (once)

```bash
cd training
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```
A GPU helps but isn't required: 50–100 photos train in about 30–60 minutes on a laptop CPU, a few minutes on a GPU or Apple silicon (`--device mps`).

## 2. Get the photos

In the app (test builds): **Settings → Your data → Photos for improving the scanner → More → Save as a file (.zip)**, share it to your computer and unzip it, e.g. to `~/medsync-training`.
It contains `images/`, `labels/` (boxes the phone labelled automatically), `manifest.json` and `data.yaml`, and for
photos taken from build ios-28 / build-31 on, both steps of each scan (spec 12):
* `boxed/<photo>.svg` — the photo with the region detector's boxes drawn on it and the text of every step beside it
  (open in a browser; the clean photo stays in `images/` or `unlabelled/`)
* `predictions/<photo>.txt` — the detector's boxes, YOLO-OBB with the confidence last (load into CVAT as a start)
* `scans/<photo>.txt` — what was read at each step: whole photo upright and turned, each box crop, each re-read

```bash
python review.py --export ~/medsync-training --only-failed   # boxed JPEGs of the failed scans → review/
```
No box on the name/strength → the detector (finding) failed; box in place but wrong text → the reader failed.

`unlabelled/` holds photos of scans nobody confirmed (red result, unreadable, or closed); `reason` in `manifest.json`
says why. These are the hardest strips, so the most useful to train on: name each one (CVAT, or
`python autolabel.py --folder unlabelled_monotrate --label "Monotrate 10"` after sorting them into folders), then add them to the dataset.

Loose photos (not from the app) also work: put each medicine's photos in its own folder.

**From the TakeSure server** (test builds with `TAKESURE_API_URL` set send photos there instead of email):
```bash
aws s3 sync s3://<bucket>/training ./server-training          # bucket = terraform output "bucket"
python server_photos.py ./server-training ./server-export     # same layout as an app export; rerun after each sync
```
Then use `./server-export` wherever this guide says `~/medsync-training`.

## 3. Auto-label

```bash
python autolabel.py --export ~/medsync-training            # labels photos that have no label file yet
python autolabel.py --folder photos/monotrate --label "Monotrate 10"
```
It reads each photo every way up (RapidOCR, on your computer), marks the brand / contents / strength lines using the
same rules as the app, writes `labels/*.txt`, and saves `previews/` with the boxes drawn. **Look at the previews.**

## 4. Check and fix the boxes (important)

Auto-labels miss print hidden by glare and sometimes mark the wrong line. A missed box teaches the model
"this is not a name", so fix them — about 30 minutes for 50 photos:

* **CVAT** (free, cvat.ai or self-hosted): create a task with the images and labels brand, contents, strength,
  then *Upload annotations → Ultralytics YOLO Oriented Bounding Boxes 1.0* with a zip of `images/`, `labels/` and `data.yaml`.
  Fix the boxes (rotated rectangles), then *Export* in the same format.
* or **Roboflow** (free tier): create an *Object Detection (OBB)* project and upload the folder with `images/`,
  `labels/` and `data.yaml`; export as *YOLOv8 Oriented Bounding Boxes*.

Rules of thumb: turn each box to follow the text line; box **every** readable copy of the brand (strips repeat it), the generic-name heading and
composition lines as `contents`, any "10 mg"-style text as `strength`, and the "EXP" date as `expiry`. Skip company, address, batch, price and warnings.

## 5. Build the dataset and train

```bash
python prepare.py --src ~/medsync-training --out dataset      # burst photos stay on the same side of the split
python train.py --data dataset/data.yaml --epochs 120 --imgsz 640   # 960 reads small print better but trains ~2× slower
```
Read the printed scores: **recall** matters most (did it find the name and strength?). As a guide, with ~50 corrected
photos expect a usable brand/contents detector; strength boxes need more examples because they're small.

## 6. Try it, then export for the phone

```bash
python predict.py --weights runs/obb/strip-regions/weights/best.pt --images some_new_photos/
python export.py  --weights runs/obb/strip-regions/weights/best.pt --imgsz 640   # same size as training
```
`export.py` writes a LiteRT/TFLite model (float32, no built-in NMS) and copies it to `assets/models/strip-regions.tflite`.
The app runs it with `react-native-fast-tflite` (`src/regionModel.ts`), decodes the boxes in `src/obb.ts`, crops each found
area, turns it level and reads it (spec 10). Push to `main` and the next build carries the new model.

## Training on the DGX Spark

The Spark (Grace CPU + Blackwell GPU, 128 GB shared memory, DGX OS on **arm64**) trains this model in minutes,
so use it for the big retrain: all photos, **960 px**, many more epochs. Plain `pip install` on arm64 can pull a
CPU-only PyTorch, so train inside NVIDIA's PyTorch container, which has the right CUDA build.

**1. Start the container** (Docker and the NVIDIA container toolkit come with DGX OS). Use the newest monthly tag
listed on NGC (catalog.ngc.nvidia.com → PyTorch), shown here as `<tag>`:
```bash
cd ~/medsync                                   # your clone of the repo, photos copied next to it
docker run --gpus all -it --rm --ipc=host \
  -v "$PWD":/work -v ~/strip-photos:/photos -w /work/training \
  nvcr.io/nvidia/pytorch:<tag>-py3
```

**2. Install the training tools without replacing the container's PyTorch:**
```bash
pip freeze | grep -iE '^(torch|torchvision)==' > /tmp/keep-torch.txt
pip install -c /tmp/keep-torch.txt -r requirements.txt
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"   # → True NVIDIA GB10
```
If it prints `False`, pip replaced torch: start a fresh container and repeat step 2.

**3. Label, prepare and train at 960 px:**
```bash
python autolabel.py --export /photos/server-export             # OCR runs on the Grace CPU; previews/ to check
# (fix the boxes in CVAT — step 4 above — then)
python prepare.py --src /photos/server-export --src /photos/medsync-training --out dataset
python train.py --data dataset/data.yaml --imgsz 960 --epochs 200 --batch 32 --device 0
```
Settings: `--imgsz 960` reads the small strength and expiry print far better than 640; `--batch 32` fits easily in
the Spark's memory at 960 (use 64 if you have thousands of photos); 200 epochs with early stopping (Ultralytics
stops when validation stops improving). Watch **recall** for `strength` and `expiry` — those were 0.04 and 0 on the
52-photo CPU trial, and are the reason for this retrain.

**4. Try it and export for the phone (same size as training):**
```bash
python predict.py --weights runs/obb/strip-regions/weights/best.pt --images /photos/new-photos
python export.py  --weights runs/obb/strip-regions/weights/best.pt --imgsz 960
```
The app reads the model's input size from the model itself (`src/regionModel.ts`), so a 960 px model needs no app
change. It runs about twice as long per photo on the phone as the 640 one — check scan speed on an older phone with
**Check the strips** before shipping it. If the TFLite export fails inside the container (it needs TensorFlow,
which isn't always available for arm64), copy `best.pt` to your PC and run `export.py` there.

**Also useful on the Spark:** run CVAT there (Docker Compose, from github.com/cvat-ai/cvat) to fix labels in the
browser on your PC, and load the new model's `predictions/` as a first draft so you only correct boxes.

### Photos without the app
A folder with `images/` and a `photos.json` saying which medicines each photo shows (several per photo is fine):
```bash
python autolabel.py --photos ~/strips
python prepare.py --src ~/strips --out dataset
```
Photos where no box was found are left out of the dataset (an empty label would teach "nothing here").

## Files
| File | Does |
|---|---|
| `regions.py` | Labelling rules (same as `src/regions.ts` in the app) |
| `drugs.json` | Built-in medicine list, generated by `node --experimental-strip-types export_drugs.ts` |
| `autolabel.py` | OCR every orientation → rotated boxes → YOLO-OBB labels + previews (OCR cached in `ocr/`) |
| `prepare.py` | Session-aware train/val split → `dataset/` |
| `train.py` | Fine-tunes YOLO11n-OBB with strip-specific augmentation |
| `predict.py` | Draws detections on new photos |
| `export.py` | LiteRT/TFLite export for the app (copies into `assets/models/`) |
| `review.py` | Draws detector boxes, labels and the text of each scan step onto exported photos |
