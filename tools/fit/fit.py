"""Fit a character to a reference image, locally, with no AI in the loop.

Runs INSIDE Blender's Python (numpy is bundled), so nothing needs installing:

    blender -b -P tools/fit/fit.py -- king tools/fit/refs/king.png
    blender -b -P tools/fit/fit.py -- king tools/fit/refs/king.png --iters 600 --target 0.86 --snapshot 100

What it does, over and over until the shape stops improving:
  1. build the character from the current parameters (tools/blender/make_character.py --params),
     in this same Blender process, so a try costs well under a second
  2. render a flat orthographic front view on a transparent background
  3. score it against the reference: the two silhouettes are cropped to their bounding boxes and fitted
     into the same square (so position and overall scale do not matter), every pixel is labelled by the
     nearest part colour, and the score is the share of the union where both sides show the same part.
     A plain outline overlap let the search grow the beard over the face; this does not.
  4. search: sweep every proportion up and down by a step and keep whatever helps; when a whole sweep
     helps nothing, try a few random multi-parameter jumps, then halve the step. Stops when the step
     is tiny, the render budget is spent, or the target is reached.

Colours are not searched. Before and after the shape search the character is rendered with every
palette role wearing a unique ID colour, so each pixel of the silhouette is known to belong to "hair"
or "tunic" or "boot". The reference's dominant colour under each role's pixels is then assigned to
that role directly, and tools/fit/refs/<who>.colors.json pins win over the guess.

Outputs:
  tools/fit/params/<who>.json   the best parameters found (the game's build picks this up automatically)
  tools/fit/reports/<who>.png   reference | render | overlay, so a human can confirm in a glance
and a one-line verdict on stdout. Exit code 0 when the target score is reached, 2 when it stalled.

The reference should be a front view of the character on a plain or transparent background. Anything
this builder has no part for (a cape, a different hat) will show up as red in the overlay: that is a
request for a new part, not something the search can invent.
"""
import sys, os, json, math, random, subprocess, time, contextlib
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
ITERS = flag("--iters", 500, int)          # render budget for the shape search
TARGET = flag("--target", 0.8, float)      # layout score (0..1) that counts as done
PATIENCE = flag("--patience", 0, int)      # kept for old command lines; the sweep search has its own stop
RES = flag("--res", 160, int)
SEED = flag("--seed", 1, int)
MIRROR = flag("--mirror", "auto", str)     # auto | left | right | off: mirror the better half of the reference
HALF = "--whole" not in args               # build only one side of each mirrored pair and flip it back
if not HALF:
    args.remove("--whole")
SNAP = flag("--snapshot", 0, int)  # write reports/<who>-stage-N.png every N renders, to watch a run
JOBS = flag("--jobs", 1, int)              # run this many seeds in parallel Blenders and keep the best
TAG = flag("--tag", "")                     # set by --jobs for its children: suffix for their work files
FRESH = "--fresh" in args                  # ignore params/<who>.json and start from the builder's defaults
if FRESH:
    args.remove("--fresh")
SUBPROCESS = "--subprocess" in args        # one Blender per render (slow, but isolated) instead of in-process
if SUBPROCESS:
    args.remove("--subprocess")
if len(args) < 2:
    print(__doc__)
    sys.exit(1)
WHO, REF = args[0], os.path.abspath(args[1])
random.seed(SEED)

PARAMS_DIR = os.path.join(ROOT, "tools", "fit", "params")
REPORT_DIR = os.path.join(ROOT, "tools", "fit", "reports")
os.makedirs(PARAMS_DIR, exist_ok=True)
os.makedirs(REPORT_DIR, exist_ok=True)
WORK_PARAMS = os.path.join(REPORT_DIR, f"_{WHO}{TAG}-trial.json")
WORK_RENDER = os.path.join(REPORT_DIR, f"_{WHO}{TAG}-trial.png")
WORK_IDS = os.path.join(REPORT_DIR, f"_{WHO}{TAG}-ids.json")
OUT_PARAMS = os.path.join(PARAMS_DIR, f"{WHO}{TAG}.json")
OUT_REPORT = os.path.join(REPORT_DIR, f"{WHO}{TAG}.png")
OUT_VERDICT = os.path.join(REPORT_DIR, f"_{WHO}{TAG}.verdict")

if JOBS > 1:
    # the same fit from several seeds at once, one Blender each; the best one becomes the result
    import shutil
    base = [BLENDER, "-b", "-P", os.path.abspath(__file__), "--", WHO, REF, "--seed"]
    rest = []
    for k in ("--iters", "--target", "--res", "--snapshot"):
        v = {"--iters": ITERS, "--target": TARGET, "--res": RES, "--snapshot": SNAP}[k]
        rest += [k, str(v)]
    logs = [open(os.path.join(REPORT_DIR, f"_{WHO}-s{SEED + k}.log"), "w") for k in range(JOBS)]
    procs = [subprocess.Popen(base + [str(SEED + k), "--tag", f"-s{SEED + k}"] + rest, stdout=logs[k], stderr=subprocess.STDOUT, cwd=ROOT) for k in range(JOBS)]
    print(f"{JOBS} seeds running in parallel ({SEED}..{SEED + JOBS - 1}); each logs to reports/_{WHO}-s<seed>.log")
    for pr, lg in zip(procs, logs):
        pr.wait()
        lg.close()
    results = []
    for k in range(JOBS):
        tag = f"-s{SEED + k}"
        v = os.path.join(REPORT_DIR, f"_{WHO}{tag}.verdict")
        if os.path.exists(v):
            line = open(v).read().split()
            results.append((float(line[2]), tag, " ".join(line)))
    if not results:
        raise SystemExit("every seed failed; run one seed without --jobs to see why")
    results.sort(reverse=True)
    for sc, tag, line in results:
        print(f"  seed{tag}: {line}")
    best_tag = results[0][1]
    tail = [l for l in open(os.path.join(REPORT_DIR, f"_{WHO}{best_tag}.log")).read().split("\n") if l.startswith(("  ", "colours", "stalled", "complete", "parts costing"))]
    print("\n".join(tail[-16:]))
    # the winner's files become the character's, diagnostics included; only the losers' are dropped
    for src, dst in ((os.path.join(PARAMS_DIR, f"{WHO}{best_tag}.json"), os.path.join(PARAMS_DIR, f"{WHO}.json")),
                     (os.path.join(REPORT_DIR, f"{WHO}{best_tag}.png"), os.path.join(REPORT_DIR, f"{WHO}.png")),
                     (os.path.join(REPORT_DIR, f"_{WHO}{best_tag}.verdict"), os.path.join(REPORT_DIR, f"_{WHO}.verdict")),
                     (os.path.join(REPORT_DIR, f"_{WHO}{best_tag}-labels.png"), os.path.join(REPORT_DIR, f"_{WHO}-labels.png")),
                     (os.path.join(REPORT_DIR, f"_{WHO}{best_tag}.log"), os.path.join(REPORT_DIR, f"_{WHO}.log"))):
        if os.path.exists(src):
            shutil.copy(src, dst)
    keep = {os.path.basename(p_) for p_ in (f"{WHO}{best_tag}.json",)}
    for d in (REPORT_DIR, PARAMS_DIR):
        for f in os.listdir(d):
            if (f.startswith(f"_{WHO}-s") or f.startswith(f"{WHO}-s")) and f not in keep:
                os.remove(os.path.join(d, f))
    for f in os.listdir(PARAMS_DIR):
        if f.startswith(f"{WHO}-s"):
            os.remove(os.path.join(PARAMS_DIR, f))
    print(f"best seed{best_tag} kept: params -> tools/fit/params/{WHO}.json, report -> tools/fit/reports/{WHO}.png")
    sys.exit(0 if results[0][0] >= TARGET else 2)

# ---------- what the builder lets us move ----------
# each character's defaults live in make_character.py; these are the search bounds
BOUNDS = {
    "torso_x": (0.24, 0.56), "torso_y": (0.2, 0.44), "torso_z": (0.2, 0.5),
    "arm_r": (0.06, 0.18), "arm_len": (0.2, 0.6), "hand_r": (0.06, 0.18), "leg_r": (0.08, 0.2), "head_s": (0.82, 1.25),
    "leg_x": (0.1, 0.32), "boot_s": (0.8, 1.8), "gown_s": (0.7, 1.4), "gown_h": (0.8, 1.3),
    # added when the King's overlay showed shapes no earlier control could reach
    "body_h": (0.8, 1.8), "leg_h": (0.6, 1.8), "head_w": (0.8, 1.45), "arm_ang": (0.0, 40.0), "shoulder_s": (0.7, 1.7),
    "crown_s": (0.8, 2.0), "crown_h": (0.7, 2.0), "crown_z": (-0.35, 0.1), "beard_s": (0.8, 1.5), "beard_h": (0.6, 1.3), "hair_w": (0.7, 1.5),
    "hair_fringe": (0.05, 1.3), "hair_flap": (0.8, 1.8),
    "sleeve_len": (0.08, 0.9), "gown_waist": (0.6, 1.25), "foot_h": (0.0, 0.22), "hair_len": (0.3, 1.3), "gown_bell": (0.35, 1.0), "arm_fwd": (0.05, 0.3), "arm_x": (0.24, 0.55),
    # discrete: stepped whole, never nudged
    "crown_points": (3, 6),
}
DISCRETE = {"crown_points"}
_NEW = dict(body_h=1.0, leg_h=1.0, head_w=1.0, arm_ang=0.0, shoulder_s=1.0, hair_w=1.0, hair_fringe=1.0, hair_flap=1.0)
DEFAULTS = {
    "king": dict(torso_x=0.34, torso_y=0.29, torso_z=0.33, arm_r=0.09, arm_len=0.32, hand_r=0.085, leg_r=0.105, head_s=1.0, leg_x=0.14, boot_s=1.0, crown_s=1.0, crown_h=1.0, crown_z=0.0, beard_s=1.0, beard_h=1.0, crown_points=5, **_NEW),
    "queen": dict(torso_x=0.34, torso_y=0.29, torso_z=0.33, arm_r=0.075, arm_len=0.34, hand_r=0.075, leg_r=0.105, head_s=1.0, gown_s=1.0, gown_h=1.0, gown_waist=1.0, sleeve_len=0.3, foot_h=0.1, hair_len=1.0, gown_bell=0.5, arm_fwd=0.16, arm_x=0.34, **_NEW),
    "archer": dict(torso_x=0.34, torso_y=0.29, torso_z=0.33, arm_r=0.09, arm_len=0.32, hand_r=0.085, leg_r=0.105, head_s=1.0, leg_x=0.14, boot_s=1.0, **_NEW),
    "brute": dict(torso_x=0.42, torso_y=0.36, torso_z=0.36, arm_r=0.12, arm_len=0.36, hand_r=0.11, leg_r=0.13, head_s=1.0, leg_x=0.14, boot_s=1.0, **_NEW),
    "boss": dict(torso_x=0.44, torso_y=0.38, torso_z=0.4, arm_r=0.13, arm_len=0.46, hand_r=0.14, leg_r=0.15, head_s=0.92, leg_x=0.14, boot_s=1.0, **_NEW),
}
# what a front view can tell us about each character. torso_y is depth: invisible from the front, so never searched.
_COMMON = ["torso_x", "torso_z", "arm_r", "arm_len", "hand_r", "head_s", "head_w", "body_h", "arm_ang", "shoulder_s", "hair_w", "hair_fringe", "hair_flap"]
# searched in sections, in the order the frame is anchored: the hands set the width and the boots the
# floor, so body first, then stance, then head, then everything together
_BODY = ["torso_x", "torso_z", "body_h", "shoulder_s", "arm_r", "arm_len", "arm_ang", "hand_r", "gown_s", "gown_h", "gown_waist", "gown_bell", "sleeve_len", "foot_h", "arm_fwd", "arm_x"]
_HEAD = ["head_s", "head_w", "hair_w", "hair_fringe", "hair_flap", "hair_len", "beard_s", "beard_h", "crown_s", "crown_h", "crown_z", "crown_points"]
_LEGS = ["leg_r", "leg_x", "boot_s", "leg_h"]
DEFAULTS["swordsman"] = dict(DEFAULTS["archer"])   # same body, different hand
KEYS = {"king": _COMMON + _LEGS + ["crown_s", "crown_h", "crown_z", "beard_s", "beard_h", "crown_points"],
        "queen": _COMMON + ["gown_s", "gown_h", "gown_waist", "gown_bell", "sleeve_len", "foot_h", "hair_len", "arm_fwd", "arm_x"]}
# every palette name the builder knows; each gets a unique flat ID colour for the role render
PALETTE = ["skin", "hair", "beard", "blue", "gold", "leather", "boot", "white", "black", "red", "pink", "blueEye",
           "horse", "muzzle", "mane", "steel", "steelDark", "navy", "darkRed", "ink", "bone", "boneDark", "wood", "glow"]
_levels = [0.0, 0.5, 1.0]
ID_COLORS = [(r, g, b) for r in _levels for g in _levels for b in _levels if (r, g, b) not in ((0, 0, 0), (1, 1, 1))]
ID_OF = {name: ID_COLORS[i] for i, name in enumerate(PALETTE)}
# the builder's default palette (linear) as sRGB, so a role can be matched to the reference by colour
_LIN = {
    "skin": (0.97, 0.80, 0.66), "hair": (0.32, 0.17, 0.07), "beard": (0.38, 0.22, 0.10), "blue": (0.16, 0.42, 0.85),
    "gold": (0.95, 0.70, 0.18), "leather": (0.45, 0.27, 0.14), "boot": (0.32, 0.20, 0.12), "white": (0.97, 0.97, 0.97),
    "black": (0.05, 0.05, 0.06), "red": (0.85, 0.12, 0.14), "pink": (0.94, 0.48, 0.66), "blueEye": (0.25, 0.50, 0.85),
    "horse": (0.91, 0.84, 0.71), "muzzle": (0.85, 0.76, 0.6), "mane": (0.55, 0.36, 0.18),
    "steel": (0.76, 0.78, 0.81), "steelDark": (0.45, 0.48, 0.52), "navy": (0.2, 0.22, 0.34), "darkRed": (0.52, 0.08, 0.1),
    "ink": (0.13, 0.13, 0.16), "bone": (0.93, 0.89, 0.9), "boneDark": (0.82, 0.74, 0.76), "wood": (0.5, 0.33, 0.16), "glow": (1.0, 0.2, 0.2),
}
def _srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
DEFAULT_COL = {k: np.array([_srgb(x) for x in v], np.float32) for k, v in _LIN.items()}
NEAR = 0.3  # how far (RGB) a reference colour may be from a role's default and still count as "that role"

def clusters(px, n=8, rounds=10):
    """The reference's main materials as colour centres (k-means). A shaded tunic collapses to one
    centre instead of hogging every histogram cell, so brown and peach get their own."""
    rng = np.random.default_rng(0)
    if len(px) > 20000:
        px = px[rng.choice(len(px), 20000, replace=False)]
    # seeds: farthest-point sampling, so small but distinct materials get a centre too
    cents = [px[rng.integers(len(px))]]
    for _ in range(n - 1):
        d = np.min(np.stack([np.linalg.norm(px - c, axis=1) for c in cents]), axis=0)
        cents.append(px[np.argmax(d)])
    cents = np.stack(cents)
    for _ in range(rounds):
        lab = np.argmin(np.stack([np.linalg.norm(px - c, axis=1) for c in cents]), axis=0)
        for i in range(n):
            if (lab == i).any():
                cents[i] = px[lab == i].mean(axis=0)
    counts = [(lab == i).sum() for i in range(n)]
    return [(cents[i], counts[i]) for i in range(n) if counts[i] > 0.01 * len(px)]

MIN_ROLE = 0.012  # a role must cover this share of the silhouette to be worth recolouring
# roles worth recolouring from a picture: broad areas. Thin details (beard, eyes, belts) are derived or kept.
RECOLOR = {"skin", "hair", "blue", "red", "pink", "white", "navy", "ink", "bone", "boneDark", "darkRed", "boot", "leather", "gold", "steel", "steelDark", "wood", "horse"}

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

def fill_holes(mask):
    """Background unreachable from the edge of the picture is not background: it is a pale highlight on
    the subject that happened to match the page behind it. A cream tunic on white leaves exactly those,
    and they become holes the model can never fill, so close them."""
    h, w = mask.shape
    bg = ~mask
    seen = np.zeros_like(bg)
    stack = []
    for y, x in [(0, x) for x in range(w)] + [(h - 1, x) for x in range(w)] + [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)]:
        if bg[y, x] and not seen[y, x]:
            seen[y, x] = True
            stack.append((y, x))
    while stack:                      # scanline flood fill: each background pixel is visited once
        y, x = stack.pop()
        x0 = x
        while x0 > 0 and bg[y, x0 - 1] and not seen[y, x0 - 1]:
            x0 -= 1
            seen[y, x0] = True
        x1 = x
        while x1 < w - 1 and bg[y, x1 + 1] and not seen[y, x1 + 1]:
            x1 += 1
            seen[y, x1] = True
        for ny in (y - 1, y + 1):
            if 0 <= ny < h:
                for i in np.where(np.logical_and(bg[ny, x0:x1 + 1], ~seen[ny, x0:x1 + 1]))[0]:
                    nx = x0 + int(i)
                    seen[ny, nx] = True
                    stack.append((ny, nx))
    return ~seen

def foreground(px):
    """Mask of the subject. Alpha if the image has any; otherwise anything unlike the corner colour."""
    a = px[..., 3]
    if a.min() < 0.5:
        return fill_holes(a > 0.5)
    corner = np.median(np.concatenate([px[:4, :4, :3].reshape(-1, 3), px[-4:, -4:, :3].reshape(-1, 3), px[:4, -4:, :3].reshape(-1, 3), px[-4:, :4, :3].reshape(-1, 3)]), axis=0)
    return fill_holes(np.linalg.norm(px[..., :3] - corner, axis=2) > 0.12)

def symmetrise(mask, rgb, choose):
    """These characters are bilaterally symmetric and the art is lit from one side, so one half sits in
    shadow. The model is built symmetric and rendered flat, so that difference is noise in the score
    and it drags shaded colours onto the wrong roles. Find the mirror axis and mirror the named half
    across it. Which half is better is not guessable (brightness gets it wrong), so the caller scores
    both. Returns the symmetric mask and colours, plus a line saying what it did."""
    h, w = mask.shape
    # the mirror axis: flip, then find the shift that best lines the silhouette up with itself
    flipped = mask[:, ::-1]
    best_s, best_iou = 0, -1.0
    for sh in range(-24, 25):
        cand = np.roll(flipped, sh, axis=1)
        union = np.logical_or(mask, cand).sum()
        sc = np.logical_and(mask, cand).sum() / union if union else 0.0
        if sc > best_iou:
            best_iou, best_s = sc, sh
    axis = (w - 1 + best_s) / 2.0
    idx = np.clip(w - 1 + best_s - np.arange(w), 0, w - 1)
    mir_m, mir_c = mask[:, idx], rgb[:, idx]
    cols = np.arange(w)
    use_mir = (cols > axis) if choose == "left" else (cols < axis)
    out_m = np.where(use_mir[None, :], mir_m, mask)
    out_c = np.where(use_mir[None, :, None], mir_c, rgb)
    return out_m, out_c, f"{choose} half mirrored about x={axis:.1f}, halves {int(best_iou * 100)}% alike"

def fit_frame(mask, rgb, n, height):
    """Crop to the mask's bounding box, scale it to n wide (aspect kept), and stand it on the floor of an
    n x height frame, centred. Width and floor rather than the whole box: the hands set the width and
    the boots the floor, so a taller crown or a bigger head moves only head pixels, not the body."""
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return np.zeros((height, n), bool), np.zeros((height, n, 3), np.float32)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    m = mask[y0:y1, x0:x1]
    c = rgb[y0:y1, x0:x1]
    h, w = m.shape
    s = (n - 4) / w
    nh, nw = max(1, int(round(h * s))), max(1, int(round(w * s)))
    yi = np.clip((np.arange(nh) / s).astype(int), 0, h - 1)
    xi = np.clip((np.arange(nw) / s).astype(int), 0, w - 1)
    m2 = m[yi][:, xi]
    c2 = c[yi][:, xi]
    out_m = np.zeros((height, n), bool)
    out_c = np.zeros((height, n, 3), np.float32)
    ox = (n - nw) // 2
    top = height - 2 - nh
    if top < 0:  # taller than the frame: the excess is cut off the top (a wild guess, scored as such)
        m2, c2, top = m2[-top:], c2[-top:], 0
    out_m[top:top + m2.shape[0], ox:ox + nw] = m2
    out_c[top:top + m2.shape[0], ox:ox + nw] = c2
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

def iou_of(ref_m, rn_m):
    inter = np.logical_and(ref_m, rn_m).sum()
    union = np.logical_or(ref_m, rn_m).sum()
    return inter / union if union else 0.0

# ---------- layout: which part is where ----------
# A silhouette cannot tell beard from face or sleeve from tunic, so the search also scores the layout:
# every pixel is labelled by the nearest part colour (in a chroma + dim luminance space, so shading
# on the reference keeps its label) and an overlap only counts when both sides wear the same label.
def feat(rgb):
    rgb = np.asarray(rgb, np.float32)
    s = rgb.sum(-1, keepdims=True) + 1e-6
    # brightness gets a quarter weight: a face in the crown's shadow must still read as skin, not gold
    return np.concatenate([rgb / s, 0.25 * rgb.mean(-1, keepdims=True)], -1)

def make_classes(role_rgb, merge=0.03):
    """Group the parts' colours into classes -> (centres, role -> class). Only near-identical colours
    are merged: a beard painted the same brown as the hair is one class, but a tunic and the skin next
    to it stay separate even when they are close. Merging distinct roles is what costs the search its
    signal; on the archer's muted palette a loose threshold collapsed skin, hair and tunic into one."""
    names = list(role_rgb)
    F = feat(np.array([role_rgb[n] for n in names]))
    centres, of = [], {}
    for i, n in enumerate(names):
        for j, c in enumerate(centres):
            if np.linalg.norm(F[i] - c) < merge:
                of[n] = j
                break
        else:
            centres.append(F[i])
            of[n] = len(centres) - 1
    return np.array(centres, np.float32), of

def label(mask, rgb, centres, maxd=0.3):
    """Class index per pixel: -2 background, -1 foreground unlike every class, else nearest class."""
    out = np.full(mask.shape, -2, np.int32)
    px = rgb[mask]
    if len(px) == 0:
        return out
    d = np.linalg.norm(feat(px)[:, None, :] - centres[None, :, :], axis=2)
    lab = d.argmin(axis=1)
    lab[d.min(axis=1) > maxd] = -1
    out[mask] = lab
    return out

def layout_score(ref_m, ref_lab, m, lab):
    both = np.logical_and(ref_m, m)
    agree = np.logical_and(both, np.logical_or(ref_lab == lab, ref_lab == -1))
    union = np.logical_or(ref_m, m).sum()
    return agree.sum() / union if union else 0.0

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
@contextlib.contextmanager
def quiet():
    """Silence Blender's per-render chatter (it prints straight to fd 1, past sys.stdout)."""
    sys.stdout.flush()
    keep = os.dup(1)
    null = os.open(os.devnull, os.O_WRONLY)
    os.dup2(null, 1)
    try:
        yield
    finally:
        sys.stdout.flush()
        os.dup2(keep, 1)
        os.close(keep)
        os.close(null)

_builder_src = None
def render(params, ids=False, half=False):
    """Build + front-render with these params. In-process by default: the builder resets the scene
    itself, so running it again in the same Blender is a fresh build without the 1 s start-up.
    ids=True colours every part by index instead (see part_table)."""
    global _builder_src
    json.dump(params, open(WORK_PARAMS, "w"))
    argv = ["blender", "-b", "-P", BUILDER, "--", WHO, "-", "--params", WORK_PARAMS, "--front", WORK_RENDER]
    if ids:
        argv += ["--ids", WORK_IDS]
    if half:
        argv += ["--half"]
    if SUBPROCESS:
        r = subprocess.run([BLENDER] + argv[1:], capture_output=True, text=True, cwd=ROOT)
        if not os.path.exists(WORK_RENDER):
            print(r.stdout[-1500:], r.stderr[-1500:])
            raise SystemExit("builder failed")
    else:
        if _builder_src is None:
            _builder_src = compile(open(BUILDER).read(), BUILDER, "exec")
        saved = sys.argv
        sys.argv = argv
        try:
            with quiet():
                exec(_builder_src, {"__name__": "__builder__", "__file__": BUILDER})
        finally:
            sys.argv = saved
        if not os.path.exists(WORK_RENDER):
            raise SystemExit("builder produced no render (run with --subprocess to see its output)")
    px = load_rgba(WORK_RENDER)
    os.remove(WORK_RENDER)
    if half:
        px = unmirror(px)
    return px

def unmirror(px):
    """Put back the side the half build skipped. The camera is centred on the model, so the mirror is
    an exact column flip; parts on the centre line are in both and keep their own pixels."""
    mir = px[:, ::-1]
    have = px[..., 3] > 0.5
    return np.where(have[..., None], px, mir)

def to_props(p):
    return {"torso": [p["torso_x"], p["torso_y"], p["torso_z"]], **{k: v for k, v in p.items() if not k.startswith("torso_")}}

def hexc(c):
    return "#%02x%02x%02x" % tuple(int(round(max(0, min(1, v)) * 255)) for v in c)

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

def compose(ref_m, ref_c, m, c, ref_lab=None, lab=None):
    h, w = ref_m.shape
    panel = lambda mm, cc: np.where(mm[..., None], cc, 1.0).astype(np.float32)
    overlay = np.ones((h, w, 3), np.float32)
    overlay[np.logical_and(ref_m, ~m)] = (0.9, 0.2, 0.2)
    overlay[np.logical_and(m, ~ref_m)] = (0.2, 0.4, 0.9)
    overlay[np.logical_and(ref_m, m)] = (0.55, 0.5, 0.6)
    if ref_lab is not None:  # overlap, but a different part there: yellow
        wrong = np.logical_and(np.logical_and(ref_m, m), np.logical_and(ref_lab != lab, ref_lab != -1))
        overlay[wrong] = (0.95, 0.8, 0.2)
    gap = np.ones((h, 4, 3), np.float32)
    return np.concatenate([panel(ref_m, ref_c), gap, panel(m, c), gap, overlay], axis=1)

# ---------- go ----------
t0 = time.time()
ref = load_rgba(REF)
_fg0, _rgb0 = foreground(ref), ref[..., :3]
# These characters are symmetric but the art is lit from one side. Mirroring one half removes that
# difference, which is pure noise against a symmetric model. Which half reads better is decided by
# score further down, not guessed here.
CANDS = {"off": (_fg0, _rgb0, "reference used whole")}
if MIRROR != "off":
    for _h in ("left", "right"):
        _m2, _c2, _n2 = symmetrise(_fg0, _rgb0, _h)
        CANDS[_h] = (_m2, _c2, _n2)
_fg = CANDS[MIRROR][0] if MIRROR in CANDS else _fg0
_ys, _xs = np.where(_fg0)
# frame: RES wide, the reference's own height plus a quarter of headroom for a taller guess
FRAME_H = int(round((RES - 4) * (_ys.max() - _ys.min() + 1) / (_xs.max() - _xs.min() + 1) * 1.25)) + 2
def framed(name):
    m_, c_, n_ = CANDS[name]
    fm, fc = fit_frame(m_, c_, RES, FRAME_H)
    return fm, fc, n_
ref_m, ref_c, _ = framed(MIRROR if MIRROR in CANDS else "off")
print(f"reference {os.path.basename(REF)}: {ref.shape[1]}x{ref.shape[0]}, subject covers {int(foreground(ref).mean() * 100)}% of the image")

colors = {}

p = dict(DEFAULTS.get(WHO, DEFAULTS["king"]))
existing = os.path.join(PARAMS_DIR, f"{WHO}.json")
if os.path.exists(existing) and not FRESH:
    prev = json.load(open(existing))
    if "props" in prev:
        pr = prev["props"]
        p.update(torso_x=pr["torso"][0], torso_y=pr["torso"][1], torso_z=pr["torso"][2], **{k: v for k, v in pr.items() if k in BOUNDS})
        print("starting from the previous fit")
keys = [k for k in KEYS.get(WHO, _COMMON + _LEGS) if k in p and k in BOUNDS]
_missing = [k for k in KEYS.get(WHO, _COMMON + _LEGS) if k in p and k not in BOUNDS]
if _missing:
    print("not searched, no bounds set for:", ", ".join(_missing))

renders = 0
def render_fit(p, cols, ids=False, aa=True, half=None):
    global renders
    # gear off: the reference holds nothing, and a bow the model cannot put down would be charged as a
    # shape error all run. It is never written to the params file, so exports keep their weapons.
    px = render({"props": dict(to_props(p), gear=0), "colors": cols, "front_res": RES, "front_aa": aa},
                ids=ids, half=HALF if half is None else half)
    renders += 1
    return fit_frame(foreground(px), px[..., :3], RES, FRAME_H)

def part_table(p):
    """Which parts sit where the reference shows something else. Every part is rendered in its own
    colour, so each yellow pixel of the overlay can be charged to a part by name: the list of what to
    add a control for, or take away, next."""
    m, c = render_fit(p, {}, ids=True, aa=False, half=False)
    names = json.load(open(WORK_IDS))
    idx = np.round(c * 7).astype(int)
    part_of = idx[..., 0] + idx[..., 1] * 8 + idx[..., 2] * 64
    rows = []
    for i, (name, role) in enumerate(names):
        sel = np.logical_and(m, part_of == i)
        n = int(sel.sum())
        if n < 4:
            continue
        cls = class_of.get(role, -9)
        inref = np.logical_and(sel, ref_m)
        wrong = np.logical_and(inref, np.logical_and(ref_lab != cls, ref_lab != -1))
        extra = np.logical_and(sel, ~ref_m)
        bad = int(wrong.sum()) + int(extra.sum())
        if bad < 0.004 * ref_m.sum():
            continue
        want = {}
        for l in np.unique(ref_lab[wrong]):
            want[l] = int((ref_lab[wrong] == l).sum())
        want_names = []
        for l, cnt in sorted(want.items(), key=lambda t: -t[1])[:2]:
            roles = [r for r, k in class_of.items() if k == l]
            want_names.append(f"{roles[0] if roles else '?'} {int(100 * cnt / max(1, wrong.sum()))}%")
        rows.append((bad, name, role, n, int(wrong.sum()), int(extra.sum()), ", ".join(want_names)))
    rows.sort(reverse=True)
    print("parts costing the most: part, role, size, share of it sitting on a different part of the reference (and which), share outside the reference")
    for bad, name, role, n, w, e, want in rows[:10]:
        print(f"  {name:14s} {role:9s} {n:5d}px  wrong-part {int(100 * w / n):3d}% ({want})  outside {int(100 * e / n):3d}%")
    # and what the model never reaches: red, by class and height
    red = np.logical_and(ref_m, ~m)
    if red.any():
        ys = np.where(red)[0]
        by = {}
        for l in np.unique(ref_lab[red]):
            roles = [r for r, k in class_of.items() if k == l]
            by[roles[0] if roles else "?"] = int((ref_lab[red] == l).sum())
        top = ", ".join(f"{k} {v}px" for k, v in sorted(by.items(), key=lambda t: -t[1])[:3])
        print(f"  uncovered reference: {int(red.sum())}px, mostly {top}; centred {int(100 * ys.mean() / ref_m.shape[0])}% down the frame")

pins_path = os.path.join(os.path.dirname(REF), f"{WHO}.colors.json")
pins = json.load(open(pins_path)) if os.path.exists(pins_path) else {}

def guess_colours(p):
    """Render the shape with ID colours, then read the reference under each role. Pins win."""
    id_m, id_c = render_fit(p, {name: hexc(ID_OF[name]) for name in PALETTE})
    masks = role_masks(id_m, id_c)
    # Two witnesses per role: WHERE the role sits (the pixels under its mask) and WHAT it looks like
    # (the reference colour nearest its default). Position is brittle when parts sit at different
    # heights, colour is brittle when two roles share a hue, so a role is recoloured when they agree,
    # and by colour alone when its default is unmistakable in the reference.
    cols = {}
    ref_clusters = clusters(ref_c[ref_m])
    for name, m in masks.items():
        if name not in RECOLOR or m.sum() < 0.04 * ref_m.sum():
            continue
        default = DEFAULT_COL[name]
        by_colour, dist = min(((c, np.linalg.norm(c - default)) for c, _ in ref_clusters), key=lambda t: t[1])
        sel = np.logical_and(m, ref_m)
        by_place = dominant(ref_c[sel]) if sel.sum() >= 8 else None
        if by_place is not None and np.linalg.norm(by_place - by_colour) < 0.2:
            cols[name] = hexc(by_place)
        elif dist < NEAR:
            cols[name] = hexc(by_colour)
        elif name in pins:
            pass
        else:
            print(f"  {name}: nothing in the reference looks like it (nearest {hexc(by_colour)}, {dist:.2f} away), keeping the default")
    if "hair" in cols:
        cols["beard"] = cols["hair"]  # a beard is hair
    # pins win: tools/fit/refs/<who>.colors.json holds role colours eyedropped from the reference by a
    # person. Automatic guessing is reliable for broad areas and unreliable for skin, hair and trims on
    # shaded low-poly art, so this is the intended way to settle those in seconds.
    cols.update(pins)
    return cols, masks

# colours first (from the starting shape), so the search can score where each part sits
colors, _ = guess_colours(p)
if pins:
    print("pinned from", os.path.relpath(pins_path, ROOT) + ":", pins)
print("colours:", colors)
# Only the roles this character actually wears. Classing against the whole game palette let colours
# nobody here uses claim reference pixels: the archer's cream tunic came back as "horse" and his sash
# as "blueEye", and the search was then chasing parts that do not exist on him.
render_fit(p, {}, ids=True, half=False)
USED = sorted({role for _, role in json.load(open(WORK_IDS)) if role in DEFAULT_COL})
role_rgb = {name: np.array(hex_to_rgb(colors[name]) if name in colors else DEFAULT_COL[name], np.float32) for name in USED}
centres, class_of = make_classes(role_rgb)
print(f"{WHO} wears {len(USED)} of the {len(PALETTE)} palette roles: {', '.join(USED)}")
ref_lab = label(ref_m, ref_c, centres)
print(f"layout classes: {len(centres)}; {int((ref_lab[ref_m] == -1).mean() * 100)}% of the reference matches no part colour")
class_rgb = {}
for name, cls in class_of.items():
    class_rgb.setdefault(cls, role_rgb[name])
def painted(lab):
    """Each pixel in the flat colour of its class, so a label map can be looked at."""
    out = np.ones(lab.shape + (3,), np.float32)
    for cls, rgb in class_rgb.items():
        out[lab == cls] = rgb
    out[lab == -1] = (1.0, 0.0, 1.0)  # magenta: matched no part
    return out

def evaluate(p):
    m, c = render_fit(p, colors)
    lab = label(m, c, centres)
    return layout_score(ref_m, ref_lab, m, lab), m, c, lab

if HALF:
    # The half build is a proxy for the real character. Prove it matches before trusting it: fitting a
    # model we do not ship is exactly the sort of quiet mismatch that wasted a run earlier.
    hm, hc = render_fit(p, colors, half=True)
    wm, wc = render_fit(p, colors, half=False)
    # Compare what each pixel SHOWS, not just the outline. A part that crosses the centre line is not
    # half of a mirrored pair, and dropping it leaves the silhouette identical while the model loses a
    # feature: a sash that should cross the chest twice came back as a single stroke that way.
    both = np.logical_and(hm, wm)
    same = np.logical_and(both, label(hm, hc, centres) == label(wm, wc, centres))
    agree = min(iou_of(hm, wm), same.sum() / max(1, np.logical_or(hm, wm).sum()))
    if agree < 0.99:
        HALF = False
        print(f"half builds disabled: they differ from the real character (overlap {agree:.3f}); building whole")
    else:
        print(f"half builds on: a third fewer primitives, {agree:.4f} overlap with the real character")

# phase 1: shape and layout, with the colours fixed.
best, best_m, best_c, best_lab = evaluate(p)
if MIRROR == "auto":
    # score the same render against the whole reference and each mirrored half, and keep the best.
    # Relabelling is arithmetic on a render we already have, so this costs no extra Blender work.
    picks = []
    for name in CANDS:
        fm, fc, note = framed(name)
        flab = label(fm, fc, centres)
        picks.append((layout_score(fm, flab, best_m, best_lab), name, fm, fc, flab, note))
    picks.sort(key=lambda t: -t[0])
    print("reference halves: " + ", ".join(f"{n} {sc:.3f}" for sc, n, *_ in picks))
    sc, name, ref_m, ref_c, ref_lab, note = picks[0]
    print(f"using the {name} reading ({note})")
    best, best_m, best_c, best_lab = evaluate(p)
print(f"start  score {best:.3f} (silhouette {iou_of(ref_m, best_m):.3f})  ({len(keys)} controls: {', '.join(keys)})")
step = {k: 0.12 for k in keys}  # as a fraction of each control's range
last_snap = 0

def consider(q, why):
    """Render q; keep it if the score improves. Returns True on improvement."""
    global best, p, best_m, best_c, best_lab, last_snap
    s, m, c, lab = evaluate(q)
    took = s > best + 1e-4
    if took:
        best, p, best_m, best_c, best_lab = s, q, m, c, lab
        print(f"render {renders:4d}  score {best:.3f}  {why}")
    if SNAP and renders - last_snap >= SNAP:
        last_snap = renders
        save_rgb(os.path.join(REPORT_DIR, f"{WHO}{TAG}-stage-{renders}.png"), compose(ref_m, ref_c, best_m, best_c, ref_lab, best_lab))
        print(f"snapshot {renders}: score {best:.3f} silhouette {iou_of(ref_m, best_m):.3f} -> reports/{WHO}{TAG}-stage-{renders}.png")
    return took

def nudged(q, k, sign, size):
    lo, hi = BOUNDS[k]
    if k in DISCRETE:
        v = float(np.clip(round(q[k]) + sign, lo, hi))
    else:
        v = float(np.clip(q[k] + sign * size * (hi - lo), lo, hi))
    if abs(v - q[k]) < 1e-6:
        return None
    r = dict(q)
    r[k] = v
    return r

def local_search(start_step, subset=None, floor=0.008):
    """Sweep every control (or a subset) up and down, halving the step when a sweep helps nothing.
    Runs until the step is under 1% of range, the budget is spent, or the target is met."""
    global step, active
    active = [k for k in (subset or keys) if k in keys]
    step = {k: start_step for k in keys}
    sweep = 0
    while renders < ITERS and best < TARGET:
        sweep += 1
        if not one_sweep():
            for k in keys:
                step[k] *= 0.5
            if max(step.values()) < floor:
                return
            print(f"sweep {sweep}: no gain, step halved to {max(step.values()):.3f} of range")

def one_sweep():
    """Returns True if anything improved this sweep."""
    improved = False
    order = list(active)
    random.shuffle(order)
    for k in order:
        if renders >= ITERS or best >= TARGET:
            break
        for sign in (1, -1):
            q = nudged(p, k, sign, step[k])
            if q is None:
                continue
            if consider(q, f"{k} -> {q[k]:.3f}"):
                improved = True
                # keep walking the same way while it keeps paying
                while renders < ITERS:
                    q = nudged(p, k, sign, step[k])
                    if q is None or not consider(q, f"{k} -> {q[k]:.3f} (again)"):
                        break
                break
    if improved or renders >= ITERS:
        return improved
    # a whole sweep helped nothing: a few random multi-control jumps at this step before a finer one
    for _ in range(4):
        if renders >= ITERS:
            break
        q = dict(p)
        picked = random.sample(active, min(3, len(active)))
        for k in picked:
            lo, hi = BOUNDS[k]
            if k in DISCRETE:
                q[k] = float(np.clip(round(q[k]) + random.choice([-1, 1]), lo, hi))
            else:
                q[k] = float(np.clip(q[k] + random.choice([-1, 1]) * step[k] * (hi - lo) * random.uniform(0.5, 1.5), lo, hi))
        if consider(q, "jump on " + ", ".join(picked)):
            return True
    return False

# sections first: each is a short search over the few controls that shape it, coarse steps only
for label_, subset in (("body", _BODY), ("stance", _LEGS), ("head", _HEAD)):
    if any(k in keys for k in subset):
        local_search(0.12, subset, floor=0.03)
        print(f"section {label_} done: score {best:.3f} after {renders} renders")
# then everything together to convergence
local_search(0.06)
print(f"converged: steps are below 1% of range after {renders} renders")
# basin hopping: kick every control at once and converge again from there, keeping the best of the two.
# One control at a time cannot grow the head and shrink the crown together; a kick can.
top = (best, dict(p), best_m, best_c, best_lab)
hop = 0
while renders < ITERS and best < TARGET:
    hop += 1
    q = dict(top[1])
    for k in keys:
        lo, hi = BOUNDS[k]
        if k in DISCRETE:
            continue
        q[k] = float(np.clip(q[k] + random.uniform(-0.12, 0.12) * (hi - lo), lo, hi))
    best, best_m, best_c, best_lab = evaluate(q)
    p = q
    print(f"hop {hop}: kicked every control, score {best:.3f}; searching again from there")
    local_search(0.06)
    if best > top[0] + 1e-4:
        print(f"hop {hop} found better: {best:.3f} > {top[0]:.3f}")
        top = (best, dict(p), best_m, best_c, best_lab)
    else:
        print(f"hop {hop} ended at {best:.3f}, keeping {top[0]:.3f}")
best, p, best_m, best_c, best_lab = top[0], dict(top[1]), top[2], top[3], top[4]

# phase 2: colours again, now that every part sits where the reference has it
colors, masks = guess_colours(p)
print("colours from reference:", colors)
# pinned roles were chosen by eye, so the colour score only judges what the tool guessed
col = colour_score({k: v for k, v in masks.items() if k not in pins}, ref_m, ref_c, colors)
score, best_m, best_c, best_lab = evaluate(p)
iou = iou_of(ref_m, best_m)
best = float(score)

# ---------- outputs ----------
# plain floats only: numpy's float32 is not JSON-serialisable and would leave this file half-written
out = {"props": {k: ([float(x) for x in v] if isinstance(v, list) else float(v)) for k, v in to_props(p).items()}, "colors": colors,
       "score": round(float(best), 4), "silhouette": round(float(iou), 4), "colour": round(float(col), 4), "reference": os.path.relpath(REF, ROOT)}
json.dump(out, open(OUT_PARAMS, "w"), indent=2)
save_rgb(OUT_REPORT, compose(ref_m, ref_c, best_m, best_c, ref_lab, best_lab))
gap = np.ones((FRAME_H, 4, 3), np.float32)
save_rgb(os.path.join(REPORT_DIR, f"_{WHO}{TAG}-labels.png"), np.concatenate([painted(ref_lab), gap, painted(best_lab)], axis=1))  # how each side was read
part_table(p)
for f in (WORK_PARAMS, WORK_IDS):
    if os.path.exists(f):
        os.remove(f)
missing = int(np.logical_and(ref_m, ~best_m).sum()) / max(1, int(ref_m.sum()))
extra = int(np.logical_and(best_m, ~ref_m).sum()) / max(1, int(ref_m.sum()))
both = np.logical_and(ref_m, best_m)
wrong = int(np.logical_and(both, np.logical_and(ref_lab != best_lab, ref_lab != -1)).sum()) / max(1, int(ref_m.sum()))
verdict = "complete" if best >= TARGET else "stalled"
print(f"{verdict}: score {best:.3f} (target {TARGET}) after {renders} renders in {int(time.time() - t0)}s. silhouette {iou:.3f}, colour {col:.3f}. "
      f"Of the reference: {int(missing * 100)}% has no matching shape (red), {int(wrong * 100)}% has the wrong part there (yellow); "
      f"{int(extra * 100)}% of the model is extra (blue). "
      f"params -> tools/fit/params/{WHO}.json, report -> tools/fit/reports/{WHO}.png")
open(OUT_VERDICT, "w").write(f"{verdict} score {best:.3f} silhouette {iou:.3f} colour {col:.3f} missing {int(missing * 100)}% wrong-part {int(wrong * 100)}% extra {int(extra * 100)}%\n")
sys.exit(0 if best >= TARGET else 2)
