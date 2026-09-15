"""Bake a textured model's colours into vertex colours, and stand it where our characters stand.

    blender -b -P tools/blender/bake_vertex_colors.py -- in.glb out.glb [--height 2.0] [--preview p.png]
    blender -b -P tools/blender/bake_vertex_colors.py -- in.glb out.glb --parts 10 --roles boot,skin,...
                                                        [--carve boot>hair:0.80:0.40]

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
# --parts N bakes into N flat materials named after our palette roles instead of per-vertex colours.
# The crowd draws enemies as one instanced mesh and recolours them per rank by looking a part's colour
# up in a palette, and a part is a material. One material with the colour in the mesh would leave every
# rank the same shade and throw away the thing the colour is there for: saying how dangerous this one is.
PARTS = flag("--parts", 0, int)
# --roles names those parts explicitly, largest first, e.g. "darkRed,red,leather,skin,skin,steel".
# Naming them by whichever palette colour they are nearest does not work: generated art is far more
# saturated than our palette, so the bright red armour came back called darkRed and the skin called
# pink, and the rank tint would then have painted the trim colour over the whole body. Repeats are
# allowed and merge into one part, which is what a part is in the crowd shader anyway.
ROLES = [r for r in flag("--roles", "").split(",") if r]
# --carve boot>hair:0.80:0.40 takes the faces of the part named boot that sit above 80% of the
# figure's height and within 40% of the way out from its centre line, and makes them a part called
# hair instead. Clustering can only see colour, and on this art the hair, the boots and the wooden
# bow are all one brown: one part. That is fine until the game tints it, because the archer's hair
# is tinted per soldier so a crowd is not one man repeated, and tinting the brown would have taken
# his boots and his bow with it. Where a part is on the body is the thing colour cannot tell you.
CARVES = []
for spec in [c for c in flag("--carve", "").split(",") if c]:
    src_dst, zmin, rmax = spec.split(":")
    src, dst = src_dst.split(">")
    CARVES.append((src, dst, float(zmin), float(rmax)))
# the builder's own palette, linear as it defines it. Only used to NAME a cluster after the role whose
# colour it is nearest; the colour itself comes from the model.
ROLES_LINEAR = {
    "skin": (0.97, 0.80, 0.66), "hair": (0.32, 0.17, 0.07), "beard": (0.38, 0.22, 0.10),
    "blue": (0.16, 0.42, 0.85), "gold": (0.95, 0.70, 0.18), "leather": (0.45, 0.27, 0.14),
    "boot": (0.32, 0.20, 0.12), "white": (0.97, 0.97, 0.97), "black": (0.05, 0.05, 0.06),
    "red": (0.85, 0.12, 0.14), "pink": (0.94, 0.48, 0.66), "steel": (0.76, 0.78, 0.81),
    "steelDark": (0.45, 0.48, 0.52), "navy": (0.2, 0.22, 0.34), "darkRed": (0.52, 0.08, 0.1),
    "ink": (0.13, 0.13, 0.16), "bone": (0.93, 0.89, 0.9), "wood": (0.5, 0.33, 0.16),
}
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

def srgb(c):
    c = np.clip(np.asarray(c, np.float64), 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)

def kmeans(px, k, rounds=24):
    """Farthest-point seeding then Lloyd, so a small but distinct part (a belt, a shield boss) keeps a
    centre instead of being absorbed into the nearest big one."""
    rng = np.random.default_rng(0)
    cents = [px[rng.integers(len(px))]]
    for _ in range(k - 1):
        d = np.min(np.stack([np.linalg.norm(px - c, axis=1) for c in cents]), axis=0)
        cents.append(px[int(np.argmax(d))])
    cents = np.stack(cents)
    lab = np.zeros(len(px), np.int32)
    for _ in range(rounds):
        lab = np.argmin(np.stack([np.linalg.norm(px - c, axis=1) for c in cents]), axis=0)
        for i in range(k):
            if (lab == i).any():
                cents[i] = px[lab == i].mean(axis=0)
    return cents, lab

if PARTS:
    # One flat material per colour, named after the palette role it is nearest. The face takes the
    # colour at its own UV centre, so a face never straddles two parts the way a corner sample can.
    starts = np.empty(len(me.polygons), np.int32)
    totals = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("loop_start", starts)
    me.polygons.foreach_get("loop_total", totals)
    poly_of = np.repeat(np.arange(len(me.polygons)), totals)
    face_uv = np.zeros((len(me.polygons), 2), np.float64)
    np.add.at(face_uv, poly_of, uvs)
    face_uv /= totals[:, None]
    fx = np.clip((face_uv[:, 0] % 1.0) * w, 0, w - 1).astype(np.int32)
    fy = np.clip((face_uv[:, 1] % 1.0) * h, 0, h - 1).astype(np.int32)
    face_col = tex[fy, fx]
    cents, lab = kmeans(face_col, min(PARTS, len(me.polygons)))
    # Where each cluster sits on the figure, printed beside its colour. Colour alone cannot tell you
    # whether a brown cluster is the hair, the boots or a bow, and that is exactly what you need to
    # know to name it: a part the game tints must not quietly include something that should not move.
    fc = np.empty(len(me.polygons) * 3, np.float64)
    me.polygons.foreach_get("center", fc)
    fc = fc.reshape(-1, 3)
    z0, z1 = float(fc[:, 2].min()), float(fc[:, 2].max())
    zf = (fc[:, 2] - z0) / max(1e-9, z1 - z0)
    rf = np.abs(fc[:, 0]) / max(1e-9, np.abs(fc[:, 0]).max())
    role_lin = np.array([ROLES_LINEAR[r] for r in ROLES_LINEAR], np.float64)
    role_names = list(ROLES_LINEAR)
    used = {}
    for i in range(len(me.materials)):
        me.materials.pop(index=0)
    order = np.argsort(-np.bincount(lab, minlength=len(cents)))   # biggest part first
    slot_of, mat_slot = {}, {}
    for rank, ci in enumerate(order):
        c = cents[ci]
        if rank < len(ROLES):
            name = ROLES[rank]
        else:
            name = role_names[int(np.argmin(np.linalg.norm(srgb(role_lin) - srgb(c), axis=1)))]
            while name in mat_slot:                               # only auto-names need uniquifying
                name += "2"
        if name in mat_slot:
            slot_of[int(ci)] = mat_slot[name]                     # merge into the part already made
            m = lab == ci
            print("  part %-10s %5d faces  (merged)   height %.2f-%.2f  off-centre %.2f"
                  % (name, int(m.sum()), float(np.percentile(zf[m], 2)),
                     float(np.percentile(zf[m], 98)), float(rf[m].mean())))
            continue
        mat = bpy.data.materials.new(name)
        if mat.name != name:
            print("  note: Blender renamed the material to", mat.name)
        mat.use_nodes = True
        bs = mat.node_tree.nodes["Principled BSDF"]
        bs.inputs["Base Color"].default_value = (float(c[0]), float(c[1]), float(c[2]), 1.0)
        bs.inputs["Roughness"].default_value = 0.85
        bs.inputs["Metallic"].default_value = 0.0
        mat.diffuse_color = (float(c[0]), float(c[1]), float(c[2]), 1.0)
        me.materials.append(mat)
        mat_slot[name] = len(me.materials) - 1
        slot_of[int(ci)] = mat_slot[name]
        m = lab == ci
        print("  part %-10s %5d faces  #%02x%02x%02x  height %.2f-%.2f  off-centre %.2f"
              % (name, int(m.sum()), *(int(round(v * 255)) for v in srgb(c)),
                 float(np.percentile(zf[m], 2)), float(np.percentile(zf[m], 98)), float(rf[m].mean())))
    idx = np.array([slot_of[int(l)] for l in lab], np.int32)
    for src, dst, zmin, rmax in CARVES:
        if src not in mat_slot:
            sys.exit("--carve names %r, which is not one of the parts: %s" % (src, ", ".join(mat_slot)))
        m = (idx == mat_slot[src]) & (zf > zmin) & (rf < rmax)
        if not m.any():
            sys.exit("--carve %s>%s:%s:%s selects no face" % (src, dst, zmin, rmax))
        c = face_col[m].mean(axis=0)
        mat = bpy.data.materials.new(dst)
        mat.use_nodes = True
        bs = mat.node_tree.nodes["Principled BSDF"]
        bs.inputs["Base Color"].default_value = (float(c[0]), float(c[1]), float(c[2]), 1.0)
        bs.inputs["Roughness"].default_value = 0.85
        bs.inputs["Metallic"].default_value = 0.0
        mat.diffuse_color = (float(c[0]), float(c[1]), float(c[2]), 1.0)
        me.materials.append(mat)
        idx[m] = len(me.materials) - 1
        print("  carved %-10s %5d faces  #%02x%02x%02x  out of %s"
              % (dst, int(m.sum()), *(int(round(v * 255)) for v in srgb(c)), src))
    me.polygons.foreach_set("material_index", idx)
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
else:
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    attr = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    flat = np.concatenate([cols, np.ones((len(cols), 1), np.float32)], axis=1).reshape(-1)
    attr.data.foreach_set("color", flat)

if not PARTS:
    # one plain material reading the mesh's own colours; in parts mode the materials are the colours
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
