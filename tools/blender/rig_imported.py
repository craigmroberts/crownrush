"""Fit our skeleton to a model from somewhere else, so our animations drive it.

    blender -b -P tools/blender/rig_imported.py -- baked.glb out.glb [--rig public/models/king.glb]
                                                  [--preview p.png] [--measure-only]

The game plays Idle, Walk and Attack from one seven-bone rig that every character shares, which is
what keeps a crowd cheap. A model generated elsewhere has no bones at all. This takes the rig and the
animations out of one of our own characters, moves the bones to match the new body, and binds the mesh
to them.

Moving the bones is the point. Poses are stored as rotations relative to each bone's rest position, so
a skeleton whose shoulders sit where THIS model's shoulders sit will play our existing animations and
bend in the right places. Inheriting our King's proportions instead would bend the new model at his
joints, not its own.

Where the joints are is measured off the mesh, not assumed: slice it horizontally, and read the crotch
off the highest slice where the legs are still two separate masses, the neck off the narrowest slice
under the head, and the shoulders off the step out into the arms.
"""
import sys, os, math
import numpy as np
import bpy
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def flag(name, default, cast=str):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return cast(v)
    return default
RIG_FROM = flag("--rig", "public/models/king.glb")
PREVIEW = flag("--preview", "")
# When the arms never separate from the body in the front silhouette -- thick bare arms on a wide
# torso, or a held weapon bridging the gap -- there is nothing to measure. Set them by eye instead,
# reading the numbers off the --measure-img.
ARM_X = flag("--arm-x", 0.0, float)
ARM_R = flag("--arm-r", 0.0, float)
# A mounted character is a different skeleton: four horse legs that carry the gait, a horse head that
# bobs, a body, and a rider sitting on it. The humanoid rules cannot describe it, so --mounted places
# and weights those bones instead. The rider's own legs never move in any mounted clip, so they ride
# with his spine and only his arms and head are treated separately.
MOUNTED = "--mounted" in args
if MOUNTED:
    args.remove("--mounted")
NO_ARMS = "--no-arms" in args    # let the arms ride with the body: right for a gown, where a swung
if NO_ARMS:                      # arm drags the skirt with it however the weights are scoped
    args.remove("--no-arms")
MEASURE_ONLY = "--measure-only" in args
if MEASURE_ONLY:
    args.remove("--measure-only")
if len(args) < 1:
    print(__doc__)
    sys.exit(1)
SRC = os.path.abspath(args[0])
OUT = os.path.abspath(args[1]) if len(args) > 1 else ""

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------- the new body ----------
bpy.ops.import_scene.gltf(filepath=SRC)
mesh_objs = [o for o in bpy.data.objects if o.type == "MESH"]
if not mesh_objs:
    sys.exit("no mesh in " + SRC)
body = mesh_objs[0]
bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = body.data
co = np.empty(len(me.vertices) * 3, np.float32)
me.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)

def occupancy(obj, co, nz=160, nx=97):
    """A front-on occupancy grid, found by firing a ray through the body at each (x, z).

    Slicing the vertices was tried first and is wrong on a low-poly mesh: vertices sit only at feature
    edges, so a thin slice through a big flat panel finds nothing and reads as empty space. Rays hit
    the surface wherever it actually is.
    """
    z = co[:, 2]
    z0, z1 = float(z.min()), float(z.max())
    H = z1 - z0
    half = max(float(np.abs(co[:, 0]).max()), 1e-3) * 1.05
    y0 = float(co[:, 1].min()) - 10 * H
    zs = z0 + (np.arange(nz) + 0.5) / nz * H
    xs = np.linspace(-half, half, nx)
    grid = np.zeros((nz, nx), bool)
    for i, zz in enumerate(zs):
        for j, xx in enumerate(xs):
            hit, _, _, _ = obj.ray_cast(Vector((float(xx), y0, float(zz))), Vector((0, 1, 0)))
            grid[i, j] = hit
    return grid, zs, xs, z0, z1, H

def measure(obj, co):
    grid, zs, xs, z0, z1, H = occupancy(obj, co)
    nz, nx = grid.shape
    width = np.zeros(nz)
    for i in range(nz):
        on = np.where(grid[i])[0]
        width[i] = (xs[on.max()] - xs[on.min()]) if len(on) else 0.0

    # the crotch: between the legs a ray down the middle passes clean through, so the centre column is
    # empty from the floor up to where the legs meet
    centre = np.abs(xs) < 0.04 * H
    solid_mid = grid[:, centre].any(axis=1)
    crotch = z0 + 0.42 * H
    i = 0
    while i < nz and not solid_mid[i]:      # skip the gap that starts at the floor
        i += 1
    if 0 < i < int(nz * 0.7):
        crotch = float(zs[i])

    # leg centres, read at a height that is definitely leg and not boot
    li = max(0, min(nz - 1, int((crotch - z0) / H * nz * 0.55)))
    on = np.where(grid[li])[0]
    leg_x = 0.12 * H
    if len(on):
        right = [xs[j] for j in on if xs[j] > 0.01 * H]
        leg_x = float((min(right) + max(right)) / 2) if right else leg_x   # centre of the leg, not its median column

    # The neck is the narrowest slice under the head. Searching as high as 90% finds the inside of a
    # tall helmet spike instead, which put a guard's neck above his own shoulders; 80% stays under any
    # headgear while still clearing the chest.
    lo_n, hi_n = int(nz * 0.55), int(nz * 0.80)
    band = [(width[i], i) for i in range(lo_n, hi_n) if width[i] > 0]
    neck = float(zs[min(band)[1]]) if band else z0 + 0.78 * H

    # the shoulders: coming DOWN from the neck, the body steps out as the arms begin. Taking the widest
    # slice instead finds the belt, which on a tunic is wider than the shoulders and half a body lower.
    ni = int(np.clip((neck - z0) / H * nz, 1, nz - 1))
    lo_s = max(1, ni - int(nz * 0.22))
    steps = [(width[i] - width[i + 1], i) for i in range(lo_s, ni)]
    si = max(steps)[1] if steps else int(nz * 0.64)
    shoulder = float(zs[si])
    # The arm, measured rather than guessed. Half way down its length the silhouette usually breaks into
    # runs -- body in the middle, an arm either side -- and the outer run IS the arm, so its centre and
    # its half width are the bone position and the capsule radius. Guessing both from the total width
    # instead put the bone inside a wide skirt and the capsule then dragged the skirt with the arm.
    ci = int(np.clip((crotch - z0) / H * nz, 0, nz - 1))
    mi = int((si + ci) / 2)
    arm_x, r_arm, runs = width[mi] / 2 * 0.82, width[mi] / 2 * 0.18, []

    def runs_at(i):
        out, j = [], 0
        row = grid[i]
        while j < nx:
            if row[j]:
                k = j
                while k + 1 < nx and row[k + 1]:
                    k += 1
                out.append((j, k))
                j = k + 1
            else:
                j += 1
        return out

    # Try several heights down the arm, not just the midpoint. Where a held weapon or a thick torso
    # merges everything into one run the measurement falls back to a fraction of the total width, which
    # on a brute with a mace put the bone out past his arm and the capsule then took the tunic with it.
    best = None
    for frac in (0.5, 0.38, 0.62, 0.3, 0.7):
        i = int(si + (ci - si) * frac)
        rs = runs_at(int(np.clip(i, 0, nz - 1)))
        outer = [(lo, hi) for lo, hi in rs if xs[lo] > 0.02 * H]
        if len(rs) >= 3 and outer:
            lo, hi = max(outer, key=lambda t: xs[t[1]])
            cand_r = float((xs[hi] - xs[lo]) / 2)
            if cand_r > 0.015 * H and (best is None or cand_r < best[1]):
                best = (float((xs[lo] + xs[hi]) / 2), cand_r, len(rs))
    if best:
        arm_x, r_arm, nruns = best
        runs = [0] * nruns
    else:
        runs = runs_at(mi)
    return dict(z0=z0, z1=z1, H=H, crotch=crotch, leg_x=leg_x, neck=neck, shoulder=shoulder,
                arm_x=arm_x, r_arm=r_arm, arm_runs=len(runs), grid=grid, zs=zs, xs=xs, width=width)

a = measure(body, co)
print("measured: height %.3f, crotch %.3f (%.0f%%), legs at x %.3f, shoulders %.3f (%.0f%%), arms at x %.3f, neck %.3f (%.0f%%)"
      % (a["H"], a["crotch"], 100 * (a["crotch"] - a["z0"]) / a["H"], a["leg_x"],
         a["shoulder"], 100 * (a["shoulder"] - a["z0"]) / a["H"], a["arm_x"],
         a["neck"], 100 * (a["neck"] - a["z0"]) / a["H"]))
print("  arm measured as its own run: half width %.3f, %d runs across the body at that height"
      % (a["r_arm"], a["arm_runs"]))
MEASURE_IMG = flag("--measure-img", "")
if MEASURE_IMG:
    # the occupancy grid with the landmarks drawn on it, so a wrong reading is obvious at a glance
    g = a["grid"]
    img = np.where(g[..., None], np.array([0.25, 0.28, 0.33], np.float32), np.ones(3, np.float32))
    zs_, xs_ = a["zs"], a["xs"]
    def row(zv):
        return int(np.clip((zv - a["z0"]) / a["H"] * len(zs_), 0, len(zs_) - 1))
    def col(xv):
        return int(np.clip((xv - xs_[0]) / (xs_[-1] - xs_[0]) * len(xs_), 0, len(xs_) - 1))
    for zv, c in ((a["crotch"], (0.9, 0.2, 0.2)), (a["shoulder"], (0.1, 0.5, 0.9)), (a["neck"], (0.95, 0.7, 0.1))):
        img[row(zv), :] = c
    for xv in (a["leg_x"], -a["leg_x"]):
        img[:row(a["crotch"]), col(xv)] = (0.9, 0.2, 0.2)
    for xv in (a["arm_x"], -a["arm_x"]):
        img[row(a["crotch"]):row(a["neck"]), col(xv)] = (0.1, 0.5, 0.9)
    img = img[::-1]                                     # z up
    img = img.repeat(4, axis=0).repeat(4, axis=1)
    h_, w_, _ = img.shape
    out_img = bpy.data.images.new("measure", w_, h_, alpha=True)
    out_img.pixels = np.concatenate([img[::-1], np.ones((h_, w_, 1), np.float32)], axis=2).reshape(-1).tolist()
    out_img.filepath_raw = os.path.abspath(MEASURE_IMG)
    out_img.file_format = "PNG"
    out_img.save()
    print("measure image", MEASURE_IMG)
if MEASURE_ONLY:
    sys.exit(0)

# ---------- our skeleton and our animations ----------
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(RIG_FROM))
added = [o for o in bpy.data.objects if o not in before]
arm = next((o for o in added if o.type == "ARMATURE"), None)
if arm is None:
    sys.exit("no armature in " + RIG_FROM)
for o in added:                     # the donor's own mesh goes; we only wanted its bones and clips
    if o.type != "ARMATURE":
        bpy.data.objects.remove(o, do_unlink=True)
arm.matrix_world = Matrix.Identity(4)
print("rig from %s: %d bones, clips %s" % (os.path.basename(RIG_FROM), len(arm.data.bones),
      [t.name for t in (arm.animation_data.nla_tracks if arm.animation_data else [])]))

if MOUNTED:
    # measure the horse: the legs are thin columns, the barrel above them is not, so the height where
    # the slice suddenly holds many more vertices is the belly
    zc_, yc_, xc_ = co[:, 2], co[:, 1], co[:, 0]
    z0m, z1m = float(zc_.min()), float(zc_.max())
    Hm = z1m - z0m
    NS = 120
    idxm = np.clip(((zc_ - z0m) / Hm * NS).astype(int), 0, NS - 1)
    counts = np.array([int((idxm == i).sum()) for i in range(NS)])
    # Look for the jump only where a belly can plausibly be. Searching from the floor finds the hooves,
    # which are chunky enough to look like a body and put the belly at a tenth of the figure's height,
    # leaving everything but the feet welded to the barrel.
    base = max(1.0, float(np.median(counts[int(NS * 0.10): int(NS * 0.22)])))
    belly = z0m + 0.32 * Hm
    for i in range(int(NS * 0.22), int(NS * 0.48)):
        if counts[i] > base * 2.5:
            belly = z0m + (i + 0.5) / NS * Hm
            break
    belly = float(flag("--belly", belly, float))
    y_lo, y_hi = float(yc_.min()), float(yc_.max())
    saddle = z0m + 0.52 * Hm          # where the rider begins, as a share of a mounted figure's height
    neck_r = z0m + 0.74 * Hm          # the rider's neck
    shoulder_r = z0m + 0.70 * Hm
    head_front = y_lo + (y_hi - y_lo) * 0.22     # the horse's head and neck are the forward mass
    print("mounted: height %.2f, belly %.2f (%.0f%%), saddle %.2f, y %.2f..%.2f"
          % (Hm, belly, 100 * (belly - z0m) / Hm, saddle, y_lo, y_hi))

bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
foot = a["z0"] + 0.02 * a["H"]
place = {
    "root":  ((0, 0, a["crotch"]),               (0, 0, a["crotch"] + 0.10 * a["H"])),
    "spine": ((0, 0, a["crotch"] + 0.10 * a["H"]), (0, 0, a["neck"])),
    "head":  ((0, 0, a["neck"]),                 (0, 0, a["z1"])),
    "arm.L": ((a["arm_x"], 0, a["shoulder"]),    (a["arm_x"], 0, a["shoulder"] - 0.26 * a["H"])),
    "arm.R": ((-a["arm_x"], 0, a["shoulder"]),   (-a["arm_x"], 0, a["shoulder"] - 0.26 * a["H"])),
    "leg.L": ((a["leg_x"], 0, a["crotch"]),      (a["leg_x"], 0, foot)),
    "leg.R": ((-a["leg_x"], 0, a["crotch"]),     (-a["leg_x"], 0, foot)),
}
# Keep each bone's roll. A pose is a rotation in the bone's own axes, and roll is what fixes those
# axes about its length; zeroing it silently re-aims every key, which showed up as an arm swinging
# sideways and tearing at the shoulder instead of swinging forward. The new bones point the same way
# as the old ones, so the original roll still means the same thing.
rolls = {b.name: b.roll for b in eb}
if MOUNTED:
    # the horse's four legs sit under the four corners of the barrel; front is -Y
    leg_x = (float(np.percentile(np.abs(co[co[:, 2] < belly][:, 0]), 70)) if (co[:, 2] < belly).any()
             else 0.1 * Hm)
    front_y = y_lo + (y_hi - y_lo) * 0.30
    back_y = y_lo + (y_hi - y_lo) * 0.72
    place = {
        "horse":   ((0, (y_lo + y_hi) / 2, belly + 0.12 * Hm), (0, y_lo + (y_hi - y_lo) * 0.25, belly + 0.12 * Hm)),
        "hhead":   ((0, head_front + 0.06 * Hm, belly + 0.22 * Hm), (0, y_lo, belly + 0.30 * Hm)),
        "hleg.FL": ((leg_x, front_y, belly), (leg_x, front_y, z0m + 0.02 * Hm)),
        "hleg.FR": ((-leg_x, front_y, belly), (-leg_x, front_y, z0m + 0.02 * Hm)),
        "hleg.BL": ((leg_x, back_y, belly), (leg_x, back_y, z0m + 0.02 * Hm)),
        "hleg.BR": ((-leg_x, back_y, belly), (-leg_x, back_y, z0m + 0.02 * Hm)),
        "root":    ((0, 0, saddle), (0, 0, saddle + 0.04 * Hm)),
        "spine":   ((0, 0, saddle + 0.04 * Hm), (0, 0, neck_r)),
        "head":    ((0, 0, neck_r), (0, 0, z1m)),
        "arm.L":   ((0.16 * Hm, 0, shoulder_r), (0.16 * Hm, 0, shoulder_r - 0.10 * Hm)),
        "arm.R":   ((-0.16 * Hm, 0, shoulder_r), (-0.16 * Hm, 0, shoulder_r - 0.10 * Hm)),
        "leg.L":   ((0.10 * Hm, 0, saddle), (0.10 * Hm, 0, saddle - 0.06 * Hm)),
        "leg.R":   ((-0.10 * Hm, 0, saddle), (-0.10 * Hm, 0, saddle - 0.06 * Hm)),
    }
    print("  horse legs at x %.2f, front y %.2f, back y %.2f" % (leg_x, front_y, back_y))

for name, (head, tail) in place.items():
    b = eb.get(name)
    if b is None:
        print("  no bone named", name, "in the donor rig")
        continue
    b.head, b.tail = Vector(head), Vector(tail)
    b.roll = rolls.get(name, 0.0)
bpy.ops.object.mode_set(mode="OBJECT")

# ---------- bind ----------
# Blender's automatic (bone heat) weighting is the obvious choice and it fails flat on remeshed
# generated geometry: it returned no weights at all, and the exporter then wrote the skeleton as plain
# empties with an unskinned mesh hanging off it. Weight by anatomy instead, which is also what our own
# characters do -- each part belongs wholly to one bone -- so the deformation matches the house style
# rather than fighting it. A narrow blend band keeps the joins from tearing.
co = np.empty(len(me.vertices) * 3, np.float32)
me.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)
x, z = co[:, 0], co[:, 2]
if MOUNTED:
    y = co[:, 1]
    mid_y = (y_lo + y_hi) / 2
    weights = {}
    below = z < belly                                   # everything under the barrel is leg
    for nm, sx, fwd in (("hleg.FL", 1, True), ("hleg.FR", -1, True), ("hleg.BL", 1, False), ("hleg.BR", -1, False)):
        side = (x > 0) if sx > 0 else (x <= 0)
        half = (y < mid_y) if fwd else (y >= mid_y)
        weights[nm] = (below & side & half).astype(np.float64)
    rider = z >= saddle
    horse_head = (~below) & (~rider) & (y < head_front)
    weights["hhead"] = horse_head.astype(np.float64)
    weights["horse"] = ((~below) & (~rider) & (~horse_head)).astype(np.float64)
    headness_r = np.clip((z - neck_r) / (0.04 * Hm), 0, 1) * rider
    weights["head"] = headness_r
    weights["spine"] = (rider.astype(np.float64) - headness_r).clip(0, 1)
    weights["arm.L"] = np.zeros(len(co))                # mounted arms only move in Attack; leaving them
    weights["arm.R"] = np.zeros(len(co))                # on the spine costs that swing and nothing else
    weights["leg.L"] = np.zeros(len(co))
    weights["leg.R"] = np.zeros(len(co))
    weights["root"] = np.zeros(len(co))
band = 0.05 * a["H"]
ramp = lambda t: np.clip(t, 0.0, 1.0)
legness = ramp((a["crotch"] + band - z) / (2 * band))
headness = ramp((z - (a["neck"] - band)) / (2 * band))
# The arm is everything near the arm BONE, not everything out past some x. A sideways threshold cannot
# tell a sleeve from a tunic, and on a King whose skirt is wider than his shoulders it handed half the
# skirt to the arm, which then tore it off at the shoulder on the first frame of the walk.
y = co[:, 1]
# The capsule starts a little BELOW the shoulder. Reaching all the way up to it caught the bodice,
# which is continuous with the sleeve there, and the swing then dragged the side of the gown out into
# a sheet. The top of the sleeve stays with the body, which is also where it barely moves.
zc = np.clip(z, a["shoulder"] - 0.26 * a["H"], a["shoulder"] - 0.06 * a["H"])
if ARM_X:
    a["arm_x"] = ARM_X
r_arm = max(1e-3, (ARM_R if ARM_R else a["r_arm"] * 1.35))
d_arm = np.sqrt((np.abs(x) - a["arm_x"]) ** 2 + y ** 2 + (z - zc) ** 2)
# a tight blend on the arm. A wide one leaves vertices half on the bone and half on the body, and the
# swing then stretches the geometry between them into a ribbon instead of moving the arm as one piece
arm_band = band * 0.35
armness = ramp((r_arm + arm_band - d_arm) / (2 * arm_band)) * (1 - legness) * (1 - headness)
if NO_ARMS:
    armness = np.zeros_like(armness)
spineness = np.clip(1.0 - legness - headness - armness, 0.0, 1.0)
right = x > 0
if not MOUNTED:
    weights = {
        "leg.L": legness * right, "leg.R": legness * ~right,
        "arm.L": armness * right, "arm.R": armness * ~right,
        "head": headness, "spine": spineness,
    }
for g in list(body.vertex_groups):
    body.vertex_groups.remove(g)
for name, w in weights.items():
    if name not in arm.data.bones:
        continue
    vg = body.vertex_groups.new(name=name)
    idx = np.where(w > 1e-4)[0]
    for i in idx:                       # add() takes a list, so one call per distinct weight bucket
        vg.add([int(i)], float(w[i]), "REPLACE")
body.parent = arm
body.matrix_parent_inverse = arm.matrix_world.inverted()
mod = body.modifiers.new("Armature", "ARMATURE")
mod.object = arm
total = sum(w for w in weights.values())
print("arm capsule radius %.3f around x=%.3f" % (r_arm, a["arm_x"]))
print("bound by anatomy: " + ", ".join("%s %d" % (n, int((w > 1e-4).sum())) for n, w in weights.items()))
print("  %d of %d vertices carry no weight" % (int((total < 1e-4).sum()), len(co)))

if OUT:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True,
                              use_selection=True, export_animations=True)
    print("exported", OUT)

if PREVIEW:
    # the walk, mid stride: a rig that binds badly shows it in motion, not in the rest pose
    for t in arm.animation_data.nla_tracks:
        t.mute = t.name != "Walk"
    scene.frame_set(7)
    for m in bpy.data.materials:
        b = m.node_tree.nodes.get("Principled BSDF") if m.node_tree else None
        if b:
            b.inputs["Roughness"].default_value = 1.0
            for spec in ("Specular IOR Level", "Specular"):
                if spec in b.inputs:
                    b.inputs[spec].default_value = 0.0
                    break
    world = bpy.data.worlds.new("studio")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.85
    for loc, energy, size in (((2.6, -3.4, 3.6), 260, 4.5), ((-3.2, -2.4, 1.8), 90, 6.0), ((0, 3.4, 3.2), 110, 5.0)):
        bpy.ops.object.light_add(type="AREA", location=loc)
        L = bpy.context.active_object
        L.data.energy = energy
        L.data.size = size
        L.rotation_euler = (Vector((0, 0, 1.05)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.camera_add(location=(0, -9.0, (a["z0"] + a["z1"]) / 2))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = a["H"] * 1.2
    scene.camera = cam
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = -0.45
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 64
    scene.render.resolution_x = scene.render.resolution_y = 900
    scene.render.film_transparent = True
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(PREVIEW)
    px = list(im.pixels[:])
    for i in range(0, len(px), 4):
        al = px[i + 3]
        for k in range(3):
            px[i + k] = px[i + k] * al + (1.0 - al)
        px[i + 3] = 1.0
    im.pixels = px
    im.filepath_raw = PREVIEW
    im.file_format = "PNG"
    im.save()
    print("preview", PREVIEW)
