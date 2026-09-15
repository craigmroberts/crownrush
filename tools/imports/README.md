Drop model files exported from other tools here (Meshy, Blockbench, Mixamo...).

glTF binary (.glb) is the format the game loads. fbx and obj work too as a source; they carry
geometry but obj carries no rig at all.

Nothing in here is committed: it is the raw import, not the shipped model.

## The characters that came through here

Each one is a Meshy generate, remeshed to 10K triangles (free, and what gives the ~8.5k-triangle
`meshy-*-8k.glb` files), then baked and rigged:

    blender -b -P tools/blender/bake_vertex_colors.py -- tools/imports/meshy-archer-8k.glb \
        tools/imports/archer-parts.glb --parts 10 \
        --roles boot,skin,blue,white,skin,white,blue,skin,blue,white \
        --carve boot>hair:0.80:0.40
    blender -b -P tools/blender/rig_imported.py -- tools/imports/archer-parts.glb \
        public/models/archer_ai.glb --rig public/models/archer.glb --no-arms
    node tools/models/compress.mjs

Royals bake to vertex colours (no `--parts`), because they keep their texture detail and are drawn on
their own. Everyone the crowd draws bakes to flat named materials instead, because a part in the crowd
palette IS a material, and that is what the rank and veteran tints recolour.
