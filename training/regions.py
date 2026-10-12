"""Strip region labelling — the same rules as src/regions.ts in the app.

Given the text lines (with boxes) read from a photo and what the strip was confirmed to be,
decide which boxes are the brand, the contents and the strength.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

CLASSES = ["brand", "contents", "strength"]  # YOLO class ids 0, 1, 2

DRUGS = json.loads((Path(__file__).parent / "drugs.json").read_text())


@dataclass
class Box:
    text: str
    left: float
    top: float
    width: float
    height: float


@dataclass
class Region(Box):
    cls: str = "brand"


def _norm(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def _words(s: str) -> list[str]:
    s = re.sub("[®™©Ⓡ]", " ", s.upper())
    return [w for w in re.split(r"[^A-Z0-9.]+", s) if w]


def _edit(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        diag, prev[0] = prev[0], i
        for j in range(1, len(b) + 1):
            tmp = prev[j]
            prev[j] = min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] != b[j - 1]))
            diag = tmp
    return prev[len(b)]


def _word_matches(seen: str, target: str, glued: bool = False) -> bool:
    a = re.sub(r"\d+$", "", _norm(seen))  # "MONOTRATE10" -> "MONOTRATE"
    b = _norm(target)
    if len(a) < 3 or len(b) < 3:
        return False
    if a == b:
        return True
    if len(a) >= 4 and (b.endswith(a) or b.startswith(a)):  # torn edges: "OTRATE"
        return True
    if len(a) >= 5 and len(a) < len(b) and (_edit(a, b[-len(a):]) <= 1 or _edit(a, b[: len(a)]) <= 1):  # torn + misread: "PPILET"
        return True
    tol = 2 if len(b) >= 8 else 1 if len(b) >= 5 else 0
    if abs(len(a) - len(b)) <= tol and _edit(a, b) <= tol:
        return True
    # glued to other words: "ENTLOCLOPICTOGRE" contains "CLOPIDOGREL" (nearly)
    if glued and len(b) >= 7 and len(a) > len(b):
        return any(_edit(a[i : i + n], b) <= 2 for n in (len(b) - 1, len(b)) for i in range(0, len(a) - n + 1))
    if len(b) >= 7 and len(a) >= 6 and len(a) < len(b):  # cut at the end of the photo: "CLOPE"…
        return _edit(a, b[: len(a)]) <= 1
    return False


SKIP = re.compile(
    r"\b(caution|schedule|prescription|retail|sold|practitioner|registered|trade\s?mark|manufactured|marketed|ltd|limited|pvt|"
    r"road|dist|vill|batch|b\.?\s?no|mfg|exp|m\.?\s?r\.?\s?p|price|taxes|store|storage|dosage|directed|physician|children)\b",
    re.I,
)
CONTENTS_HINT = re.compile(
    r"(\bcontains|\bequivalent|\bcomposition|tablets?\s+i\.?p|capsules?\s+i\.?p|tablets?\s+b\.?p|tablets?\s+u\.?s\.?p|hydrochloride|sodium|bisulphate)\b",
    re.I,
)


def ingredients_for(name: str) -> list[str]:
    """Contents of a brand from the built-in list ("Monotrate" -> ["Isosorbide Mononitrate"])."""
    n = _norm(name)
    best = None
    for d in DRUGS:
        for b in d["brands"]:
            nb = _norm(b)
            if n == nb or (n.startswith(nb) and len(nb) >= 4):
                if best is None or len(nb) > best[0]:
                    best = (len(nb), d["ingredients"])
    return best[1] if best else []


def label_regions(lines: list[Box], name: str, strength: str, ingredients: list[str] | None = None) -> list[Region]:
    ingredients = ingredients if ingredients is not None else ingredients_for(name)
    brand_words = [w for w in _words(name) if re.search("[A-Z]{3,}", w)]
    ingr_words = [w for w in (w for i in ingredients for w in _words(i)) if len(w) >= 5 and w.isalpha()]
    strengths = [re.sub(r"[^\d.]", "", x) for x in strength.split("/") if re.sub(r"[^\d.]", "", x)]
    out: list[Region] = []
    for l in lines:
        if not l.text.strip() or l.width <= 0 or l.height <= 0 or SKIP.search(l.text):
            continue
        ws = _words(l.text)

        def is_ingredient(w: str) -> bool:
            # Fragments that fit a contents word ("CLOPE" of Clopidogrel) are contents, never the brand.
            nw = _norm(w)
            return any(
                nw == g or (len(nw) >= 6 and _edit(nw, g) <= 1) or (5 <= len(nw) < len(g) and _edit(nw, g[: len(nw)]) <= 1) for g in ingr_words
            )

        has_brand = any(
            not is_ingredient(w) and (re.sub(r"\d+$", "", _norm(w)) == b or _word_matches(w, b)) for b in brand_words for w in ws
        )
        has_ingr = any(_word_matches(w, g, glued=True) for g in ingr_words for w in ws)
        clean = re.sub("[®Ⓡ]", " ", l.text)
        strength_here = any(re.search(rf"(^|[^\d.]){re.escape(s)}\s*(mg|mcg|µg|ml|iu|k)?\b", clean, re.I) for s in strengths)
        if has_brand:
            out.append(Region(**vars(l), cls="brand"))
        if not has_brand and (has_ingr or CONTENTS_HINT.search(l.text)):
            out.append(Region(**vars(l), cls="contents"))
        if strength_here and re.search(r"\d\s*(mg|mcg|µg|ml|iu)\b", l.text, re.I):
            out.append(Region(**vars(l), cls="strength"))
    return dedupe(out)


def _iou(a: Box, b: Box) -> float:
    x0, y0 = max(a.left, b.left), max(a.top, b.top)
    x1, y1 = min(a.left + a.width, b.left + b.width), min(a.top + a.height, b.top + b.height)
    inter = max(0, x1 - x0) * max(0, y1 - y0)
    union = a.width * a.height + b.width * b.height - inter
    return inter / union if union > 0 else 0


def dedupe(regions: list[Region], iou: float = 0.4) -> list[Region]:
    """The same print read in several orientations gives near-identical boxes: keep one per class (the larger)."""
    kept: list[Region] = []
    for r in sorted(regions, key=lambda r: -r.width * r.height):
        if not any(k.cls == r.cls and _iou(k, r) > iou for k in kept):
            kept.append(r)
    return kept


def to_yolo(regions: list[Region], width: int, height: int) -> str:
    rows = []
    for r in regions:
        x0, y0 = max(0, r.left / width), max(0, r.top / height)
        x1, y1 = min(1, (r.left + r.width) / width), min(1, (r.top + r.height) / height)
        if x1 <= x0 or y1 <= y0:
            continue
        rows.append(f"{CLASSES.index(r.cls)} {(x0 + x1) / 2:.6f} {(y0 + y1) / 2:.6f} {x1 - x0:.6f} {y1 - y0:.6f}")
    return "\n".join(rows)
