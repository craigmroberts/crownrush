"""Build a rigged, animated chibi character in Blender and export it as GLB.

Run headless:  blender -b -P tools/blender/make_character.py -- king public/models/king.glb .shots/king-blender.png
Characters face -Y in Blender, which the glTF exporter turns into +Z (what the game expects).
"""
import sys, math, bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WHO = args[0] if args else "king"
OUT = args[1] if len(args) > 1 else f"public/models/{WHO}.glb"
PREVIEW = args[2] if len(args) > 2 else None

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
mats = {}
def material(name):
    if name in mats:
        return mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*COL[name], 1.0)
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

def part(kind, name, loc, scale=(1, 1, 1), rot=(0, 0, 0), color="skin", bone="spine", smooth=True, sub=1, **kw):
    loc = (loc[0], loc[1], loc[2] + Z_OFF)
    size = max(scale[0], scale[1]) if kind in ("sphere", "cyl", "cone") else max(scale)
    seg = lod(size)
    if kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=seg[0], ring_count=seg[1], location=loc)
    elif kind == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    elif kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=1, vertices=min(seg[0], SEG[0]), location=loc)
    elif kind == "cone":
        bpy.ops.mesh.primitive_cone_add(radius1=1, radius2=0, depth=1, vertices=8 if size <= 0.12 else 12, location=loc)
    elif kind == "frustum":
        bpy.ops.mesh.primitive_cone_add(radius1=kw["r1"], radius2=kw["r2"], depth=kw["depth"], vertices=20, location=loc)
        scale = (1, 1, 1)
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(major_radius=scale[0], minor_radius=kw.get("minor", 0.04), major_segments=16, minor_segments=6, location=loc)
        scale = (1, 1, 1)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.rotation_euler = rot
    o.data.materials.append(material(color))
    if smooth:
        bpy.ops.object.shade_smooth()
    if sub and kind in ("cube", "cyl"):
        mod = o.modifiers.new("sub", "SUBSURF")
        mod.levels = sub
        mod.render_levels = sub
    vg = o.vertex_groups.new(name=bone)
    vg.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
    parts.append(o)
    return o

# ---------- the body (shared template) ----------
def ell(name, loc, scale, color, bone, rot=(0, 0, 0)):
    return part("sphere", name, loc, scale=scale, rot=rot, color=color, bone=bone)

def band(name, loc, r, h, color, bone):
    return part("cyl", name, loc, scale=(r, r, h), color=color, bone=bone, sub=0)

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
    # cap and back
    ell("hair", (0, 0.03, 1.53), (0.405, 0.385, 0.33), hair, "head")
    ell("hairback", (0, 0.2, 1.3), (0.34, 0.17, 0.3), hair, "head")
    # swept fringe: a soft band across the brow with a lock falling to one side
    ell("fringe", (0.02, -0.27, 1.62), (0.36, 0.16, 0.1), hair, "head", rot=(math.radians(-18), math.radians(-6), 0))
    ell("lock", (-0.22, -0.3, 1.56), (0.13, 0.1, 0.09), hair, "head", rot=(0, math.radians(30), 0))
    ell("lock2", (0.26, -0.27, 1.58), (0.1, 0.09, 0.08), hair, "head", rot=(0, math.radians(-25), 0))
    for side, x in (("L", 0.38), ("R", -0.38)):
        ell(f"side.{side}", (x, -0.02, 1.4), (0.075, 0.14, 0.17), hair, "head")
    if style == "queen":
        # long hair down the back and over the shoulders
        ell("mane", (0, 0.2, 1.05), (0.32, 0.2, 0.48), hair, "head")
        for side, x in (("L", 0.34), ("R", -0.34)):
            ell(f"strand.{side}", (x, -0.02, 1.08), (0.1, 0.13, 0.32), hair, "head")
            ell(f"curl.{side}", (x * 1.05, -0.08, 0.8), (0.1, 0.11, 0.1), hair, "head")

def build_figure(style, tunic, trim, boots="boot", pants="leather", dress=False, hair=True, bare_arms=False,
                 torso=(0.34, 0.29, 0.33), arm_r=0.09, arm_len=0.32, hand_r=0.085, leg_r=0.105, head_s=1.0):
    if dress:
        part("frustum", "gown", (0, 0, 0.33), color=tunic, bone="root", sub=0, r1=0.62, r2=0.25, depth=0.66)
        band("hem", (0, 0, 0.04), 0.63, 0.07, trim, "root")
        part("cube", "front", (0, -0.3, 0.33), scale=(0.05, 0.03, 0.62), rot=(math.radians(-24), 0, 0), color=trim, bone="root", sub=0)
        part("frustum", "bodice", (0, 0, 0.82), color=tunic, bone="spine", sub=0, r1=0.26, r2=0.2, depth=0.42)
        ell("chest", (0, 0, 0.9), (0.24, 0.2, 0.2), tunic, "spine")
        band("belt", (0, 0, 0.62), 0.275, 0.07, trim, "spine")
        part("cube", "stripe", (0, -0.22, 0.86), scale=(0.04, 0.03, 0.3), color=trim, bone="spine", sub=0)
        band("collar", (0, 0, 1.06), 0.15, 0.05, trim, "spine")
        part("cyl", "neck", (0, 0, 1.05), scale=(0.1, 0.1, 0.14), color="skin", bone="spine", sub=1)
        for side, x in (("L", 0.36), ("R", -0.36)):
            ell(f"puff.{side}", (x, 0, 0.94), (0.15, 0.14, 0.15), tunic, f"arm.{side}")
            part("cyl", f"arm.{side}", (x * 1.05, 0, 0.72), scale=(0.07, 0.07, 0.3), color=tunic, bone=f"arm.{side}")
            band(f"cuff.{side}", (x * 1.05, 0, 0.6), 0.085, 0.06, trim, f"arm.{side}")
            ell(f"hand.{side}", (x * 1.05, 0, 0.53), (0.075, 0.075, 0.075), "skin", f"arm.{side}")
    else:
        tw = torso[0] / 0.34
        for side, x in (("L", LEG_X), ("R", -LEG_X)):
            part("cyl", f"leg.{side}", (x, 0, 0.34), scale=(leg_r, leg_r, 0.32), color=pants, bone=f"leg.{side}")
            part("cyl", f"boot.{side}", (x, 0, 0.12), scale=(leg_r * 1.15, leg_r * 1.15, 0.2), color=boots, bone=f"leg.{side}")
            ell(f"toe.{side}", (x, -0.09, 0.06), (leg_r * 1.05, leg_r * 1.35, 0.075), boots, f"leg.{side}")
            band(f"boottop.{side}", (x, 0, 0.21), leg_r * 1.2, 0.05, boots, f"leg.{side}")
        ell("torso", (0, 0, 0.77), torso, tunic, "spine")
        part("frustum", "skirt", (0, 0, 0.47), color=tunic, bone="spine", sub=0, r1=0.37 * tw, r2=0.3 * tw, depth=0.22)
        band("skirthem", (0, 0, 0.375), 0.375 * tw, 0.06, trim, "spine")
        band("belt", (0, 0, 0.58), 0.315 * tw, 0.08, "leather", "spine")
        part("cube", "buckle", (0, -0.31 * tw, 0.58), scale=(0.13, 0.05, 0.11), color=trim, bone="spine", sub=0)
        part("cube", "seam", (0, -0.33 * tw, 0.78), scale=(0.05, 0.03, 0.34), color=trim, bone="spine", sub=0)
        band("collar", (0, 0, 1.0), 0.16, 0.06, trim, "spine")
        part("cyl", "neck", (0, 0, 1.02), scale=(0.11, 0.11, 0.14), color="skin", bone="spine", sub=1)
        for side, x in (("L", 0.43 * tw), ("R", -0.43 * tw)):
            ell(f"shoulder.{side}", (x * 0.9, 0, 0.94), (arm_r * 1.45, arm_r * 1.3, arm_r * 1.2), "skin" if bare_arms else tunic, f"arm.{side}")
            part("cyl", f"arm.{side}", (x, 0, 0.9 - arm_len / 2), scale=(arm_r, arm_r, arm_len), color="skin" if bare_arms else tunic, bone=f"arm.{side}")
            band(f"cuff.{side}", (x, 0, 0.9 - arm_len + 0.03), arm_r * 1.12, 0.06, trim, f"arm.{side}")
            ell(f"hand.{side}", (x, 0, 0.9 - arm_len - hand_r * 0.7), (hand_r, hand_r, hand_r), "skin", f"arm.{side}")
    build_head(style)
    if head_s != 1.0:
        for o in parts:
            if o.vertex_groups and o.vertex_groups[0].name == "head":
                o.scale = tuple(v * head_s for v in o.scale)
                o.location = (o.location.x * head_s, o.location.y * head_s, 1.05 + Z_OFF + (o.location.z - Z_OFF - 1.05) * head_s)
    if hair:
        build_hair(style)

def build_king():
    build_figure("king", "blue", "gold")
    part("cube", "clasp1", (0, -0.32, 0.86), scale=(0.05, 0.03, 0.26), rot=(0, math.radians(35), 0), color="gold", bone="spine", sub=0)
    part("cube", "clasp2", (0, -0.32, 0.86), scale=(0.05, 0.03, 0.26), rot=(0, math.radians(-35), 0), color="gold", bone="spine", sub=0)
    # beard wraps the jaw; moustache under the nose
    ell("beard", (0, -0.08, 1.14), (0.37, 0.31, 0.16), "beard", "head")
    ell("chin", (0, -0.22, 1.05), (0.22, 0.18, 0.13), "beard", "head")
    for side, x in (("L", 0.1), ("R", -0.1)):
        ell(f"mo.{side}", (x, -0.36, 1.31), (0.1, 0.04, 0.038), "beard", "head", rot=(0, math.radians(-25 if side == "L" else 25), 0))
    # crown sits on the hair
    part("cyl", "crown", (0, 0, 1.8), scale=(0.28, 0.28, 0.15), color="gold", bone="head", sub=1)
    band("crownrim", (0, 0, 1.87), 0.3, 0.05, "gold", "head")
    band("crownbase", (0, 0, 1.73), 0.3, 0.05, "gold", "head")
    for i in range(5):
        a = i / 5 * math.tau + math.pi / 2
        part("cone", f"point{i}", (math.cos(a) * 0.25, math.sin(a) * 0.25, 1.98), scale=(0.065, 0.065, 0.22), color="gold", bone="head", sub=0)
        ell(f"pearl{i}", (math.cos(a) * 0.25, math.sin(a) * 0.25, 2.1), (0.035, 0.035, 0.035), "gold", "head")
    ell("jewel", (0, -0.27, 1.8), (0.055, 0.035, 0.065), "red", "head")

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

def build_archer():
    build_figure("archer", "white", "blue")
    part("cube", "strap", (0, -0.3, 0.76), scale=(0.1, 0.05, 0.62), rot=(0, math.radians(-38), 0), color="blue", bone="spine", sub=0)
    bow_and_quiver("blue")

def build_swordsman():
    build_figure("archer", "navy", "steel")
    helmet_cap("steel", "steelDark")
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
MOUNTED = WHO == "king_mounted"
RZ = Z_OFF

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
bone("root", (0, 0, 0.45 + RZ), (0, 0, 0.55 + RZ), "horse" if MOUNTED else None)
bone("spine", (0, 0, 0.55 + RZ), (0, 0, 1.0 + RZ), "root")
bone("head", (0, 0, 1.0 + RZ), (0, 0, 1.9 + RZ), "spine")
for side, x in (("L", 0.42), ("R", -0.42)):
    bone(f"arm.{side}", (x, 0, 0.9 + RZ), (x, 0, 0.5 + RZ), "spine")
for side, x in (("L", LEG_X), ("R", -LEG_X)):
    bone(f"leg.{side}", (x, 0, 0.47 + RZ), (x, 0, 0.05 + RZ), "root")
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
    "arm.L": [(1, (0, 0, 0.12)), (24, (0.04, 0, 0.2)), (48, (0, 0, 0.12))],
    "arm.R": [(1, (0, 0, -0.12)), (24, (0.04, 0, -0.2)), (48, (0, 0, -0.12))],
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
dg = bpy.context.evaluated_depsgraph_get()
ev_mesh = body.evaluated_get(dg).data
ev_mesh.calc_loop_triangles()
print("TRIS", WHO, len(ev_mesh.loop_triangles))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_animations=True, export_yup=True, use_selection=True, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
print("exported", OUT)

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
