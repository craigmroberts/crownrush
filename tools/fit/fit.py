"""Fit a character to a reference image, locally, with no AI in the loop.

Runs INSIDE Blender's Python (numpy is bundled), so nothing needs installing:

    blender -b -P tools/fit/fit.py -- king tools/fit/refs/king.png
    blender -b -P tools/fit/fit.py -- king tools/fit/refs/king.png --iters 150 --target 0.86

What it does, over and over until the score stops improving:
  1. build the character from the current parameters (tools/blender/make_character.py --params)
  2. render a flat orthographic front view on a transparent background
  3. score it against the reference:
       - silhouette: intersection-over-union of the two shapes, each cropped to its bounding box
         and fitted into the same square, so position and overall scale do not matter
       - colour: the dominant colour of the foreground in each of several horizontal bands
  4. nudge one proportion and keep the change if the score went up

Colours are not searched. After the shape search, the character is rendered once more with every
palette role wearing a unique ID colour, so each pixel of the fitted silhouette is known to belong to
"hair" or "tunic" or "boot". The reference's dominant colour under each role's pixels is then assigned
to that role directly. The search itself is over the six proportion values the builder exposes.

Outputs:
  tools/fit/params/<who>.json   the best parameters found (the game's build picks this up automatically)
  tools/fit/reports/<who>.png   reference | render | overlay, so a human can confirm in a glance
and a one-line verdict on stdout. Exit code 0 when the target score is reached, 2 when it stalled.

The reference should be a front view of the character on a plain or transparent background. Anything
this builder has no part for (a cape, a different hat) will show up as red in the overlay: that is a
request for a new part, not something the search can invent.
"""
import sys, os, json, math, random, subprocess, time
import numpy as np
import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
BUILDER = os.path.join(ROOT, "tools", "blender", "make_character.py")
BLENDER = bpy.app.binary_path

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def flag(name, default=None, cast=str):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return cast(v)
    return default
ITERS = flag("--iters", 120, int)
TARGET = flag("--target", 0.86, float)
PATIENCE = flag("--patience", 25, int)
RES = flag("--res", 160, int)
SEED = flag("--seed", 1, int)
if len(args) < 2:
    print(__doc__)
    sys.exit(1)
WHO, REF = args[0], os.path.abspath(args[1])
random.seed(SEED)

PARAMS_DIR = os.path.join(ROOT, "tools", "fit", "params")
REPORT_DIR = os.path.join(ROOT, "tools", "fit", "reports")
os.makedirs(PARAMS_DIR, exist_ok=True)
os.makedirs(REPORT_DIR, exist_ok=True)
WORK_PARAMS = os.path.join(REPORT_DIR, f"_{WHO}-trial.json")
WORK_RENDER = os.path.join(REPORT_DIR, f"_{WHO}-trial.png")

# ---------- what the builder lets us move ----------
# each character's defaults live in make_character.py; these are the search bounds
BOUNDS = {
    "torso_x": (0.24, 0.52), "torso_y": (0.2, 0.44), "torso_z": (0.24, 0.46),
    "arm_r": (0.06, 0.16), "arm_len": (0.22, 0.5), "hand_r": (0.06, 0.16), "leg_r": (0.08, 0.18), "head_s": (0.78, 1.25),
}
DEFAULTS = {
    "king": dict(torso_x=0.34, torso_y=0.29, torso_z=0.33, arm_r=0.09, arm_len=0.32, hand_r=0.085, leg_r=0.105, head_s=1.0),
    "brute": dict(torso_x=0.42, torso_y=0.36, torso_z=0.36, arm_r=0.12, arm_len=0.36, hand_r=0.11, leg_r=0.13, head_s=1.0),
    "boss": dict(torso_x=0.44, torso_y=0.38, torso_z=0.4, arm_r=0.13, arm_len=0.46, hand_r=0.14, leg_r=0.15, head_s=0.92),
}
# every palette name the builder knows; each gets a unique flat ID colour for the role render
PALETTE = ["skin", "hair", "beard", "blue", "gold", "leather", "boot", "white", "black", "red", "pink", "blueEye",
           "horse", "muzzle", "mane", "steel", "steelDark", "navy", "darkRed", "ink", "bone", "boneDark", "wood", "glow"]
_levels = [0.0, 0.5, 1.0]
ID_COLORS = [(r, g, b) for r in _levels for g in _levels for b in _levels if (r, g, b) not in ((0, 0, 0), (1, 1, 1))]
ID_OF = {name: ID_COLORS[i] for i, name in enumerate(PALETTE)}
MIN_ROLE = 0.012  # a role must cover this share of the silhouette to be worth recolouring

# ---------- images ----------
def load_rgba(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # top row first
    bpy.data.images.remove(img)
    return px

def save_rgb(path, rgb):
    h, w, _ = rgb.shape
    img = bpy.data.images.new("report", w, h, alpha=True)
    rgba = np.concatenate([rgb[::-1], np.ones((h, w, 1), np.float32)], axis=2)
    img.pixels = rgba.reshape(-1).tolist()
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)

def foreground(px):
    """Mask of the subject. Alpha if the image has any; otherwise anything unlike the corner colour."""
    a = px[..., 3]
    if a.min() < 0.5:
        return a > 0.5
    corner = np.median(np.concatenate([px[:4, :4, :3].reshape(-1, 3), px[-4:, -4:, :3].reshape(-1, 3), px[:4, -4:, :3].reshape(-1, 3), px[-4:, :4, :3].reshape(-1, 3)]), axis=0)
    return np.linalg.norm(px[..., :3] - corner, axis=2) > 0.12

def fit_square(mask, rgb, n):
    """Crop to the mask's bounding box and place it, aspect kept, in an n x n square."""
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return np.zeros((n, n), bool), np.zeros((n, n, 3), np.float32)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    m = mask[y0:y1, x0:x1]
    c = rgb[y0:y1, x0:x1]
    h, w = m.shape
    s = (n - 4) / max(h, w)
    nh, nw = max(1, int(round(h * s))), max(1, int(round(w * s)))
    yi = np.clip((np.arange(nh) / s).astype(int), 0, h - 1)
    xi = np.clip((np.arange(nw) / s).astype(int), 0, w - 1)
    m2 = m[yi][:, xi]
    c2 = c[yi][:, xi]
    out_m = np.zeros((n, n), bool)
    out_c = np.zeros((n, n, 3), np.float32)
    oy, ox = (n - nh) // 2, (n - nw) // 2
    out_m[oy:oy + nh, ox:ox + nw] = m2
    out_c[oy:oy + nh, ox:ox + nw] = c2
    return out_m, out_c

def dominant(colors):
    """The most common colour among these pixels, quantised so shading does not split it."""
    if len(colors) == 0:
        return None
    q = np.round(colors * 12) / 12
    keys, counts = np.unique(q, axis=0, return_counts=True)
    top = keys[np.argmax(counts)]
    near = colors[np.linalg.norm(colors - top, axis=1) < 0.09]
    return near.mean(axis=0) if len(near) else top

BANDS = 5
def band_colors(mask, rgb):
    n = mask.shape[0]
    out = []
    for b in range(BANDS):
        y0, y1 = int(n * b / BANDS), int(n * (b + 1) / BANDS)
        sel = mask[y0:y1]
        out.append(dominant(rgb[y0:y1][sel]))
    return out

def iou_of(ref_m, rn_m):
    inter = np.logical_and(ref_m, rn_m).sum()
    union = np.logical_or(ref_m, rn_m).sum()
    return inter / union if union else 0.0

def role_masks(id_m, id_c):
    """Which palette role each rendered pixel belongs to, from the ID-colour render."""
    ids = np.array(ID_COLORS, np.float32)
    px = id_c[id_m]
    d = np.linalg.norm(px[:, None, :] - ids[None, :, :], axis=2)
    nearest = d.argmin(axis=1)
    out = {}
    ys, xs = np.where(id_m)
    for i, name in enumerate(PALETTE):
        sel = nearest == i
        if sel.sum() >= MIN_ROLE * id_m.sum():
            m = np.zeros_like(id_m)
            m[ys[sel], xs[sel]] = True
            out[name] = m
    return out

def colour_score(masks, ref_m, ref_c, colors):
    """How close each recoloured role is to the reference under that role's pixels, weighted by size."""
    tot = 0.0
    wsum = 0.0
    for name, m in masks.items():
        sel = np.logical_and(m, ref_m)
        if sel.sum() < 8 or name not in colors:
            continue
        target = dominant(ref_c[sel])
        got = np.array(hex_to_rgb(colors[name]), np.float32)
        w = float(sel.sum())
        tot += w * max(0.0, 1.0 - np.linalg.norm(target - got) / 0.9)
        wsum += w
    return tot / wsum if wsum else 1.0

# ---------- driving the builder ----------
def render(params):
    json.dump(params, open(WORK_PARAMS, "w"))
    cmd = [BLENDER, "-b", "-P", BUILDER, "--", WHO, "-", "--params", WORK_PARAMS, "--front", WORK_RENDER]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    if not os.path.exists(WORK_RENDER):
        print(r.stdout[-1500:], r.stderr[-1500:])
        raise SystemExit("builder failed")
    px = load_rgba(WORK_RENDER)
    os.remove(WORK_RENDER)
    return px

def to_props(p):
    return {"torso": [p["torso_x"], p["torso_y"], p["torso_z"]], "arm_r": p["arm_r"], "arm_len": p["arm_len"], "hand_r": p["hand_r"], "leg_r": p["leg_r"], "head_s": p["head_s"]}

def hexc(c):
    return "#%02x%02x%02x" % tuple(int(round(max(0, min(1, v)) * 255)) for v in c)

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

# ---------- go ----------
t0 = time.time()
ref = load_rgba(REF)
ref_m, ref_c = fit_square(foreground(ref), ref[..., :3], RES)
print(f"reference {os.path.basename(REF)}: {ref.shape[1]}x{ref.shape[0]}, subject covers {int(foreground(ref).mean() * 100)}% of the image")

colors = {}

p = dict(DEFAULTS.get(WHO, DEFAULTS["king"]))
existing = os.path.join(PARAMS_DIR, f"{WHO}.json")
if os.path.exists(existing):
    prev = json.load(open(existing))
    if "props" in prev:
        pr = prev["props"]
        p.update(torso_x=pr["torso"][0], torso_y=pr["torso"][1], torso_z=pr["torso"][2], **{k: pr[k] for k in ("arm_r", "arm_len", "hand_r", "leg_r", "head_s") if k in pr})
        print("starting from the previous fit")

def evaluate(p, cols=None):
    px = render({"props": to_props(p), "colors": cols or colors, "front_res": RES})
    m, c = fit_square(foreground(px), px[..., :3], RES)
    return iou_of(ref_m, m), m, c

# phase 1: shape. Colour is decided afterwards, so it must not steer the search.
best, best_m, best_c = evaluate(p)
print(f"start  silhouette {best:.3f}")
step = 0.06
stall = 0
keys = list(BOUNDS)
for it in range(1, ITERS + 1):
    if best >= TARGET + 0.06 or stall >= PATIENCE:
        break
    q = dict(p)
    k = random.choice(keys)
    lo, hi = BOUNDS[k]
    q[k] = float(np.clip(q[k] + random.choice([-1, 1]) * step * (hi - lo) * random.uniform(0.4, 1.6), lo, hi))
    s, m, c = evaluate(q)
    if s > best + 1e-4:
        best, p, best_m, best_c = s, q, m, c
        stall = 0
        print(f"iter {it:3d}  silhouette {best:.3f}  {k} -> {p[k]:.3f}")
    else:
        stall += 1
        if stall % 6 == 0:
            step = max(0.015, step * 0.7)

iou = best
# phase 2: colours. Render the fitted shape with ID colours, then read the reference under each role.
id_iou, id_m, id_c = evaluate(p, {name: hexc(ID_OF[name]) for name in PALETTE})
masks = role_masks(id_m, id_c)
for name, m in masks.items():
    sel = np.logical_and(m, ref_m)
    if sel.sum() >= 8:
        colors[name] = hexc(dominant(ref_c[sel]))
print("colours from reference:", colors)
if iou < 0.85:
    print(f"note: silhouette overlap is only {iou:.2f}, so some colours were read from the wrong parts. More iterations, or a cleaner reference, will fix both.")
col = colour_score(masks, ref_m, ref_c, colors)
_, best_m, best_c = evaluate(p)
best = float(0.65 * iou + 0.35 * col)

# ---------- outputs ----------
# plain floats only: numpy's float32 is not JSON-serialisable and would leave this file half-written
out = {"props": {k: ([float(x) for x in v] if isinstance(v, list) else float(v)) for k, v in to_props(p).items()}, "colors": colors,
       "score": round(float(best), 4), "silhouette": round(float(iou), 4), "colour": round(float(col), 4), "reference": os.path.relpath(REF, ROOT)}
json.dump(out, open(os.path.join(PARAMS_DIR, f"{WHO}.json"), "w"), indent=2)
n = RES
panel = lambda m, c: np.where(m[..., None], c, 1.0).astype(np.float32)
overlay = np.ones((n, n, 3), np.float32)
overlay[np.logical_and(ref_m, ~best_m)] = (0.9, 0.2, 0.2)   # reference only: we are missing shape here
overlay[np.logical_and(best_m, ~ref_m)] = (0.2, 0.4, 0.9)   # render only: we have shape the reference lacks
overlay[np.logical_and(ref_m, best_m)] = (0.55, 0.5, 0.6)
gap = np.ones((n, 4, 3), np.float32)
report = np.concatenate([panel(ref_m, ref_c), gap, panel(best_m, best_c), gap, overlay], axis=1)
save_rgb(os.path.join(REPORT_DIR, f"{WHO}.png"), report)
if os.path.exists(WORK_PARAMS):
    os.remove(WORK_PARAMS)
missing = int(np.logical_and(ref_m, ~best_m).sum()) / max(1, int(ref_m.sum()))
verdict = "complete" if best >= TARGET else "stalled"
print(f"{verdict}: score {best:.3f} (target {TARGET}) after {it} renders in {int(time.time() - t0)}s. silhouette {iou:.3f}, colour {col:.3f}. "
      f"{int(missing * 100)}% of the reference has no matching shape (red in the overlay). "
      f"params -> tools/fit/params/{WHO}.json, report -> tools/fit/reports/{WHO}.png")
open(os.path.join(REPORT_DIR, f"_{WHO}.verdict"), "w").write(f"{verdict} score {best:.3f} silhouette {iou:.3f} colour {col:.3f} missing {int(missing * 100)}%\n")
sys.exit(0 if best >= TARGET else 2)
