# Fit a character to a reference image (no AI, no tokens)

    blender -b -P tools/fit/fit.py -- king tools/fit/refs/king.png

Put a front-view reference on a plain or transparent background in `tools/fit/refs/`, run the line
above, and walk away. The script rebuilds the character inside the same Blender process, renders a
flat front view, scores it against the reference, and searches the builder's proportion controls
until nothing improves. A render costs about a sixth of a second; a full run is a few minutes.

It prints one verdict line and writes:

- `tools/fit/params/<who>.json` – the best proportions and colours. `make_character.py` loads this
  automatically, so the next model build uses the fitted look (`king_mounted` wears the king's).
- `tools/fit/reports/<who>.png` – reference | render | overlay. In the overlay, purple is a match,
  red is reference the model cannot cover, blue is model the reference lacks, and yellow is the right
  place with the wrong part there (skin where the reference has hair, say).
- `tools/fit/reports/_<who>-labels.png` – how each side was read, part by part, when the yellow needs
  explaining.

## How it scores

Both images are cropped to their subject, scaled to the same width and stood on the same floor, so
position and overall size do not matter. Every pixel is then labelled by the nearest part colour
(blue, gold, skin, brown...), and the score is the share of the union where both sides show the same
part. A plain outline overlap was tried first and let the search grow the beard over the face; this
does not.

## What it can move

torso width and height, arm thickness, length and angle out from the body, hand size, shoulder size,
head size and width, side-hair width and fringe, body height, leg length, thickness and stance, boot
size, a boxy style (rounded boxes instead of ellipsoids, for faceted art), and for the King crown
width, height, drop and how many points show, beard width and height; for the Queen the gown's width
and height. Anything the reference has that none of these can reach shows as red or yellow in the
overlay, and the run ends with a table of the parts that cost the most and what the reference shows
under them: that is a request for a new control or part in `make_character.py`, not something the
search can invent.

## Search

The frame is anchored by the hands (width) and the boots (floor), so the search goes in sections in
that order: body, then stance, then head, each a short sweep of its own few controls; then every
control together. A sweep tries each control up and down by a step and keeps whatever helps, walking
further while it pays; when a whole sweep helps nothing, a few random multi-control jumps are tried,
then the step is halved. Once the step is under 1% of range, every control is kicked at once and the
search converges again from there (basin hopping), keeping the best of the two, until the render
budget is spent. `--jobs 4` runs four seeds in parallel Blenders and keeps the best.

## Pinning colours

Automatic colour matching is reliable for broad areas (a tunic, a dress, boots) and unreliable for
skin, hair and small trims on shaded artwork. Eyedrop those from the reference into
`tools/fit/refs/<who>.colors.json` and they override the guess:

    { "skin": "#f0c096", "hair": "#5a3a22", "gold": "#e0b23a" }

Role names are the builder's palette names (skin, hair, beard, blue, gold, leather, boot, white, red,
pink, navy, darkRed, ink, bone, boneDark, steel, steelDark). Pins are also what lets the layout score
work during the search, so pin the big ones.

## Options

`--iters 2500` (render budget per seed), `--jobs 4` (seeds in parallel), `--target 0.8` (layout score to stop at, 0..1), `--res 160`
(comparison width in pixels), `--seed 2` (a different search path), `--snapshot 500` (write
`reports/<who>-stage-N.png` every N renders, to watch a run), `--subprocess` (one Blender per render;
slow, but shows the builder's own output if it fails).

The runs are independent per character, so `tools/fit/fit-all.sh` fits everything with a reference.
To undo a fit, delete its params file and rebuild the model.
