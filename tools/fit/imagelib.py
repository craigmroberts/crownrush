"""Reading a picture of a character: masks, frames, colour classes and the scores built on them.

Shared by the fitter, which searches with them, and the inspector, which reports with them, so the
two can never drift into measuring subtly different things.
"""
import numpy as np
import bpy

# every palette name the builder knows; each gets a unique flat ID colour for the role render
PALETTE = ["skin", "hair", "beard", "blue", "gold", "leather", "boot", "white", "black", "red", "pink", "blueEye",
           "horse", "muzzle", "mane", "steel", "steelDark", "navy", "darkRed", "ink", "bone", "boneDark", "wood", "glow"]
_levels = [0.0, 0.5, 1.0]
ID_COLORS = [(r, g, b) for r in _levels for g in _levels for b in _levels if (r, g, b) not in ((0, 0, 0), (1, 1, 1))]
ID_OF = {name: ID_COLORS[i] for i, name in enumerate(PALETTE)}

_LIN = {
    "skin": (0.97, 0.80, 0.66), "hair": (0.32, 0.17, 0.07), "beard": (0.38, 0.22, 0.10), "blue": (0.16, 0.42, 0.85),
    "gold": (0.95, 0.70, 0.18), "leather": (0.45, 0.27, 0.14), "boot": (0.32, 0.20, 0.12), "white": (0.97, 0.97, 0.97),
    "black": (0.05, 0.05, 0.06), "red": (0.85, 0.12, 0.14), "pink": (0.94, 0.48, 0.66), "blueEye": (0.25, 0.50, 0.85),
    "horse": (0.91, 0.84, 0.71), "muzzle": (0.85, 0.76, 0.6), "mane": (0.55, 0.36, 0.18),
    "steel": (0.76, 0.78, 0.81), "steelDark": (0.45, 0.48, 0.52), "navy": (0.2, 0.22, 0.34), "darkRed": (0.52, 0.08, 0.1),
    "ink": (0.13, 0.13, 0.16), "bone": (0.93, 0.89, 0.9), "boneDark": (0.82, 0.74, 0.76), "wood": (0.5, 0.33, 0.16), "glow": (1.0, 0.2, 0.2),
}
def hexc(c):
    return "#%02x%02x%02x" % tuple(int(round(max(0, min(1, v)) * 255)) for v in c)

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

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
