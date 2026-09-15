"""Bake a textured model's colours into vertex colours, and stand it where our characters stand.

    blender -b -P tools/blender/bake_vertex_colors.py -- in.glb out.glb [--height 2.0] [--preview p.png]

Why: the game draws every character with one shared material and per-vertex colours, which is what
lets a hundred of them cost the GPU almost nothing. A model from an outside tool arrives with its own
texture and material instead. Rather than change how the game renders, this reads the base colour
texture once per face corner and writes it into the mesh, after which the texture is not needed.

It also re-origins the model: feet on the floor, centred on X, and scaled to the height our characters
are built at, so it drops into the same world without a magic number at the call site.

The colour conversion is the fiddly part. Blender hands back an sRGB image's pixels sRGB-encoded,
while glTF's COLOR_0 and our own builder's material colours are both linear, so the samples are
converted on the way in. Skipping that leaves everything looking washed out and pale.
"""
import sys, os, math
import numpy as np
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def flag(name, default, cast=str):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return cast(v)
    return default
HEIGHT = flag("--height", 2.0, float)     # what our own characters are built to, crown to sole
PREVIEW = flag("--preview", "")
if len(args) < 2:
    print(__doc__)
    sys.exit(1)
SRC, OUT = os.path.abspath(args[0]), os.path.abspath(args[1])

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
if not meshes:
    sys.exit("no mesh in " + SRC)
if len(meshes) > 1:  # one object, so one colour attribute and one draw call
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active = meshes[0]
me = obj.data

def base_colour_image(mat):
    """The image feeding Base Color, ignoring the metallic/roughness map hanging off the same tree."""
    if not mat or not mat.node_tree:
        return None
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        link = next((l for l in mat.node_tree.links if l.to_node == bsdf and l.to_socket.name == "Base Color"), None)
        while link is not None:
            node = link.from_node
            if node.type == "TEX_IMAGE":
                return node.image
            link = next((l for l in mat.node_tree.links if l.to_node == node), None)
    return next((n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image), None)

img = next((i for i in (base_colour_image(m) for m in me.materials) if i is not None), None)
if img is None:
    sys.exit("no base colour texture to bake")
w, h = img.size
tex = np.array(img.pixels[:], np.float32).reshape(h, w, 4)[..., :3]
print(f"baking from {img.name} ({w}x{h}, {img.colorspace_settings.name}) onto {len(me.loops)} face corners")

def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

if img.colorspace_settings.name.lower().startswith("srgb"):
    tex = to_linear(tex)

uv = me.uv_layers.active
if uv is None:
    sys.exit("the mesh has no UVs, so the texture cannot be read onto it")
uvs = np.empty(len(me.loops) * 2, np.float32)
uv.data.foreach_get("uv", uvs)
uvs = uvs.reshape(-1, 2)
# Sample a little inside the face rather than exactly on its corner. A corner UV sits on the edge of
# its island, and at a seam the nearest texel is the padding outside it, which showed up as bright
# streaks along the shoulders and around the cross. Pulling each sample toward the face's own UV
# centre keeps it on the right island without moving it far enough to change the colour.
starts = np.empty(len(me.polygons), np.int32)
totals = np.empty(len(me.polygons), np.int32)
me.polygons.foreach_get("loop_start", starts)
me.polygons.foreach_get("loop_total", totals)
poly_of = np.repeat(np.arange(len(me.polygons)), totals)
centre = np.zeros((len(me.polygons), 2), np.float64)
np.add.at(centre, poly_of, uvs)
centre /= totals[:, None]
INSET = 0.25
sample = uvs + (centre[poly_of] - uvs) * INSET
xs = np.clip((sample[:, 0] % 1.0) * w, 0, w - 1).astype(np.int32)
ys = np.clip((sample[:, 1] % 1.0) * h, 0, h - 1).astype(np.int32)
cols = tex[ys, xs]

for a in list(me.color_attributes):
    me.color_attributes.remove(a)
attr = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
flat = np.concatenate([cols, np.ones((len(cols), 1), np.float32)], axis=1).reshape(-1)
attr.data.foreach_set("color", flat)

# one plain material: the colour now lives in the mesh, and the game supplies its own shader anyway
for i in range(len(me.materials)):
    me.materials.pop(index=0)
mat = bpy.data.materials.new("Baked")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
vc = mat.node_tree.nodes.new("ShaderNodeVertexColor")
vc.layer_name = "Col"
mat.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.85
bsdf.inputs["Metallic"].default_value = 0.0
me.materials.append(mat)
for i in list(bpy.data.images):
    if i.users == 0 or i is img:
        bpy.data.images.remove(i)

# stand it where our characters stand: feet at z=0, centred on x, scaled to HEIGHT.
# Read the bounds off the vertices, not obj.bound_box: that is cached and still reports the old box
# right after a mesh transform, which quietly turns this whole step into a no-op.
from mathutils import Matrix
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
def bounds():
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    return co.min(axis=0), co.max(axis=0)
lo, hi = bounds()
s = HEIGHT / max(1e-6, float(hi[2] - lo[2]))
me.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, 0, -lo[2])))
me.transform(Matrix.Scale(s, 4))
me.update()
lo, hi = bounds()
print("scaled by %.3f -> height %.3f, feet at %.3f, width %.3f, depth %.3f" % (
    s, hi[2] - lo[2], lo[2], hi[0] - lo[0], hi[1] - lo[1]))

me.calc_loop_triangles()
print("TRIS", len(me.loop_triangles))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True,
                          use_selection=True, export_animations=False, export_materials="EXPORT")
print("exported", OUT)

if PREVIEW:
    for m in bpy.data.materials:
        b = m.node_tree.nodes.get("Principled BSDF")
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
    lo, hi = bounds()
    z_lo, z_hi = float(lo[2]), float(hi[2])
    bpy.ops.object.camera_add(location=(0, -9.0, (z_lo + z_hi) / 2))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = max(z_hi - z_lo, max(abs(float(lo[0])), abs(float(hi[0]))) * 2) * 1.16
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
        a = px[i + 3]
        for k in range(3):
            px[i + k] = px[i + k] * a + (1.0 - a)
        px[i + 3] = 1.0
    im.pixels = px
    im.filepath_raw = PREVIEW
    im.file_format = "PNG"
    im.save()
    print("preview", PREVIEW)
