"""Build a rigged, animated chibi character in Blender and export it as GLB.

Run headless:  blender -b -P tools/blender/make_character.py -- king public/models/king.glb .shots/king-blender.png

To look at a character in Blender yourself, add --blend and open the file it writes:
    blender -b -P tools/blender/make_character.py -- king - --blend .blend/king.blend
    open .blend/king.blend
Characters face -Y in Blender, which the glTF exporter turns into +Z (what the game expects).
"""
import sys, math, bpy
from mathutils import Vector

import json, os
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
# flags: --params <json>  override proportions and colours (see tools/fit/README.md)
#        --front <png>    flat orthographic front render on a transparent background (what the fitter scores)
def flag(name, default=None):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return v
    return default
PARAMS_PATH = flag("--params")
FRONT = flag("--front")
STUDIO = flag("--studio")  # a lit presentation render on white: matte, soft key light, real occlusion
IDS = flag("--ids")  # with --front: colour every part by index and write [[part, role], ...] to this JSON
# --half builds only the +X side of every mirrored pair. These characters are symmetric and the fitter
# mirrors the render back to whole in numpy for free, so a third of the primitives need never be made.
# Never use it for an exported model: it is a fitting proxy, not the character.
HALF = "--half" in args
if HALF:
    args.remove("--half")
BLEND = flag("--blend")  # also save a .blend file, to open the character in Blender and look at it
WHO = args[0] if args else "king"
OUT = args[1] if len(args) > 1 else f"public/models/{WHO}.glb"   # "-" skips the export
PREVIEW = args[2] if len(args) > 2 else None
# The fitter's render needs geometry only: no rig, no animation, no join, no export. Skipping them
# roughly halves the cost of one of its tries.
FAST = bool(FRONT) and OUT == "-" and not PREVIEW
IDLE_ARM_SWING = 0.12  # radians the Idle pose turns the arms about the bone's z (its arm.L/arm.R keys); that is inward
# A fitted look (tools/fit) is picked up automatically when building the game's models.
# who borrows whose fit: the mounted king is the king, and the swordsman is the archer with a sword
SHARES = {"king_mounted": "king", "swordsman": "archer"}
if PARAMS_PATH is None:
    for cand in (WHO, SHARES.get(WHO, WHO.split("_")[0])):
        auto = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fit", "params", f"{cand}.json")
        if os.path.exists(auto):
            PARAMS_PATH = auto
            break
PARAMS = json.load(open(PARAMS_PATH)) if PARAMS_PATH else {}
PROPS = PARAMS.get("props", {})
# props.gear = 0 leaves off weapons, shields and helmets. The fitter sets it so it scores the body
# against a reference holding nothing; the game always builds with the gear on.
GEAR = bool(PROPS.get("gear", 1))

# ---------- scene reset ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24

# ---------- palette ----------
COL = {
    "skin": (0.97, 0.80, 0.66), "hair": (0.32, 0.17, 0.07), "beard": (0.38, 0.22, 0.10), "blue": (0.16, 0.42, 0.85),
    "gold": (0.95, 0.70, 0.18), "leather": (0.45, 0.27, 0.14), "boot": (0.32, 0.20, 0.12), "white": (0.97, 0.97, 0.97),
    "black": (0.05, 0.05, 0.06), "red": (0.85, 0.12, 0.14), "pink": (0.94, 0.48, 0.66), "blueEye": (0.25, 0.50, 0.85),
    "horse": (0.91, 0.84, 0.71), "muzzle": (0.85, 0.76, 0.6), "mane": (0.55, 0.36, 0.18),
    "steel": (0.76, 0.78, 0.81), "steelDark": (0.45, 0.48, 0.52), "navy": (0.2, 0.22, 0.34), "darkRed": (0.52, 0.08, 0.1),
    "ink": (0.13, 0.13, 0.16), "bone": (0.93, 0.89, 0.9), "boneDark": (0.82, 0.74, 0.76), "wood": (0.5, 0.33, 0.16), "glow": (1.0, 0.2, 0.2),
}
def lin(c):
    """sRGB 0..1 -> linear, which is what Blender's colour inputs expect."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_to_rgb(h):
    """#rrggbb (sRGB, what a picture or a colour picker gives you) -> linear. Without this every
    overridden colour renders lighter and paler than asked."""
    h = h.lstrip("#")
    return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))
for _name, _hex in PARAMS.get("colors", {}).items():
    COL[_name] = hex_to_rgb(_hex)
mats = {}
def material(name):
    if name in mats:
        return mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*COL[name], 1.0)
    m.diffuse_color = (*COL[name], 1.0)  # Workbench (the fitter's flat render) reads this, not the node
    bsdf.inputs["Roughness"].default_value = 0.45 if name == "gold" else 0.8
    bsdf.inputs["Metallic"].default_value = 0.15 if name == "gold" else 0.0
    if name == "glow":
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.15, 0.15, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 4.0
    mats[name] = m
    return m

parts = []
Z_OFF = 0.0
LEG_X = 0.14
ROYAL = WHO in ("king", "queen", "king_mounted")
SEG = (16, 12) if ROYAL else (12, 9)
# Level of detail by size: a 2 cm pupil does not need the same mesh density as the head.
# Keeps the silhouette of big parts and drops ~3x triangles overall (the game shows 100+ characters).
def lod(size):
    if size <= 0.05:
        return (6, 4)
    if size <= 0.12:
        return (8, 6)
    if size <= 0.25:
        return (12, 8)
    return SEG

def part(kind, name, loc, scale=(1, 1, 1), rot=(0, 0, 0), color="skin", bone="spine", smooth=True, sub=1, sides=None, bevel=None, **kw):
    """One primitive.

    kind "box" is a cube whose `scale` is its half-extents (same meaning as a sphere's radii) with a
    bevel modifier: flat faces, rounded corners. That is the shape faceted reference art is made of.
    `sides` gives a cylinder or cone that many flat faces; 4 makes a square prism, turned so a face
    points at the camera and widened so its flat-to-flat width equals the diameter it replaces.
    """
    if HALF and name.endswith(".R"):
        return None
    loc = (loc[0], loc[1], loc[2] + Z_OFF)
    size = max(scale[0], scale[1]) if kind in ("sphere", "cyl", "cone", "box") else max(scale)
    seg = lod(size)
    if BOXY:
        smooth = False
        if kind == "cube":
            sub = 0                      # subdividing a cube rounds it into a blob; chamfer it instead
            bevel = 0.1 if bevel is None else bevel
        if kind in ("cyl", "cone", "frustum") and sides is None:
            sides = 8
        if sides == 4:
            rot = (rot[0], rot[1], rot[2] + math.pi / 4)
            if kind == "frustum":
                kw = dict(kw, r1=kw["r1"] * math.sqrt(2), r2=kw["r2"] * math.sqrt(2))
            else:
                scale = (scale[0] * math.sqrt(2), scale[1] * math.sqrt(2), scale[2])
    if kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=seg[0], ring_count=seg[1], location=loc)
    elif kind == "box":
        bpy.ops.mesh.primitive_cube_add(size=2, location=loc)
    elif kind == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    elif kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=1, vertices=sides or min(seg[0], SEG[0]), location=loc)
    elif kind == "cone":
        bpy.ops.mesh.primitive_cone_add(radius1=1, radius2=0, depth=1, vertices=sides or (8 if size <= 0.12 else 12), location=loc)
    elif kind == "frustum":
        bpy.ops.mesh.primitive_cone_add(radius1=kw["r1"], radius2=kw["r2"], depth=kw["depth"], vertices=sides or 20, location=loc)
        scale = (1, 1, 1)
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(major_radius=scale[0], minor_radius=kw.get("minor", 0.04), major_segments=8 if BOXY else 16, minor_segments=4 if BOXY else 6, location=loc)
        scale = (1, 1, 1)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.rotation_euler = rot
    o.data.materials.append(material(color))
    if smooth:
        bpy.ops.object.shade_smooth()
    if bevel and kind in ("box", "cube"):
        # local width: the cube is 2 (box) or 1 (cube) across, so this is a fraction of the part
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel * (1.0 if kind == "box" else 0.5)
        mod.segments = 2 if size > 0.07 else 1
        mod.limit_method = "NONE"
        mod.harden_normals = False
    if sub and kind in ("cube", "cyl"):
        mod = o.modifiers.new("sub", "SUBSURF")
        mod.levels = sub
        mod.render_levels = sub
    vg = o.vertex_groups.new(name=bone)
    vg.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
    parts.append(o)
    return o

# ---------- the body (shared template) ----------
# Faceted reference art is chamfered boxes and low-sided prisms: straight edges, rounded corners, flat
# faces. props.boxy (the default) builds that; 0 gives the earlier rounded look, which is all spheres
# and smooth cylinders and reads as bulgy next to the art.
# Opt in per character (props.boxy in its params file). The parts were authored as overlapping
# spheres, so a character needs a pass over its hair, beard and headgear before it reads well as
# boxes: the King has had that pass, the rest of the cast has not.
BOXY = bool(PROPS.get("boxy", 0))
# too small for an edge to read; a sphere is cheaper and kinder on eyes and cheeks
ROUND_PARTS = ("eye.", "iris.", "pupil.", "glint.", "lash", "blush.", "pearl", "hglint")
BOX_FIT = 0.84  # a box with a sphere's radii reads much bulkier; this keeps the visual mass the same
def ell(name, loc, scale, color, bone, rot=(0, 0, 0), bevel=None, fit=BOX_FIT):
    if BOXY and not name.startswith(ROUND_PARTS):
        return part("box", name, loc, scale=tuple(v * fit for v in scale), rot=rot, color=color, bone=bone,
                    bevel=0.3 if bevel is None else bevel)
    return part("sphere", name, loc, scale=scale, rot=rot, color=color, bone=bone)

def limb(name, loc, r, h, color, bone, rot=(0, 0, 0), dy=None):
    """A leg, boot or sleeve: a square-sided column when the look is boxy, else a cylinder."""
    if BOXY:
        return part("box", name, loc, scale=(r, dy or r, h / 2), rot=rot, color=color, bone=bone, bevel=0.28)
    return part("cyl", name, loc, scale=(r, r, h), rot=rot, color=color, bone=bone)

def band(name, loc, r, h, color, bone, rot=(0, 0, 0), dy=None):
    """A belt, cuff, hem or collar: a flat band around the part it sits on. Boxy bands are boxes, so
    they wrap a boxy body without its corners poking through; dy is the half-depth when it differs."""
    if BOXY:
        return part("box", name, loc, scale=(r, dy or r, h / 2), rot=rot, color=color, bone=bone, bevel=0.12)
    return part("cyl", name, loc, scale=(r, r, h), color=color, bone=bone, sub=0, rot=rot)

def arm_chain(side, px, pz, length, r, hand_r, color, trim, ang, cuff_r=None, sleeve=0.0, sleeve_r=None, py=0.0, cuff=True):
    """Upper arm, cuff and hand hanging from the shoulder point (px, pz), swung `ang` radians out
    from the body. The fitter uses the angle: reference art rarely has the arms straight down.
    `sleeve` is the fraction of the arm covered by a wider cuff of `color`, the rest bare skin: that
    is a gown's short cap sleeve. At 0 the sleeve runs the whole arm and ends in a trim cuff.
    `py` carries the arm forward, toward the viewer, so a wide skirt cannot swallow it."""
    sx = 1 if side == "L" else -1
    d = (sx * math.sin(ang), -math.cos(ang))
    at = lambda t: (px + d[0] * t, py, pz + d[1] * t)
    rot = (0, -sx * ang, 0)
    # Segments overlap by a little. Flat-ended boxes butted end to end leave a visible seam, and any
    # swing angle opens it into a gap; a sphere hid that, a facet does not.
    lap = r * 0.5
    if sleeve > 0.01:
        sl = length * sleeve
        limb(f"sleeve.{side}", at(sl / 2 - lap / 2), sleeve_r or r * 1.4, sl + lap, color, f"arm.{side}", rot=rot)
        limb(f"arm.{side}", at((sl + length) / 2), r, length - sl + lap, "skin", f"arm.{side}", rot=rot)
    else:
        limb(f"arm.{side}", at(length / 2 - lap / 2), r, length + lap, color, f"arm.{side}", rot=rot)
        if cuff:
            band(f"cuff.{side}", at(length - 0.03), cuff_r or r * 1.12, 0.06, trim, f"arm.{side}", rot=rot)
    ell(f"hand.{side}", at(length + hand_r * 0.55), (hand_r, hand_r, hand_r), "skin", f"arm.{side}")

def bow_arc(name, loc, color, bone, half=0.4, belly=0.17):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.028
    curve.bevel_resolution = 3
    curve.resolution_u = 10
    sp = curve.splines.new("BEZIER")
    sp.bezier_points.add(2)
    for pt, co in zip(sp.bezier_points, [(0, 0, -half), (0, -belly, 0), (0, 0, half)]):
        pt.co = co
        pt.handle_left_type = pt.handle_right_type = "AUTO"
    o = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(o)
    o.location = (loc[0], loc[1], loc[2] + Z_OFF)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.active_object
    o.data.materials.append(material(color))
    bpy.ops.object.shade_smooth()
    vg = o.vertex_groups.new(name=bone)
    vg.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
    parts.append(o)
    return o

def build_head(style):
    queen = style == "queen"
    angry = style in ("raider", "elite", "brute", "boss")
    skin = "bone" if style == "boss" else "skin"
    ell("head", (0, 0, 1.42), (0.38, 0.35, 0.36), skin, "head")
    for side, x in (("L", 0.37), ("R", -0.37)):
        ell(f"ear.{side}", (x, 0.02, 1.4), (0.05, 0.07, 0.08), skin, "head")
    ell("nose", (0, -0.35, 1.36), (0.045, 0.035, 0.035), skin, "head")
    # props.face_simple: the blocky pixel face of the reference art. One dark square per eye, a brow
    # above it, a flat mouth, no blush. The built-up sclera/iris/pupil/glint eye reads as anime
    # close up, which is wrong for this style.
    if PROPS.get("face_simple", 0):
        # The head's front face is at y = -0.35, so these sit just proud of it. Inside it they are
        # swallowed by the head and read as faint smudges.
        fy = -0.368
        for side, x in (("L", 0.155), ("R", -0.155)):
            part("cube", f"eye.{side}", (x, fy, 1.42), scale=(0.095, 0.03, 0.105), color="black", bone="head", sub=0)
        # no brow bars: the fringe reaches z 1.50 and stands further forward than the face, so they
        # never show. Its lower edge reads as the brow line instead.
        part("cube", "mouth", (0, fy, 1.285), scale=(0.095, 0.028, 0.024), color="ink", bone="head", sub=0)
        return
    # eyes: sclera, iris, pupil, glint
    for side, x in (("L", 0.135), ("R", -0.135)):
        ell(f"eye.{side}", (x, -0.315, 1.43), (0.062, 0.035, 0.09 if queen else 0.08), "white", "head")
        ell(f"iris.{side}", (x, -0.345, 1.425), (0.04, 0.02, 0.058 if queen else 0.05), "blueEye" if queen else "black", "head")
        ell(f"pupil.{side}", (x, -0.36, 1.42), (0.02, 0.012, 0.03), "black", "head")
        ell(f"glint.{side}", (x - 0.014 * (1 if side == "L" else -1), -0.37, 1.45), (0.011, 0.008, 0.016), "white", "head")
        if queen:
            ell(f"lash1.{side}", (x + 0.05 * (1 if side == "L" else -1), -0.33, 1.5), (0.03, 0.01, 0.01), "black", "head", rot=(0, math.radians(35 if side == "L" else -35), 0))
            ell(f"lash2.{side}", (x + 0.02 * (1 if side == "L" else -1), -0.335, 1.515), (0.025, 0.01, 0.01), "black", "head", rot=(0, math.radians(70 if side == "L" else -70), 0))
        brow_w = 0.1 if queen else 0.14
        tilt = (28 if side == "L" else -28) if angry else (-12 if side == "L" else 12)
        part("cube", f"brow.{side}", (x, -0.315, 1.5 if angry else (1.53 if queen else 1.52)), scale=(brow_w, 0.03, 0.045 if angry else (0.028 if queen else 0.04)),
             rot=(0, math.radians(tilt), 0), color="ink" if angry else "hair", bone="head", sub=1)
        if not angry:
            ell(f"blush.{side}", (x * 1.9, -0.28, 1.35), (0.06, 0.02, 0.035), "pink", "head")
    if queen:
        ell("mouth.L", (0.022, -0.352, 1.302), (0.03, 0.01, 0.011), "red", "head", rot=(0, math.radians(-25), 0))
        ell("mouth.R", (-0.022, -0.352, 1.302), (0.03, 0.01, 0.011), "red", "head", rot=(0, math.radians(25), 0))
    elif angry:
        ell("mouth", (0, -0.35, 1.27), (0.05, 0.01, 0.012), "ink", "head", rot=(0, 0, 0))
    else:
        ell("mouth", (0, -0.35, 1.29), (0.04, 0.01, 0.012), "beard", "head")

def build_hair(style):
    hair = "hair"
    # cap and back. A sphere cap can sink into the head and only its top shows; a box of the same
    # radii would be a helmet over the whole face, so boxy hair is a thinner slab sitting on top.
    if BOXY:
        ell("hair", (0, 0.04, 1.63), (0.4, 0.37, 0.16), hair, "head", fit=1.0)
        ell("hairback", (0, 0.26, 1.34), (0.37, 0.11, 0.3), hair, "head", fit=1.0)
    else:
        ell("hair", (0, 0.03, 1.53), (0.405, 0.385, 0.33), hair, "head")
        ell("hairback", (0, 0.2, 1.3), (0.34, 0.17, 0.3), hair, "head")
    # swept fringe: a soft band across the brow with a lock falling to one side
    fr = PROPS.get("hair_fringe", 1.0)  # the fringe over the brow; near 0 for a bare forehead under a crown
    ell("fringe", (0.02, -0.3 if BOXY else -0.27, 1.6), (0.36 * fr, 0.1 * fr if BOXY else 0.16 * fr, 0.08 * fr), hair, "head",
        rot=(0, 0, 0) if BOXY else (math.radians(-18), math.radians(-6), 0), fit=1.0)
    ell("lock", (-0.22, -0.3, 1.56), (0.13 * fr, 0.1 * fr, 0.09 * fr), hair, "head", rot=(0, math.radians(30), 0))
    ell("lock2", (0.26, -0.27, 1.58), (0.1 * fr, 0.09 * fr, 0.08 * fr), hair, "head", rot=(0, math.radians(-25), 0))
    hw = PROPS.get("hair_w", 1.0)  # hair down the sides of the face: outer edge stays, it thickens inward over the cheeks
    fl = PROPS.get("hair_flap", 1.0)  # ... unless flap pushes it out past the head and hangs it lower
    pg = PROPS.get("pigtails", 0.0)   # instead: a tie at the temple and a tail hanging outboard of it
    if pg:
        for side, sx in (("L", 1), ("R", -1)):
            ell(f"tie.{side}", (sx * 0.40, 0.0, 1.45), (0.075 * pg, 0.11, 0.10 * pg), hair, "head")
            ell(f"tail.{side}", (sx * 0.52 * pg, 0.015, 1.31), (0.115 * pg, 0.125, 0.20 * pg), hair, "head")
    else:
        for side, sx in (("L", 1), ("R", -1)):
            rx = 0.075 * hw
            ell(f"side.{side}", (sx * (0.455 - rx) * fl, -0.02, 1.4 - 0.1 * (fl - 1)),
                (rx, 0.14, 0.17 * (1 + 0.5 * (hw - 1)) * fl), hair, "head")
    if style == "queen":
        # long hair down the back and over the shoulders. hair_len shortens it from the bottom (the top
        # stays against the head), so the fitter can lift it off the shoulders and let the arms show.
        hl = PROPS.get("hair_len", 1.0)
        ell("mane", (0, 0.2, 1.53 - 0.48 * hl), (0.32 * hw, 0.2, 0.48 * hl), hair, "head")
        for side, sx in (("L", 1), ("R", -1)):
            x = sx * 0.34 * hw
            ell(f"strand.{side}", (x, -0.02, 1.4 - 0.32 * hl), (0.1 * hw, 0.13, 0.32 * hl), hair, "head")
            ell(f"curl.{side}", (x * 1.05, -0.08, 1.4 - 0.64 * hl + 0.08), (0.1 * hw, 0.11, 0.1 * hl), hair, "head")

def build_figure(style, tunic, trim, boots="boot", pants="leather", dress=False, hair=True, bare_arms=False,
                 torso=(0.34, 0.29, 0.33), arm_r=0.09, arm_len=0.32, hand_r=0.085, leg_r=0.105, head_s=1.0,
                 seam=True, hem=True, buckle=True, collar=True, belt="leather", belt_h=0.08, cuffs=True):
    torso = tuple(PROPS.get("torso", torso))
    arm_r = PROPS.get("arm_r", arm_r)
    arm_len = PROPS.get("arm_len", arm_len)
    hand_r = PROPS.get("hand_r", hand_r)
    leg_r = PROPS.get("leg_r", leg_r)
    global LEG_X, HEAD_S, HEAD_W, BODY_H, CROTCH, SHOULDER_X, DRESS
    HEAD_S = PROPS.get("head_s", head_s)
    HEAD_W = PROPS.get("head_w", 1.0)      # head width on top of head_s (wide, squat heads)
    BODY_H = PROPS.get("body_h", 1.0)      # torso column stretched about the crotch
    leg_h = PROPS.get("leg_h", 1.0)        # leg length; boots stay the same
    arm_ang = math.radians(PROPS.get("arm_ang", 0.0))  # arms swung out from the body, degrees
    if FAST:
        arm_ang -= IDLE_ARM_SWING  # no rig in a fast render, so the Idle pose's swing goes into the geometry
    shoulder_s = PROPS.get("shoulder_s", 1.0)
    LEG_X = PROPS.get("leg_x", LEG_X)
    boot_s = PROPS.get("boot_s", 1.0)
    DRESS = dress
    if dress:
        CROTCH = 0.5
        SHOULDER_X = 0.378
        gs, gh = PROPS.get("gown_s", 1.0), PROPS.get("gown_h", 1.0)
        gw = PROPS.get("gown_waist", 1.0)   # waist width, separate from the hem: how hard the skirt flares
        fh = PROPS.get("foot_h", 0.1)       # the gown clears the floor by this much, and the feet show below
        hem_r, waist_r = 0.5 * gs, 0.22 * gw
        # two stacked cones rather than one: gown_bell sets the width halfway down, so the skirt can
        # curve out into a bell instead of being a straight-sided cone (0.5 is straight)
        mid_r = waist_r + (hem_r - waist_r) * PROPS.get("gown_bell", 0.5) * 2 * 0.5
        part("frustum", "gownlow", (0, 0, fh + 0.165 * gh), color=tunic, bone="root", sub=0, r1=hem_r, r2=mid_r, depth=0.33 * gh)
        part("frustum", "gown", (0, 0, fh + 0.495 * gh), color=tunic, bone="root", sub=0, r1=mid_r, r2=waist_r, depth=0.33 * gh)
        band("hem", (0, 0, fh + 0.035), hem_r * 1.02, 0.07, trim, "root")
        for side, x in (("L", 0.11), ("R", -0.11)):
            ell(f"foot.{side}", (x, -0.02, fh * 0.45), (0.075, 0.1, max(0.03, fh * 0.55)), "skin", "root")
        part("cube", "front", (0, -0.3, fh + 0.33 * gh), scale=(0.05, 0.03, 0.62 * gh), rot=(math.radians(-24), 0, 0), color=trim, bone="root", sub=0)
        part("frustum", "bodice", (0, 0, 0.82), color=tunic, bone="spine", sub=0, r1=0.26, r2=0.2, depth=0.42)
        ell("chest", (0, 0, 0.9), (0.24, 0.2, 0.2), tunic, "spine")
        band("belt", (0, 0, 0.62), 0.275, 0.07, trim, "spine")
        part("cube", "stripe", (0, -0.22, 0.86), scale=(0.04, 0.03, 0.3), color=trim, bone="spine", sub=0)
        band("collar", (0, 0, 1.06), 0.15, 0.05, trim, "spine")
        part("cyl", "neck", (0, 0, 1.05), scale=(0.1, 0.1, 0.14), color="skin", bone="spine", sub=1)
        # a short cap sleeve then a bare arm, hanging close to the bodice
        ar, al, hr = PROPS.get("arm_r", 0.075), PROPS.get("arm_len", 0.34), PROPS.get("hand_r", 0.075)
        # The sleeve stays anchored at the bodice edge whatever the settings, and the arm hangs a little
        # forward of the body. Without that the skirt simply grew over the arms and the search, seeing
        # no cost, shrank them away; the reference has them plainly visible down the sides.
        # arm_x is where they hang. In the reference art the arms sit at the very edge of the silhouette,
        # barely inside the skirt hem, so this needs to reach well past the bodice on its own.
        ax = PROPS.get("arm_x", 0.3)
        for side, sx in (("L", 1), ("R", -1)):
            # a shoulder that always spans bodice edge to sleeve, however far out the arm hangs
            mid, half = (0.24 + ax) / 2, (ax - 0.24) / 2 + ar * 1.3
            ell(f"puff.{side}", (sx * mid, -0.04, 0.95), (half, ar * 1.5, ar * 1.5 * shoulder_s), tunic, f"arm.{side}")
            arm_chain(side, sx * ax, 0.93, al, ar, hr, tunic, trim, arm_ang, py=-PROPS.get("arm_fwd", 0.16),
                      sleeve=PROPS.get("sleeve_len", 0.3), sleeve_r=ar * 1.5 * shoulder_s)
    else:
        tw = torso[0] / 0.34
        CROTCH = 0.18 + 0.32 * leg_h
        SHOULDER_X = 0.43 * tw
        for side, x in (("L", LEG_X), ("R", -LEG_X)):
            limb(f"leg.{side}", (x, 0, 0.18 + 0.16 * leg_h), leg_r, 0.32 * leg_h, pants, f"leg.{side}")
            limb(f"boot.{side}", (x, 0, 0.12), leg_r * 1.15 * boot_s, 0.2 * boot_s, boots, f"leg.{side}")
            ell(f"toe.{side}", (x, -0.09 * boot_s, 0.06), (leg_r * 1.05 * boot_s, leg_r * 1.35 * boot_s, 0.075 * boot_s), boots, f"leg.{side}")
            band(f"boottop.{side}", (x, 0, 0.21 * boot_s), leg_r * 1.2 * boot_s, 0.05, boots, f"leg.{side}")
        ell("torso", (0, 0, 0.77), torso, tunic, "spine", bevel=0.22)
        # a boxy torso is full width at every height, so its bands have to clear its corners
        bx, by = (torso[0] * 1.04, torso[1] * 1.04) if BOXY else (0.315 * tw, 0.315 * tw)
        # the skirt hangs off the torso, so its width follows the torso rather than flaring into a plate
        sk1, sk2 = (torso[0] * 1.06, torso[0] * 0.88) if BOXY else (0.37 * tw, 0.3 * tw)
        pleats = int(PROPS.get("skirt_sides", 0))   # a many-sided cone: each facet reads as a pleat
        part("frustum", "skirt", (0, 0, 0.47), color=tunic, bone="spine", sub=0, r1=sk1, r2=sk2, depth=0.22,
             sides=pleats or (4 if BOXY else None))
        if hem:
            band("skirthem", (0, 0, 0.375), sk1 * 1.02, 0.06, trim, "spine", dy=sk1 * 1.02)
        band("belt", (0, 0, 0.58), bx, belt_h, belt, "spine", dy=by)
        if buckle:
            part("cube", "buckle", (0, -(by + 0.02), 0.58), scale=(0.13, 0.05, 0.11), color=trim, bone="spine", sub=0)
        if seam:
            part("cube", "seam", (0, -(torso[1] + 0.015), 0.78), scale=(0.05, 0.03, 0.34), color=trim, bone="spine", sub=0)
        if collar:
            band("collar", (0, 0, 1.0), 0.16, 0.06, trim, "spine", dy=min(0.16, torso[1] * 0.8) if BOXY else None)
        part("cyl", "neck", (0, 0, 1.02), scale=(0.11, 0.11, 0.14), color="skin", bone="spine", sub=1)
        for side, x in (("L", SHOULDER_X), ("R", -SHOULDER_X)):
            ell(f"shoulder.{side}", (x * 0.9, 0, 0.94), (arm_r * 1.45 * shoulder_s, arm_r * 1.3 * shoulder_s, arm_r * 1.2 * shoulder_s),
                "skin" if bare_arms else tunic, f"arm.{side}")
            arm_chain(side, x, 0.9, arm_len, arm_r, hand_r, "skin" if bare_arms else tunic, trim, arm_ang, cuff=cuffs)
    build_head(style)
    if hair:
        build_hair(style)

# proportions applied after every part exists (so hair, beard, crown and helmets follow the head)
HEAD_S, HEAD_W, BODY_H, CROTCH, SHOULDER_X, DRESS = 1.0, 1.0, 1.0, 0.5, 0.42, False
def bz(z):
    """Where a torso-column height ends up once the legs and body have been stretched."""
    return CROTCH + (z - 0.5) * BODY_H

def finish_figure():
    z0 = 0.5 + Z_OFF
    neck = 1.05 + Z_OFF
    head_shift = bz(1.05) - 1.05
    for o in parts:
        b = o.vertex_groups[0].name if o.vertex_groups else ""
        if b == "spine" or (b == "root" and not DRESS):
            o.location.z = z0 + (CROTCH - 0.5) + (o.location.z - z0) * BODY_H
            o.scale.z *= BODY_H
        elif b in ("arm.L", "arm.R"):
            o.location.z += bz(0.9) - 0.9  # the whole arm rides on the shoulder; arm_len sets its length
        elif b == "head":
            o.location = (o.location.x * HEAD_S * HEAD_W, o.location.y * HEAD_S * HEAD_W, neck + head_shift + (o.location.z - neck) * HEAD_S)
            o.scale = (o.scale.x * HEAD_S * HEAD_W, o.scale.y * HEAD_S * HEAD_W, o.scale.z * HEAD_S)

def build_king():
    build_figure("king", "blue", "gold", seam=False)
    # a gold cross on the chest
    tw = PROPS.get("torso", [0.34])[0] / 0.34
    part("cube", "crossv", (0, -0.33 * tw, 0.84), scale=(0.07, 0.03, 0.3), color="gold", bone="spine", sub=0)
    part("cube", "crossh", (0, -0.33 * tw, 0.88), scale=(0.26, 0.03, 0.07), color="gold", bone="spine", sub=0)
    # beard wraps the jaw; moustache under the nose
    n0 = len(parts)
    ell("beard", (0, -0.1, 1.17), (0.35, 0.29, 0.15), "beard", "head", fit=0.92)
    ell("chin", (0, -0.24, 1.07), (0.24, 0.15, 0.1), "beard", "head", fit=0.92)
    for side, x in (("L", 0.1), ("R", -0.1)):
        ell(f"mo.{side}", (x, -0.36, 1.31), (0.1, 0.04, 0.038), "beard", "head", rot=(0, math.radians(-25 if side == "L" else 25), 0))
    bs, bh = PROPS.get("beard_s", 1.0), PROPS.get("beard_h", 1.0)  # beard width and depth; beard height
    for o in parts[n0:]:
        o.scale = (o.scale.x * bs, o.scale.y * bs, o.scale.z * bh)
    # the mouth shows as a dark gap under the moustache
    part("cube", "mouthgap", (0, -0.36 * bs, 1.255), scale=(0.11 * bs, 0.03, 0.03 * bh), color="ink", bone="head", sub=1)
    # crown sits on the hair
    n1 = len(parts)
    part("cyl", "crown", (0, 0, 1.8), scale=(0.28, 0.28, 0.15), color="gold", bone="head", sub=1)
    band("crownrim", (0, 0, 1.87), 0.3, 0.05, "gold", "head")
    band("crownbase", (0, 0, 1.73), 0.3, 0.05, "gold", "head")
    # points: 5 around the rim by default; any other count n puts n across the front (and the back)
    n = int(round(PROPS.get("crown_points", 5)))
    if n == 5:
        angles = [i / 5 * math.tau + math.pi / 2 for i in range(5)]
    else:
        front = [math.pi / 2 + (k + 0.5 - n / 2) * (math.pi / n) for k in range(n)]
        angles = front + [a + math.pi for a in front]
    for i, a in enumerate(angles):
        part("cone", f"point{i}", (math.cos(a) * 0.25, math.sin(a) * 0.25, 1.98), scale=(0.08, 0.08, 0.24), color="gold", bone="head", sub=0, sides=4 if BOXY else None)
        if not BOXY:  # the faceted art has plain pyramids, no pearl on the tip
            ell(f"pearl{i}", (math.cos(a) * 0.25, math.sin(a) * 0.25, 2.1), (0.035, 0.035, 0.035), "gold", "head")
    ell("jewel", (0, -0.27, 1.8), (0.055, 0.035, 0.065), "red", "head")
    cs = PROPS.get("crown_s", 1.0)   # wider crown
    ch = PROPS.get("crown_h", 1.0)   # taller crown, grown up from its base
    cz = PROPS.get("crown_z", 0.0)   # crown lowered onto the brow (negative) or lifted
    for o in parts[n1:]:
        o.location = (o.location.x * cs, o.location.y * cs, 1.73 + cz + (o.location.z - 1.73) * ch)
        o.scale = (o.scale.x * cs, o.scale.y * cs, o.scale.z * ch)

def build_queen():
    build_figure("queen", "pink", "gold", dress=True)
    part("torus", "tiara", (0, 0, 1.76), scale=(0.3, 0.3, 1), color="gold", bone="head", minor=0.028)
    ell("tiarajewel", (0, -0.29, 1.8), (0.05, 0.035, 0.065), "blueEye", "head")
    part("cone", "tiarapeak", (0, -0.29, 1.9), scale=(0.035, 0.035, 0.14), color="gold", bone="head", sub=0)
    for side, x in (("L", 0.2), ("R", -0.2)):
        part("cone", f"tiarapeak.{side}", (x, -0.22, 1.84), scale=(0.025, 0.025, 0.08), color="gold", bone="head", sub=0)

def helmet_cap(color, trim, plume=None, nose=False):
    ell("helm", (0, 0.0, 1.56), (0.41, 0.39, 0.3), color, "head")
    part("torus", "brim", (0, 0, 1.5), scale=(0.41, 0.41, 1), color=trim, bone="head", minor=0.035)
    if nose:
        part("cube", "noseguard", (0, -0.37, 1.4), scale=(0.06, 0.04, 0.22), color=trim, bone="head", sub=0)
    if plume:
        part("cone", "plume", (0, 0.02, 2.02), scale=(0.11, 0.11, 0.5), color=plume, bone="head", sub=0)

def sword(length=0.8, blade="steel", grip="leather"):
    part("cube", "blade", (-0.56, -0.2, 0.86), scale=(0.1, 0.025, length), rot=(math.radians(-25), 0, 0), color=blade, bone="arm.R", sub=0)
    part("cube", "guard", (-0.56, -0.02, 0.5), scale=(0.26, 0.07, 0.07), color="gold" if blade == "steel" else "steelDark", bone="arm.R", sub=0)
    part("cyl", "grip", (-0.56, 0.02, 0.42), scale=(0.035, 0.035, 0.16), color=grip, bone="arm.R", sub=0)

def round_shield(color, boss="steel"):
    part("cyl", "shield", (0.55, 0.02, 0.72), scale=(0.3, 0.3, 0.05), rot=(0, math.radians(90), 0), color=color, bone="arm.L", sub=1)
    ell("shieldboss", (0.6, 0.02, 0.72), (0.03, 0.09, 0.09), boss, "arm.L")

def bow_and_quiver(color="blue"):
    bow_arc("bow", (0.5, -0.1, 0.6), color, "arm.L", half=0.42, belly=0.2)
    part("cyl", "string", (0.5, -0.1, 0.6), scale=(0.01, 0.01, 0.84), color="white", bone="arm.L", sub=0)
    part("cyl", "quiver", (-0.2, 0.3, 0.95), scale=(0.08, 0.08, 0.5), rot=(math.radians(-15), math.radians(20), 0), color="leather", bone="spine", sub=1)
    for i in range(3):
        part("cone", f"fletch{i}", (-0.22 + i * 0.04, 0.34, 1.25 + (i % 2) * 0.03), scale=(0.04, 0.04, 0.1), color="white", bone="spine", sub=0)

def build_soldier():
    """The archer and the swordsman are the same person: cream tunic, bare arms, two blue sashes
    crossing the chest over a blue waist band, brown boots, no helmet. Only what is in the hand
    differs, so both are built from here and the callers add the weapon."""
    build_figure("archer", "white", "blue", pants="white", bare_arms=True,
                 seam=False, hem=False, buckle=False, collar=False, belt="blue", belt_h=0.16, cuffs=False)
    t = tuple(PROPS.get("torso", (0.34, 0.29, 0.33)))
    dy = t[1] + 0.02
    # Named sash1/sash2, not .L/.R: each one crosses the whole chest, so it is not half of a mirrored
    # pair and a half build must keep both or the X becomes a single stroke.
    # one strap lies over the other: at the same depth they are coincident where they cross, which
    # renders as a black diamond
    for n, ang, out in ((1, 34, 0.0), (2, -34, 0.035)):
        part("cube", f"sash{n}", (0, -dy - out, 0.84), scale=(0.1, 0.05, 0.82),
             rot=(0, math.radians(ang), 0), color="blue", bone="spine", sub=0)

def build_archer():
    build_soldier()
    if GEAR:
        bow_and_quiver("wood")

def build_swordsman():
    build_soldier()
    if GEAR:
        sword(0.8)
        round_shield("blue", "gold")

def build_raider():
    build_figure("raider", "red", "darkRed", pants="darkRed")
    helmet_cap("red", "darkRed", plume="darkRed", nose=True)
    sword(0.7, "steel", "leather")
    round_shield("darkRed")
    part("cube", "sash", (0, -0.3, 0.68), scale=(0.62, 0.04, 0.08), color="darkRed", bone="spine", sub=0)

def build_elite():
    build_figure("elite", "ink", "darkRed", pants="ink", hair=False)
    part("cyl", "greathelm", (0, -0.02, 1.46), scale=(0.43, 0.43, 0.64), color="ink", bone="head", sub=0)
    ell("helmtop", (0, -0.02, 1.77), (0.43, 0.43, 0.14), "ink", "head")
    band("helmband", (0, -0.02, 1.36), 0.44, 0.06, "steelDark", "head")
    part("cube", "visor", (0, -0.44, 1.46), scale=(0.46, 0.06, 0.055), color="glow", bone="head", sub=0)
    part("cube", "crest", (0, 0.02, 2.0), scale=(0.08, 0.5, 0.3), color="darkRed", bone="head", sub=0)
    for side, x in (("L", 0.44), ("R", -0.44)):
        ell(f"pauldron.{side}", (x * 0.95, 0, 0.95), (0.17, 0.15, 0.11), "steel", f"arm.{side}")
    part("cube", "plate", (0, -0.3, 0.8), scale=(0.4, 0.08, 0.36), color="steelDark", bone="spine", sub=1)
    sword(1.1, "steel", "darkRed")

def build_brute():
    build_figure("brute", "darkRed", "leather", pants="darkRed", bare_arms=True, torso=(0.42, 0.36, 0.36), arm_r=0.12, arm_len=0.36, hand_r=0.11, leg_r=0.13)
    ell("belly", (0, -0.12, 0.62), (0.32, 0.3, 0.24), "darkRed", "spine")
    ell("cap", (0, 0.0, 1.56), (0.4, 0.38, 0.28), "darkRed", "head")
    for side, x in (("L", 0.4), ("R", -0.4)):
        part("cone", f"horn.{side}", (x, 0.0, 1.66), scale=(0.08, 0.08, 0.42), rot=(0, math.radians(-70 if side == "L" else 70), 0), color="bone", bone="head", sub=0)
    part("cube", "strap", (0, -0.3, 0.76), scale=(0.14, 0.05, 0.7), rot=(0, math.radians(38), 0), color="leather", bone="spine", sub=0)
    part("cyl", "handle", (-0.5, -0.05, 0.85), scale=(0.045, 0.045, 0.9), color="wood", bone="arm.R", sub=0)
    ell("clubhead", (-0.5, -0.05, 1.35), (0.18, 0.18, 0.24), "steelDark", "arm.R")
    for i in range(4):
        a = i / 4 * math.tau
        ell(f"stud{i}", (-0.5 + math.cos(a) * 0.17, -0.05 + math.sin(a) * 0.17, 1.38), (0.045, 0.045, 0.045), "steel", "arm.R")

def build_boss():
    build_figure("boss", "bone", "boneDark", pants="boneDark", boots="boneDark", torso=(0.44, 0.38, 0.4), arm_r=0.13, arm_len=0.46, hand_r=0.14, leg_r=0.15, head_s=0.92)
    ell("helm", (0, 0.0, 1.5), (0.41, 0.39, 0.3), "boneDark", "head")
    band("helmrim", (0, 0, 1.36), 0.39, 0.07, "steelDark", "head")
    for side, x in (("L", 0.42), ("R", -0.42)):
        part("cone", f"horn.{side}", (x, 0.0, 1.64), scale=(0.11, 0.11, 0.62), rot=(0, math.radians(-55 if side == "L" else 55), 0), color="white", bone="head", sub=0)
    part("cube", "strap", (0, -0.3, 0.76), scale=(0.16, 0.05, 0.72), rot=(0, math.radians(38), 0), color="leather", bone="spine", sub=0)
    sword(1.4, "steel", "leather")
    part("cube", "guard2", (-0.56, -0.02, 0.5), scale=(0.34, 0.08, 0.08), color="steelDark", bone="arm.R", sub=0)

def build_horse():
    ell("hbody", (0, 0, 0.95), (0.34, 0.6, 0.33), "horse", "horse")
    ell("hchest", (0, -0.48, 1.0), (0.3, 0.3, 0.3), "horse", "horse")
    ell("hrump", (0, 0.5, 0.98), (0.31, 0.28, 0.3), "horse", "horse")
    ell("hneck", (0, -0.7, 1.28), (0.17, 0.2, 0.36), "horse", "hhead", rot=(math.radians(-38), 0, 0))
    ell("hhead", (0, -0.98, 1.6), (0.19, 0.3, 0.2), "horse", "hhead")
    ell("hmuzzle", (0, -1.22, 1.52), (0.14, 0.15, 0.12), "muzzle", "hhead")
    ell("hmane", (0, -0.7, 1.5), (0.09, 0.36, 0.13), "mane", "hhead", rot=(math.radians(-38), 0, 0))
    ell("hforelock", (0, -0.95, 1.8), (0.1, 0.12, 0.08), "mane", "hhead")
    for side, x in (("L", 0.1), ("R", -0.1)):
        part("cone", f"hear.{side}", (x, -0.9, 1.84), scale=(0.045, 0.045, 0.16), color="horse", bone="hhead", sub=0)
        ell(f"heye.{side}", (x * 1.6, -1.08, 1.66), (0.035, 0.025, 0.04), "black", "hhead")
    ell("htail", (0, 0.78, 0.9), (0.08, 0.22, 0.12), "mane", "horse", rot=(math.radians(35), 0, 0))
    for name, x, y in (("FL", 0.2, -0.38), ("FR", -0.2, -0.38), ("BL", 0.2, 0.42), ("BR", -0.2, 0.42)):
        part("cyl", f"hleg.{name}", (x, y, 0.42), scale=(0.085, 0.085, 0.52), color="horse", bone=f"hleg.{name}")
        ell(f"hoof.{name}", (x, y, 0.07), (0.1, 0.11, 0.07), "boot", f"hleg.{name}")
    part("cube", "blanket", (0, 0.05, 1.22), scale=(0.72, 0.8, 0.06), color="blue", bone="horse", sub=1)
    ell("saddle", (0, 0.05, 1.28), (0.3, 0.34, 0.1), "leather", "horse")
    part("torus", "bridle", (0, -1.0, 1.6), scale=(0.2, 0.2, 1), rot=(math.radians(90), 0, 0), color="leather", bone="hhead", minor=0.015)

def build_king_mounted():
    global Z_OFF, LEG_X
    build_horse()
    Z_OFF = 0.92
    LEG_X = 0.32
    build_king()

{"king": build_king, "queen": build_queen, "king_mounted": build_king_mounted, "archer": build_archer, "swordsman": build_swordsman,
 "raider": build_raider, "elite": build_elite, "brute": build_brute, "boss": build_boss}[WHO]()
finish_figure()
MOUNTED = WHO == "king_mounted"
RZ = Z_OFF

if not FAST:
    # ---------- armature ----------
    bpy.ops.object.armature_add(location=(0, 0, 0))
    arm = bpy.context.active_object
    arm.name = "Armature"
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    eb.remove(eb[0])
    def bone(name, head, tail, parent=None):
        b = eb.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        if parent:
            b.parent = eb[parent]
        return b
    if MOUNTED:
        bone("horse", (0, 0.3, 0.95), (0, -0.3, 0.95))
        bone("hhead", (0, -0.55, 1.1), (0, -1.0, 1.65), "horse")
        for name, x, y in (("FL", 0.2, -0.38), ("FR", -0.2, -0.38), ("BL", 0.2, 0.42), ("BR", -0.2, 0.42)):
            bone(f"hleg.{name}", (x, y, 0.68), (x, y, 0.05), "horse")
    bone("root", (0, 0, bz(0.45) + RZ), (0, 0, bz(0.55) + RZ), "horse" if MOUNTED else None)
    bone("spine", (0, 0, bz(0.55) + RZ), (0, 0, bz(1.0) + RZ), "root")
    bone("head", (0, 0, bz(1.0) + RZ), (0, 0, bz(1.0) + 0.9 * HEAD_S + RZ), "spine")
    for side, x in (("L", SHOULDER_X), ("R", -SHOULDER_X)):
        bone(f"arm.{side}", (x, 0, bz(0.9) + RZ), (x, 0, bz(0.9) - 0.4 + RZ), "spine")
    for side, x in (("L", LEG_X), ("R", -LEG_X)):
        bone(f"leg.{side}", (x, 0, CROTCH - 0.03 + RZ), (x, 0, 0.05 + RZ), "root")
    bpy.ops.object.mode_set(mode="OBJECT")

    # ---------- bake each part's own modifiers first ----------
    # join() keeps only the ACTIVE object's modifier stack, so parts[0]'s subsurf used to smooth the whole
    # character (3-4x the triangles, and it rounded off parts meant to stay sharp). Apply per part instead.
    for o in parts:
        if o.modifiers:
            bpy.ops.object.select_all(action="DESELECT")
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            for m in list(o.modifiers):
                bpy.ops.object.modifier_apply(modifier=m.name)

    # ---------- join parts into one skinned mesh ----------
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    body = bpy.context.active_object
    body.name = WHO.capitalize()
    mod = body.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    body.parent = arm

    # ---------- animations ----------
    arm.animation_data_create()
    def pose(name):
        return arm.pose.bones[name]
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    def action(name, length, keys, locs=None, scales=None):
        """keys: {bone: [(frame, (rx, ry, rz)), ...]} in radians; locs/scales likewise in bone-local space."""
        act = bpy.data.actions.new(name)
        arm.animation_data.action = act
        try:
            if hasattr(act, "slots") and len(act.slots) == 0:
                act.slots.new(id_type="OBJECT", name=name)
                arm.animation_data.action_slot = act.slots[0]
        except Exception as e:
            print("slot note:", e)
        for pb in arm.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
        for bname, frames in keys.items():
            pb = pose(bname)
            for frame, rot in frames:
                pb.rotation_euler = rot
                pb.keyframe_insert("rotation_euler", frame=frame)
        for bname, frames in (locs or {}).items():
            pb = pose(bname)
            for frame, loc in frames:
                pb.location = loc
                pb.keyframe_insert("location", frame=frame)
        for bname, frames in (scales or {}).items():
            pb = pose(bname)
            for frame, sc in frames:
                pb.scale = sc
                pb.keyframe_insert("scale", frame=frame)
        try:
            act.use_frame_range = True
            act.frame_range = (1, length)
        except Exception as e:
            print("range note:", e)
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, act)
        arm.animation_data.action = None
        return act

    sw = 0.55
    SIT = -1.25
    if MOUNTED:
        action("Idle", 48, {
            "horse": [(1, (0, 0, 0)), (24, (0.02, 0, 0)), (48, (0, 0, 0))],
            "hhead": [(1, (0, 0, 0)), (24, (0.08, 0, 0)), (48, (0, 0, 0))],
            "leg.L": [(1, (SIT, 0, 0.2))], "leg.R": [(1, (SIT, 0, -0.2))],
            "arm.L": [(1, (-0.5, 0, 0.12)), (24, (-0.45, 0, 0.16)), (48, (-0.5, 0, 0.12))], "arm.R": [(1, (-0.5, 0, -0.12)), (24, (-0.45, 0, -0.16)), (48, (-0.5, 0, -0.12))],
            "spine": [(1, (0, 0, 0)), (24, (0.03, 0, 0)), (48, (0, 0, 0))],
        }, locs={"horse": [(1, (0, 0, 0)), (24, (0, 0, -0.015)), (48, (0, 0, 0))]})
        g = 0.5
        action("Walk", 20, {
            "hleg.FL": [(1, (g, 0, 0)), (11, (-g, 0, 0)), (20, (g, 0, 0))],
            "hleg.BR": [(1, (g, 0, 0)), (11, (-g, 0, 0)), (20, (g, 0, 0))],
            "hleg.FR": [(1, (-g, 0, 0)), (11, (g, 0, 0)), (20, (-g, 0, 0))],
            "hleg.BL": [(1, (-g, 0, 0)), (11, (g, 0, 0)), (20, (-g, 0, 0))],
            "horse": [(1, (0.04, 0, 0)), (6, (-0.04, 0, 0)), (11, (0.04, 0, 0)), (16, (-0.04, 0, 0)), (20, (0.04, 0, 0))],
            "hhead": [(1, (0.05, 0, 0)), (11, (-0.05, 0, 0)), (20, (0.05, 0, 0))],
            "leg.L": [(1, (SIT, 0, 0.2))], "leg.R": [(1, (SIT, 0, -0.2))],
            "arm.L": [(1, (-0.5, 0, 0.12))], "arm.R": [(1, (-0.5, 0, -0.12))],
            "spine": [(1, (0.05, 0, 0)), (11, (-0.03, 0, 0)), (20, (0.05, 0, 0))],
            "head": [(1, (-0.04, 0, 0)), (6, (0.05, 0, 0)), (11, (-0.04, 0, 0)), (16, (0.05, 0, 0)), (20, (-0.04, 0, 0))],
        }, locs={"horse": [(1, (0, 0, 0)), (6, (0, 0, 0.07)), (11, (0, 0, 0)), (16, (0, 0, 0.07)), (20, (0, 0, 0))],
                 "root": [(1, (0, 0, 0)), (4, (0, 0.03, 0)), (11, (0, 0, 0)), (14, (0, 0.03, 0)), (20, (0, 0, 0))]})
        action("Attack", 20, {
            "arm.R": [(1, (-0.5, 0, -0.12)), (6, (-2.5, 0, -0.35)), (11, (0.5, 0, -0.1)), (20, (-0.5, 0, -0.12))],
            "arm.L": [(1, (-0.5, 0, 0.12)), (6, (-0.7, 0, 0.3)), (11, (-0.3, 0, 0.1)), (20, (-0.5, 0, 0.12))],
            "leg.L": [(1, (SIT, 0, 0.2))], "leg.R": [(1, (SIT, 0, -0.2))],
            "spine": [(1, (0, 0, 0)), (6, (-0.15, 0, 0.3)), (11, (0.18, 0, -0.25)), (20, (0, 0, 0))],
            "head": [(1, (0, 0, 0)), (6, (-0.1, 0, 0.15)), (11, (0.08, 0, -0.1)), (20, (0, 0, 0))],
        })
    else:
      action("Idle", 48, {
        "spine": [(1, (0, 0, 0)), (24, (0.04, 0, 0)), (48, (0, 0, 0))],
        "head": [(1, (0, 0, 0)), (24, (-0.05, 0, 0)), (48, (0, 0, 0))],
        "arm.L": [(1, (0, 0, IDLE_ARM_SWING)), (24, (0.04, 0, 0.2)), (48, (0, 0, IDLE_ARM_SWING))],
        "arm.R": [(1, (0, 0, -IDLE_ARM_SWING)), (24, (0.04, 0, -0.2)), (48, (0, 0, -IDLE_ARM_SWING))],
      }, locs={"root": [(1, (0, 0, 0)), (24, (0, -0.018, 0)), (48, (0, 0, 0))]},
         scales={"root": [(1, (1, 1, 1)), (24, (1.015, 0.985, 1.015)), (48, (1, 1, 1))]})
    if not MOUNTED and WHO != "queen":
        action("Walk", 24, {
            "leg.L": [(1, (sw, 0, 0)), (13, (-sw, 0, 0)), (24, (sw, 0, 0))],
            "leg.R": [(1, (-sw, 0, 0)), (13, (sw, 0, 0)), (24, (-sw, 0, 0))],
            "arm.L": [(1, (-sw * 0.8, 0, 0.12)), (13, (sw * 0.8, 0, 0.12)), (24, (-sw * 0.8, 0, 0.12))],
            "arm.R": [(1, (sw * 0.8, 0, -0.12)), (13, (-sw * 0.8, 0, -0.12)), (24, (sw * 0.8, 0, -0.12))],
            "spine": [(1, (0.1, 0, 0)), (7, (0.08, 0, 0.05)), (13, (0.1, 0, 0)), (19, (0.08, 0, -0.05)), (24, (0.1, 0, 0))],
            "head": [(1, (-0.06, 0, 0)), (7, (0.02, 0, -0.03)), (13, (-0.06, 0, 0)), (19, (0.02, 0, 0.03)), (24, (-0.06, 0, 0))],
        }, locs={"root": [(1, (0, 0, 0)), (7, (0, 0.06, 0)), (13, (0, 0, 0)), (19, (0, 0.06, 0)), (24, (0, 0, 0))]},
           scales={"root": [(1, (1.03, 0.96, 1.03)), (7, (0.98, 1.03, 0.98)), (13, (1.03, 0.96, 1.03)), (19, (0.98, 1.03, 0.98)), (24, (1.03, 0.96, 1.03))]})
    elif not MOUNTED:
        action("Walk", 24, {
            "arm.L": [(1, (-0.3, 0, 0.2)), (13, (0.3, 0, 0.2)), (24, (-0.3, 0, 0.2))],
            "arm.R": [(1, (0.3, 0, -0.2)), (13, (-0.3, 0, -0.2)), (24, (0.3, 0, -0.2))],
            "spine": [(1, (0.04, 0, 0.05)), (13, (0.04, 0, -0.05)), (24, (0.04, 0, 0.05))],
            "head": [(1, (0, 0, -0.03)), (13, (0, 0, 0.03)), (24, (0, 0, -0.03))],
        }, locs={"root": [(1, (0, 0, 0)), (7, (0, 0.03, 0)), (13, (0, 0, 0)), (19, (0, 0.03, 0)), (24, (0, 0, 0))]})
    if not MOUNTED:
      action("Attack", 20, {
        "arm.R": [(1, (0, 0, -0.12)), (6, (-2.5, 0, -0.35)), (11, (0.6, 0, -0.1)), (20, (0, 0, -0.12))],
        "arm.L": [(1, (0, 0, 0.12)), (6, (-0.5, 0, 0.3)), (11, (0.2, 0, 0.1)), (20, (0, 0, 0.12))],
        "spine": [(1, (0, 0, 0)), (6, (-0.15, 0, 0.3)), (11, (0.2, 0, -0.25)), (20, (0, 0, 0))],
        "head": [(1, (0, 0, 0)), (6, (-0.1, 0, 0.15)), (11, (0.08, 0, -0.1)), (20, (0, 0, 0))],
      }, locs={"root": [(1, (0, 0, 0)), (6, (0, 0.04, 0)), (11, (0, -0.02, 0.06)), (20, (0, 0, 0))]},
         scales={"root": [(1, (1, 1, 1)), (6, (0.97, 1.04, 0.97)), (11, (1.06, 0.92, 1.06)), (20, (1, 1, 1))]})

# ---------- export ----------
if not FAST:
    dg = bpy.context.evaluated_depsgraph_get()
    ev_mesh = body.evaluated_get(dg).data
    ev_mesh.calc_loop_triangles()
    print("TRIS", WHO, len(ev_mesh.loop_triangles))
if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))
    print("blend", BLEND)
if OUT != "-":
    bpy.ops.object.select_all(action="SELECT")
    # Uncompressed on purpose. Blender cannot write EXT_meshopt_compression, which is what the game
    # loads, so compression is a separate pass: run `node tools/models/compress.mjs` after this.
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_animations=True, export_yup=True, use_selection=True, export_draco_mesh_compression_enable=False)
    print("exported", OUT, "- now run: node tools/models/compress.mjs")

# ---------- flat front render for the fitter ----------
if FRONT:
    # orthographic, flat material colours, transparent background: silhouette = alpha, colours exact
    bpy.ops.object.camera_add(location=(0, -10, 1.05))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.6
    scene.camera = cam
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "FLAT"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = int(PARAMS.get("front_res", 192))
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    if not PARAMS.get("front_aa", True):
        scene.display.render_aa = "OFF"  # ID renders must not blend two IDs at an edge
    if IDS:
        # every part in its own flat colour (index-coded), and a list of which part and role each is,
        # so the fitter can say which part sits where the reference shows something else
        names = []
        for i, o in enumerate(parts):
            role = o.data.materials[0].name if o.data.materials else ""
            m = bpy.data.materials.new(f"id{i}")
            m.diffuse_color = (lin((i % 8) / 7), lin(((i // 8) % 8) / 7), lin((i // 64) / 7), 1.0)  # lands on i/7 after the sRGB output
            o.data.materials.clear()
            o.data.materials.append(m)
            names.append([o.name, role])
        json.dump(names, open(IDS, "w"))
    if not FAST:
        # the rest pose the game shows: every bone at rest, arms at Idle's first-frame swing. Keying the
        # actions leaves the last keyed pose (a Walk stride) in the scene, so reset rather than trust it.
        for t in arm.animation_data.nla_tracks:
            t.mute = True
        for pb in arm.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
        arm.pose.bones["arm.L"].rotation_euler = (0, 0, IDLE_ARM_SWING)
        arm.pose.bones["arm.R"].rotation_euler = (0, 0, -IDLE_ARM_SWING)
    scene.frame_set(1)
    scene.render.filepath = FRONT
    bpy.ops.render.render(write_still=True)
    print("front", FRONT)

# ---------- studio render ----------
# The flat front render is a scoring diagnostic: no lights, no shading, 160 px. This is the opposite,
# and the one to look at when judging the model: matte materials, soft light from a white room, and
# the flat facets left flat so the form reads as geometry rather than as a smooth blob.
if STUDIO:
    for m in mats.values():
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Roughness"].default_value = 1.0        # matte: no glossy highlights
        b.inputs["Metallic"].default_value = 0.0
        for spec in ("Specular IOR Level", "Specular"):
            if spec in b.inputs:
                b.inputs[spec].default_value = 0.0
                break
    world = bpy.data.worlds.new("studio")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.85  # the room is the fill
    for loc, energy, size in (((2.6, -3.4, 3.6), 260, 4.5), ((-3.2, -2.4, 1.8), 90, 6.0), ((0, 3.4, 3.2), 110, 5.0)):
        bpy.ops.object.light_add(type="AREA", location=loc)
        L = bpy.context.active_object
        L.data.energy = energy
        L.data.size = size
        L.rotation_euler = (Vector((0, 0, 1.05)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    # frame from the model's own bounds, so nothing is ever cropped and every character sits the same
    dg0 = bpy.context.evaluated_depsgraph_get()
    zs, xs_ = [], []
    for corner in (Vector(c) for c in body.evaluated_get(dg0).bound_box):
        w_ = body.matrix_world @ corner
        zs.append(w_.z)
        xs_.append(abs(w_.x))
    z_lo, z_hi, half_w = min(zs), max(zs), max(xs_)
    bpy.ops.object.camera_add(location=(0, -9.0, (z_lo + z_hi) / 2))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.type = "ORTHO"                              # a product shot: no perspective distortion
    cam.data.ortho_scale = max(z_hi - z_lo, half_w * 2) * 1.16
    scene.camera = cam
    # Standard, not the default filmic curve: that rolls white off to grey and the background with it
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    try:
        scene.cycles.device = "GPU"
    except Exception:
        pass
    scene.render.resolution_x = scene.render.resolution_y = int(PARAMS.get("studio_res", 900))
    # The world lights the model, so its strength is a lighting choice, not a background colour. Render
    # the background out and lay the result on white afterwards, and the two stop fighting.
    scene.render.film_transparent = True
    scene.render.filepath = STUDIO
    for t in arm.animation_data.nla_tracks:              # the rest pose, arms at Idle's first frame
        t.mute = True
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    arm.pose.bones["arm.L"].rotation_euler = (0, 0, IDLE_ARM_SWING)
    arm.pose.bones["arm.R"].rotation_euler = (0, 0, -IDLE_ARM_SWING)
    scene.frame_set(1)
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(STUDIO)
    w_, h_ = img.size
    px = list(img.pixels[:])
    for i in range(0, len(px), 4):
        a = px[i + 3]
        for k in range(3):
            px[i + k] = px[i + k] * a + (1.0 - a)   # over white
        px[i + 3] = 1.0
    img.pixels = px
    img.filepath_raw = STUDIO
    img.file_format = "PNG"
    img.save()
    print("studio", STUDIO)

# ---------- preview render ----------
if PREVIEW:
    bpy.ops.object.camera_add(location=(3.2, -4.4, 3.2) if MOUNTED else (2.4, -3.4, 2.6))
    cam = bpy.context.active_object
    cam.rotation_euler = (Vector((0, 0, 1.5 if MOUNTED else 1.05)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 55
    scene.camera = cam
    bpy.ops.object.light_add(type="SUN", location=(3, -3, 6))
    sun = bpy.context.active_object
    sun.rotation_euler = (math.radians(45), math.radians(10), math.radians(30))
    sun.data.energy = 4.5
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.42, 0.72, 0.36, 1)
    bg.inputs["Strength"].default_value = 1.0
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.data.materials.append(material("blue"))
    ground.data.materials[0] = bpy.data.materials.new("ground")
    ground.data.materials[0].use_nodes = True
    ground.data.materials[0].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.42, 0.72, 0.36, 1)
    scene.render.resolution_x = scene.render.resolution_y = 800
    scene.render.filepath = PREVIEW
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except Exception:
            continue
    # frame 8 of Walk for a livelier pose
    track = arm.animation_data.nla_tracks["Walk"]
    for t in arm.animation_data.nla_tracks:
        t.mute = t != track
    scene.frame_set(8)
    bpy.ops.render.render(write_still=True)
    print("rendered", PREVIEW)
