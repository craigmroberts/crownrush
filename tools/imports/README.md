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

The swordsman is the same man with a sword and a shield, so he goes the same way, with his own
clusters named for what he carries:

    --parts 12 --roles skin,blue,boot,white,white,skin,gold,blue,steel,steel,steel,steel \
    --carve boot>hair:0.80:0.40

A building has no rig and no palette, and it does not bake either: `--texture` keeps the texture and
only resizes it. A character is baked because the crowd draws a hundred of them from one palette; a
building is one object drawn once, and what makes this art worth importing is painted, not modelled.
Baked to vertex colours, the Archery Range's bullseye -- four rings on a disc of twenty triangles --
came out a smear, and no amount of sampling fixes that, because the vertices to put the rings on do
not exist. Keeping the texture also came out smaller: 330 kB brotli'd against 342 kB, rings intact.

`--height` sizes it, and the thing to size a building by is its door. Our scale comes from the
characters, so a door wants to be about a King tall. The procedural hut's is half that, and the
import inherited the same mistake until someone stood in the doorway.

    blender -b -P tools/blender/bake_vertex_colors.py -- tools/imports/meshy-hut-8k.glb \
        tools/imports/hut-tex.glb --texture 1024 --height 7.6
    blender -b -P tools/blender/bake_vertex_colors.py -- tools/imports/meshy-keep-8k.glb \
        tools/imports/keep-tex.glb --texture 1024 --height 10.5

    blender -b -P tools/blender/bake_vertex_colors.py -- tools/imports/meshy-tower-8k.glb \
        tools/imports/tower-tex.glb --texture 1024 --height 7.1

    blender -b -P tools/blender/bake_vertex_colors.py -- tools/imports/meshy-barracks-8k.glb \
        tools/imports/barracks-tex.glb --texture 1024 --height 9.0

    blender -b -P tools/blender/bake_vertex_colors.py -- tools/imports/meshy-house-8k.glb \
        tools/imports/house-tex.glb --texture 1024 --height 5.3

The villager home's 5.3 was found rather than guessed, and the way to find it is worth keeping. Its
chimney is the tallest thing on it and carries about a third of the total height, so sizing by the
overall number would have made the house itself far too small. Instead: bake at any height, render an
orthographic elevation of it beside a building whose door is already right, and compare the two doors
at the same scale. At 8.0 its door came out 2.47 units against the Archery Range's 1.65; 8.0 x
1.65/2.47 is 5.3, and at 5.3 the doors match to within 2%. The footprint that falls out, 4.0 x 3.7,
is what tools/layout/check.mjs is told.

Size by the building, then check the footprint against the plot. A generated building often brings a
yard with it -- the barracks has a training dummy, hay bales and a weapon rack -- so its bounds can
be twice the building's. The barracks came out 7.7 x 8.0 against the built hall's 4.2 x 3.0, which no
longer fitted between its pads and the north wall; it moved rather than shrank, because shrinking it
to fit the old spot would have made the hall itself smaller than the one it replaced.

A building that units fight over needs more than a size. The Keep carries its collision in
`CFG.keep` (`half` is its footprint from the centre, `radius` how close a unit may come), and those
have to follow the model or enemies stand inside the walls they are hitting. It also has to name the
spot the Queen stands on, `userData.balcony`, the way the built one does.

A tower needs two more. `userData.top` is the height `crewSpots` stands archers at, so the import is
sized to put its deck exactly where the built tower's is (2.72) and the crew code never learns which
one it got. And a tower has levels, which one generated mesh cannot carry: `makeTowerLevelBits`
builds the things that say the level -- a pennant each, braziers on the rail, gold studs at the top
level -- and hangs them on the import.

Royals bake to vertex colours (no `--parts`), because they keep their texture detail and are drawn on
their own. Everyone the crowd draws bakes to flat named materials instead, because a part in the crowd
palette IS a material, and that is what the rank and veteran tints recolour.
