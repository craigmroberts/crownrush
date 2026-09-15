"""Look at a fitted character the ways the fitter cannot, and say where the design is wrong.

    blender -b -P tools/fit/inspect.py -- king
    blender -b -P tools/fit/inspect.py -- archer --res 260

The fitter scores whole-body pixel counts: silhouette overlap, then how much of the overlap shows the
same part on both sides. Both are areas, and area is dominated by the torso and the skirt. A face is
forty pixels out of ten thousand, so it can be completely wrong and the score barely moves. That is
how a pair of anime eyes survived every run on a character whose reference has two dark squares.

This measures the things area hides. Nothing here searches or changes a model; it reports.

  Bands       the figure cut into horizontal bands, each scored on its own. A head worth 8% of the
              pixels gets its own number instead of being averaged into the tunic.
  Landmarks   the heights of the shoulder line, the waist, the widest point and the hem, read off the
              silhouette's width profile. These are proportions, and they are what "it looks wrong"
              usually means.
  Profile     silhouette width at every height, model against reference, and where it deviates most.
  Census      every part colour: how much of the figure it covers, how high its centre sits, how wide
              it spreads. A feature the reference has and the model does not shows up here as a role
              with area on one side and nothing on the other.
  Detail      how much internal boundary each band carries. A band with far less than the reference
              is a band missing trim, seams, a buckle, a face.

Writes tools/fit/reports/<who>-inspect.png (reference | model | bands | width profile) and prints the
scorecard. Exit code is 0 always: this is a report, not a gate.
"""
import sys, os, json, subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import bpy
from imagelib import (PALETTE, ID_COLORS, DEFAULT_COL, load_rgba, save_rgb, foreground, symmetrise,
                      fit_frame, iou_of, make_classes, label, layout_score, hex_to_rgb, BANDS)

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
BUILDER = os.path.join(ROOT, "tools", "blender", "make_character.py")
BLENDER = bpy.app.binary_path
REPORTS = os.path.join(ROOT, "tools", "fit", "reports")
PARAMS_DIR = os.path.join(ROOT, "tools", "fit", "params")

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def flag(name, default, cast=str):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return cast(v)
    return default
RES = flag("--res", 240, int)
REF = flag("--ref", "", str)
if not args:
    print(__doc__)
    sys.exit(1)
WHO = args[0]
REF = os.path.abspath(REF) if REF else os.path.join(ROOT, "tools", "fit", "refs", f"{WHO}.png")
PARAMS = os.path.join(PARAMS_DIR, f"{WHO}.json")
if not os.path.exists(REF):
    sys.exit(f"no reference at {REF}")

WORK = os.path.join(REPORTS, f"_{WHO}-inspect")
def build(ids=False):
    """One front render of the character as the game builds it, minus the weapon the reference lacks."""
    p = json.load(open(PARAMS)) if os.path.exists(PARAMS) else {"props": {}}
    p["props"] = dict(p.get("props", {}), gear=0)
    p["front_res"] = RES * 2
    if ids:
        p["front_aa"] = False
    trial = WORK + "-trial.json"
    json.dump(p, open(trial, "w"))
    out = WORK + ("-ids.png" if ids else ".png")
    cmd = [BLENDER, "-b", "-P", BUILDER, "--", WHO, "-", "--params", trial, "--front", out]
    if ids:
        cmd += ["--ids", WORK + "-ids.json"]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    if not os.path.exists(out):
        print(r.stdout[-1200:], r.stderr[-800:])
        sys.exit("the builder produced no render")
    px = load_rgba(out)
    os.remove(out)
    return px

# ---------- the two pictures, framed the same way ----------
ref_px = load_rgba(REF)
ref_fg, ref_rgb = foreground(ref_px), ref_px[..., :3]
ys, xs = np.where(ref_fg)
FRAME_H = int(round((RES - 4) * (ys.max() - ys.min() + 1) / (xs.max() - xs.min() + 1) * 1.25)) + 2

model_px = build()
m, c = fit_frame(foreground(model_px), model_px[..., :3], RES, FRAME_H)

# the roles this character actually wears, and the colours it wears them in
build(ids=True)
used = sorted({role for _, role in json.load(open(WORK + "-ids.json")) if role in DEFAULT_COL})
cols = json.load(open(PARAMS)).get("colors", {}) if os.path.exists(PARAMS) else {}
role_rgb = {n: np.array(hex_to_rgb(cols[n]) if n in cols else DEFAULT_COL[n], np.float32) for n in used}
centres, class_of = make_classes(role_rgb)
lab = label(m, c, centres)

# same choice of reference reading the fitter makes: whole, or either half mirrored, whichever agrees
best = None
for name in ("off", "left", "right"):
    fg2, rgb2 = (ref_fg, ref_rgb) if name == "off" else symmetrise(ref_fg, ref_rgb, name)[:2]
    fm, fc = fit_frame(fg2, rgb2, RES, FRAME_H)
    fl = label(fm, fc, centres)
    sc = layout_score(fm, fl, m, lab)
    if best is None or sc > best[0]:
        best = (sc, name, fm, fc, fl)
_, half_used, ref_m, ref_c, ref_lab = best

names_of = {}
for role, cls in class_of.items():
    names_of.setdefault(cls, []).append(role)
cls_name = {k: "/".join(v[:2]) for k, v in names_of.items()}

print(f"{WHO}: {len(used)} roles, {len(centres)} colour classes, reference read {half_used}")
print(f"whole figure: silhouette {iou_of(ref_m, m):.3f}, parts agree {layout_score(ref_m, ref_lab, m, lab):.3f}")

# ---------- bands ----------
rows = np.where(ref_m.any(axis=1))[0]
top, bot = rows.min(), rows.max() + 1
span = bot - top
print("\nbands (share is of the reference's pixels; a small band with a low score is a small thing badly wrong)")
print(f"  {'band':6s} {'share':>6s} {'silhouette':>11s} {'parts agree':>12s}   {'worst part here':s}")
band_scores = []
for name, a, b in BANDS:
    y0, y1 = top + int(span * a), top + int(span * b)
    sl = slice(y0, y1)
    rm, mm, rl, ml = ref_m[sl], m[sl], ref_lab[sl], lab[sl]
    share = rm.sum() / max(1, ref_m.sum())
    sil = iou_of(rm, mm)
    agree = layout_score(rm, rl, mm, ml)
    band_scores.append((name, share, sil, agree))
    # which class the model most often gets wrong in this band
    wrong = np.logical_and(np.logical_and(rm, mm), np.logical_and(rl != ml, rl != -1))
    note = ""
    if wrong.sum() > 0.01 * max(1, rm.sum()):
        got, want = ml[wrong], rl[wrong]
        gi = np.bincount(got[got >= 0]).argmax() if (got >= 0).any() else -1
        wi = np.bincount(want[want >= 0]).argmax() if (want >= 0).any() else -1
        note = f"{cls_name.get(gi, '?')} where the art has {cls_name.get(wi, '?')}"
    print(f"  {name:6s} {share * 100:5.0f}% {sil:11.3f} {agree:12.3f}   {note}")

# ---------- landmarks from the width profile ----------
def profile(mask):
    w = mask.sum(axis=1).astype(np.float32)
    r = np.where(w > 0)[0]
    w = w[r.min():r.max() + 1]
    y = np.linspace(0, 1, len(w))
    return np.interp(np.linspace(0, 1, 128), y, w) / max(1.0, w.max())

pr, pm = profile(ref_m), profile(m)

def landmarks(p):
    n = len(p)
    d = np.diff(p)
    # the shoulder is where the body steps out past the head. Search below the hair and headgear: on a
    # crowned king the widest step in the top fifth is the crown flaring off its points, not a shoulder.
    lo_s, hi_s = int(n * 0.18), int(n * 0.52)
    shoulder = lo_s + int(np.argmax(d[lo_s:hi_s])) + 1
    widest = int(np.argmax(p))
    lo = min(shoulder + 2, n - 1)
    waist = lo + int(np.argmin(p[lo:max(lo + 1, widest + 1)])) if widest > lo else widest
    hem = int(np.where(p > 0.35)[0].max())                  # last height still carrying real width
    return {"shoulder": shoulder / n, "waist": waist / n, "widest": widest / n, "hem": hem / n}

lr, lm = landmarks(pr), landmarks(pm)
print("\nlandmarks (height down the figure, 0 at the crown; the model minus the art)")
for k in ("shoulder", "waist", "widest", "hem"):
    d = lm[k] - lr[k]
    flagch = "  <-- off by more than a twentieth of the figure" if abs(d) > 0.05 else ""
    print(f"  {k:9s} art {lr[k] * 100:5.1f}%   model {lm[k] * 100:5.1f}%   {d * 100:+5.1f}{flagch}")

dev = pm - pr
worst = int(np.argmax(np.abs(dev)))
print(f"  width profile: largest gap {dev[worst] * 100:+.0f}% of max width at {worst / len(dev) * 100:.0f}% down"
      f" ({'too wide' if dev[worst] > 0 else 'too narrow'}), mean gap {np.abs(dev).mean() * 100:.1f}%")

# ---------- census: does every part of the design exist, at the right size and height? ----------
print("\ncensus (each colour class: share of the figure, and how far down its centre sits)")
print(f"  {'class':16s} {'art':>12s} {'model':>12s}   {'verdict':s}")
for cls in sorted(set(list(names_of))):
    rsel, msel = (ref_lab == cls), (lab == cls)
    ra, ma_ = rsel.sum() / max(1, ref_m.sum()), msel.sum() / max(1, m.sum())
    if ra < 0.004 and ma_ < 0.004:
        continue
    rh = (np.where(rsel)[0].mean() - top) / span if rsel.any() else float("nan")
    mh = (np.where(msel)[0].mean() - top) / span if msel.any() else float("nan")
    verdict = ""
    if ra > 0.01 and ma_ < ra * 0.35:
        verdict = "the art has this and the model barely does"
    elif ma_ > 0.01 and ra < ma_ * 0.35:
        verdict = "the model has this and the art does not"
    elif rsel.any() and msel.any() and abs(mh - rh) > 0.06:
        verdict = f"sits {'lower' if mh > rh else 'higher'} than the art by {abs(mh - rh) * 100:.0f}%"
    elif ra > 0.02 and abs(ma_ - ra) > ra * 0.4:
        verdict = f"{'too much' if ma_ > ra else 'too little'} of it"
    a_txt = f"{ra * 100:4.1f}% @{rh * 100:3.0f}%" if rsel.any() else "   -       "
    m_txt = f"{ma_ * 100:4.1f}% @{mh * 100:3.0f}%" if msel.any() else "   -       "
    print(f"  {cls_name.get(cls, '?')[:16]:16s} {a_txt:>12s} {m_txt:>12s}   {verdict}")

# ---------- detail density ----------
def edges(lb, mask):
    e = np.zeros_like(mask)
    e[:, :-1] |= (lb[:, :-1] != lb[:, 1:]) & mask[:, :-1] & mask[:, 1:]
    e[:-1, :] |= (lb[:-1, :] != lb[1:, :]) & mask[:-1, :] & mask[1:, :]
    return e

er, em = edges(ref_lab, ref_m), edges(lab, m)
print("\ndetail (internal boundary per band: far below the art means trim, seams or a face are missing)")
for name, a, b in BANDS:
    y0, y1 = top + int(span * a), top + int(span * b)
    rn = er[y0:y1].sum() / max(1, ref_m[y0:y1].sum())
    mn = em[y0:y1].sum() / max(1, m[y0:y1].sum())
    note = ""
    if rn > 0.02 and mn < rn * 0.5:
        note = "the model is plainer here than the art"
    elif mn > 0.02 and rn < mn * 0.5:
        note = "the model is busier here than the art"
    print(f"  {name:6s} art {rn * 100:5.1f}%   model {mn * 100:5.1f}%   {note}")

# ---------- the picture ----------
panel = lambda mm, cc: np.where(mm[..., None], cc, 1.0).astype(np.float32)
h = ref_m.shape[0]
bands_img = np.ones((h, RES // 2, 3), np.float32)
for name, a, b in BANDS:
    y0, y1 = top + int(span * a), top + int(span * b)
    sc = next(x[3] for x in band_scores if x[0] == name)
    fill = np.array([0.85, 0.25, 0.25], np.float32) * (1 - sc) + np.array([0.35, 0.7, 0.4], np.float32) * sc
    bands_img[y0:y1, 2:int(2 + (RES // 2 - 6) * sc) + 1] = fill
    bands_img[y0:y0 + 1, :] = 0.8
prof_img = np.ones((h, RES // 2, 3), np.float32)
for i, (vr, vm) in enumerate(zip(pr, pm)):
    y = top + int(i / len(pr) * span)
    if 0 <= y < h:
        prof_img[y, : max(1, int(vr * (RES // 2 - 2)))] = (0.75, 0.78, 0.85)
        prof_img[y, max(0, int(vm * (RES // 2 - 2)) - 1): max(1, int(vm * (RES // 2 - 2)))] = (0.15, 0.15, 0.2)
gap = np.ones((h, 4, 3), np.float32)
out = np.concatenate([panel(ref_m, ref_c), gap, panel(m, c), gap, bands_img, gap, prof_img], axis=1)
path = os.path.join(REPORTS, f"{WHO}-inspect.png")
save_rgb(path, out)
for f in (WORK + "-trial.json", WORK + "-ids.json"):
    if os.path.exists(f):
        os.remove(f)
print(f"\nreference | model | band agreement | width profile (art pale, model dark) -> tools/fit/reports/{WHO}-inspect.png")
