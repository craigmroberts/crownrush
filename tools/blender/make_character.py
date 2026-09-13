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
    mats[name] = m
    return m

parts = []
def part(kind, name, loc, scale=(1, 1, 1), rot=(0, 0, 0), color="skin", bone="spine", smooth=True, sub=1, **kw):
    if kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=16, ring_count=12, location=loc)
    elif kind == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    elif kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=1, vertices=16, location=loc)
    elif kind == "cone":
        bpy.ops.mesh.primitive_cone_add(radius1=1, radius2=0, depth=1, vertices=16, location=loc)
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(major_radius=scale[0], minor_radius=kw.get("minor", 0.04), major_segments=24, minor_segments=10, location=loc)
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
def build_figure(tunic="blue", trim="gold", hair="hair", boots="boot", pants="leather", dress=False):
    if dress:
        # flared gown instead of legs
        part("cone", "gown", (0, 0, 0.32), scale=(0.62, 0.62, 0.66), color=tunic, bone="root", sub=0)
        part("torus", "hem", (0, 0, 0.03), scale=(0.6, 0.6, 1), color=trim, bone="root", minor=0.035)
    else:
        for side, x in (("L", 0.14), ("R", -0.14)):
            part("cyl", f"leg.{side}", (x, 0, 0.3), scale=(0.12, 0.12, 0.34), color=pants, bone=f"leg.{side}")
            part("sphere", f"boot.{side}", (x, -0.03, 0.1), scale=(0.15, 0.2, 0.1), color=boots, bone=f"leg.{side}")
    part("sphere", "torso", (0, 0, 0.74), scale=(0.34, 0.29, 0.33), color=tunic, bone="spine")
    part("torus", "belt", (0, 0, 0.56), scale=(0.3, 0.3, 1), color="leather", bone="spine", minor=0.035)
    part("cube", "buckle", (0, -0.3, 0.56), scale=(0.14, 0.05, 0.12), color=trim, bone="spine", sub=0)
    part("torus", "collar", (0, 0, 0.99), scale=(0.15, 0.15, 1), color=trim, bone="spine", minor=0.03)
    part("cyl", "neck", (0, 0, 1.0), scale=(0.11, 0.11, 0.12), color="skin", bone="spine", sub=1)
    for side, x in (("L", 0.42), ("R", -0.42)):
        part("cyl", f"arm.{side}", (x, 0, 0.72), scale=(0.09, 0.09, 0.3), color=tunic, bone=f"arm.{side}")
        part("torus", f"cuff.{side}", (x, 0, 0.58), scale=(0.095, 0.095, 1), color=trim, bone=f"arm.{side}", minor=0.025)
        part("sphere", f"hand.{side}", (x, 0, 0.5), scale=(0.1, 0.1, 0.1), color="skin", bone=f"arm.{side}")
    part("sphere", "head", (0, 0, 1.4), scale=(0.37, 0.35, 0.35), color="skin", bone="head")
    for side, x in (("L", 0.36), ("R", -0.36)):
        part("sphere", f"ear.{side}", (x, 0.02, 1.38), scale=(0.05, 0.07, 0.07), color="skin", bone="head")
    # face: eyes, pupils, highlights, brows, mouth (front is -Y)
    for side, x in (("L", 0.13), ("R", -0.13)):
        part("sphere", f"eye.{side}", (x, -0.31, 1.42), scale=(0.055, 0.03, 0.075), color="white", bone="head")
        part("sphere", f"iris.{side}", (x, -0.335, 1.415), scale=(0.035, 0.02, 0.05), color="blueEye" if dress else "black", bone="head")
        part("sphere", f"pupil.{side}", (x, -0.35, 1.415), scale=(0.018, 0.012, 0.028), color="black", bone="head")
        part("sphere", f"glint.{side}", (x - 0.012, -0.36, 1.44), scale=(0.01, 0.008, 0.014), color="white", bone="head")
        part("cube", f"brow.{side}", (x, -0.31, 1.52), scale=(0.12, 0.03, 0.03), rot=(0, 0.25 if side == "L" else -0.25, 0), color=hair, bone="head", sub=1)
        part("sphere", f"blush.{side}", (x * 1.8, -0.27, 1.33), scale=(0.06, 0.02, 0.04), color="pink", bone="head")
    part("sphere", "mouth", (0, -0.34, 1.3), scale=(0.045, 0.01, 0.012), color="beard", bone="head")
    # hair: cap plus fringe bumps
    part("sphere", "hair", (0, 0.02, 1.5), scale=(0.395, 0.38, 0.33), color=hair, bone="head")
    for i, (x, y, z, s) in enumerate([(-0.21, -0.26, 1.63, 0.075), (-0.07, -0.3, 1.65, 0.085), (0.08, -0.3, 1.65, 0.085), (0.22, -0.26, 1.63, 0.075)]):
        part("sphere", f"fringe{i}", (x, y, z), scale=(s, s * 0.9, s * 0.8), color=hair, bone="head")
    for side, x in (("L", 0.36), ("R", -0.36)):
        part("sphere", f"side.{side}", (x, 0, 1.42), scale=(0.07, 0.09, 0.13), color=hair, bone="head")

def build_king():
    build_figure(tunic="blue", trim="gold")
    # gold X clasp and stripe on the chest
    part("cube", "clasp1", (0, -0.31, 0.8), scale=(0.05, 0.03, 0.3), rot=(0, math.radians(35), 0), color="gold", bone="spine", sub=0)
    part("cube", "clasp2", (0, -0.31, 0.8), scale=(0.05, 0.03, 0.3), rot=(0, math.radians(-35), 0), color="gold", bone="spine", sub=0)
    part("cube", "stripe", (0, -0.32, 0.52), scale=(0.06, 0.03, 0.3), color="gold", bone="spine", sub=0)
    # beard + moustache
    part("sphere", "beard", (0, -0.1, 1.13), scale=(0.32, 0.24, 0.15), color="beard", bone="head")
    for side, x in (("L", 0.09), ("R", -0.09)):
        part("sphere", f"mo.{side}", (x, -0.32, 1.24), scale=(0.1, 0.04, 0.04), color="beard", bone="head")
    # crown
    part("cyl", "crown", (0, 0, 1.72), scale=(0.25, 0.25, 0.14), color="gold", bone="head", sub=1)
    part("torus", "crownrim", (0, 0, 1.79), scale=(0.25, 0.25, 1), color="gold", bone="head", minor=0.025)
    for i in range(5):
        a = i / 5 * math.tau + math.pi / 2
        part("cone", f"point{i}", (math.cos(a) * 0.22, math.sin(a) * 0.22, 1.89), scale=(0.06, 0.06, 0.2), color="gold", bone="head", sub=0)
        part("sphere", f"pearl{i}", (math.cos(a) * 0.22, math.sin(a) * 0.22, 2.0), scale=(0.03, 0.03, 0.03), color="gold", bone="head")
    part("sphere", "jewel", (0, -0.25, 1.73), scale=(0.05, 0.035, 0.06), color="red", bone="head")

def build_queen():
    build_figure(tunic="pink", trim="gold", dress=True)
    part("sphere", "hairback", (0, 0.18, 1.2), scale=(0.34, 0.2, 0.42), color="hair", bone="head")
    for side, x in (("L", 0.36), ("R", -0.36)):
        part("sphere", f"lock.{side}", (x, -0.02, 1.15), scale=(0.1, 0.11, 0.2), color="hair", bone="head")
    part("torus", "tiara", (0, 0, 1.74), scale=(0.3, 0.3, 1), color="gold", bone="head", minor=0.03)
    part("sphere", "tiarajewel", (0, -0.3, 1.78), scale=(0.05, 0.04, 0.07), color="blueEye", bone="head")
    part("cone", "tiarapeak", (0, -0.3, 1.86), scale=(0.04, 0.04, 0.12), color="gold", bone="head", sub=0)

{"king": build_king, "queen": build_queen}[WHO]()

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
bone("root", (0, 0, 0.45), (0, 0, 0.55))
bone("spine", (0, 0, 0.55), (0, 0, 1.0), "root")
bone("head", (0, 0, 1.0), (0, 0, 1.9), "spine")
for side, x in (("L", 0.42), ("R", -0.42)):
    bone(f"arm.{side}", (x, 0, 0.9), (x, 0, 0.5), "spine")
for side, x in (("L", 0.14), ("R", -0.14)):
    bone(f"leg.{side}", (x, 0, 0.47), (x, 0, 0.05), "root")
bpy.ops.object.mode_set(mode="OBJECT")

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
def action(name, length, keys):
    """keys: {bone: [(frame, (rx, ry, rz)), ...]} in radians."""
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
    for bname, frames in keys.items():
        pb = pose(bname)
        for frame, rot in frames:
            pb.rotation_euler = rot
            pb.keyframe_insert("rotation_euler", frame=frame)
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
action("Idle", 48, {
    "spine": [(1, (0, 0, 0)), (24, (0.04, 0, 0)), (48, (0, 0, 0))],
    "head": [(1, (0, 0, 0)), (24, (-0.05, 0, 0)), (48, (0, 0, 0))],
    "arm.L": [(1, (0, 0, 0.12)), (24, (0, 0, 0.18)), (48, (0, 0, 0.12))],
    "arm.R": [(1, (0, 0, -0.12)), (24, (0, 0, -0.18)), (48, (0, 0, -0.12))],
})
if WHO != "queen":
    action("Walk", 24, {
        "leg.L": [(1, (sw, 0, 0)), (13, (-sw, 0, 0)), (24, (sw, 0, 0))],
        "leg.R": [(1, (-sw, 0, 0)), (13, (sw, 0, 0)), (24, (-sw, 0, 0))],
        "arm.L": [(1, (-sw * 0.8, 0, 0.12)), (13, (sw * 0.8, 0, 0.12)), (24, (-sw * 0.8, 0, 0.12))],
        "arm.R": [(1, (sw * 0.8, 0, -0.12)), (13, (-sw * 0.8, 0, -0.12)), (24, (sw * 0.8, 0, -0.12))],
        "spine": [(1, (0.06, 0, 0)), (7, (0.06, 0, 0.03)), (19, (0.06, 0, -0.03)), (24, (0.06, 0, 0))],
    })
else:
    action("Walk", 24, {
        "arm.L": [(1, (-0.3, 0, 0.2)), (13, (0.3, 0, 0.2)), (24, (-0.3, 0, 0.2))],
        "arm.R": [(1, (0.3, 0, -0.2)), (13, (-0.3, 0, -0.2)), (24, (0.3, 0, -0.2))],
        "spine": [(1, (0, 0, 0.04)), (13, (0, 0, -0.04)), (24, (0, 0, 0.04))],
    })
action("Attack", 20, {
    "arm.R": [(1, (0, 0, -0.12)), (7, (-2.4, 0, -0.3)), (12, (0.6, 0, -0.1)), (20, (0, 0, -0.12))],
    "spine": [(1, (0, 0, 0)), (7, (-0.12, 0, 0.1)), (12, (0.12, 0, -0.06)), (20, (0, 0, 0))],
})

# ---------- export ----------
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_animations=True, export_yup=True, use_selection=True)
print("exported", OUT)

# ---------- preview render ----------
if PREVIEW:
    bpy.ops.object.camera_add(location=(2.4, -3.4, 2.6))
    cam = bpy.context.active_object
    cam.rotation_euler = (Vector((0, 0, 1.05)) - cam.location).to_track_quat("-Z", "Y").to_euler()
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
