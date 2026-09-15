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

## Seeing what the score cannot: tools/fit/inspect.py

    blender -b -P tools/fit/inspect.py -- king

The fit score is a whole-body pixel count, and pixels are dominated by the torso and the skirt. A face
is forty pixels out of ten thousand, so it can be completely wrong while the number barely moves: that
is how a pair of anime eyes survived every run on a character whose reference has two dark squares.

The inspector reports the things area hides. It changes nothing.

- **Bands** cut the figure into six and score each on its own, so the head is judged as a head.
- **Landmarks** read the shoulder, waist, widest point and hem off the silhouette's width profile and
  compare their heights. These are proportions, which is what "it looks wrong" usually means.
- **Census** lists every part colour with its share of the figure and how far down its centre sits, so
  a feature the art has and the model lacks shows up as area on one side and none on the other.
- **Detail** counts internal boundary per band. Far below the art means missing trim, seams or a face.

It writes `reports/<who>-inspect.png`: reference, model, a bar per band, and the two width profiles
overlaid with the art pale and the model dark.

## Symmetric references

These characters are bilaterally symmetric, but the art is lit from one side, so one half sits in
shadow while the model is built symmetric and rendered flat. That difference is pure noise, and worse,
it drags shaded colours onto the wrong roles: half the Queen's dress was reading as skin. The fitter
finds the mirror axis, builds a version from each half, and keeps whichever scores best against the
model, along with using the reference whole. Which half is better is not guessable, so it is measured;
relabelling costs no extra render. `--mirror left|right|off` overrides the choice.

## Half builds

Building the character in Blender is the whole cost of an iteration: about 1.8 ms per primitive, while
the render and the comparison are free. A third of the primitives are the mirrored halves of pairs, so
the fitter builds only one side and flips it back in numpy, which costs nothing. Same score, 43% less
time. Before trusting it the fitter renders the start pose both ways and checks they match, falling
back to whole builds if they ever diverge, so it can never quietly fit a character we do not ship.
`--whole` turns it off. The exported model is always built whole.

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
width, height, drop and how many points show, beard width and height; for the Queen the gown's width,
height, waist and bell, her sleeve length, how far the hem clears the floor, and how far her long hair
falls. Anything the reference has that none of these can reach shows as red or yellow in the
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
budget is spent. `--jobs 4` runs four seeds in parallel Blenders and keeps the best, but measure
before reaching for it: Blender already uses every core, so on an eight-core machine four seeds each
ran about four times slower and total throughput slightly fell. One seed is the sane default.

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
`reports/<who>-stage-N.png` every N renders, to watch a run), `--fresh` (ignore the saved params and
start from the builder's defaults, which is what you want after changing a character's parts),
`--mirror off` (score against the reference exactly as given), `--whole` (build both sides of every
pair, roughly twice the time),
`--subprocess` (one Blender per render; slow, but shows the builder's own output if it fails).

The runs are independent per character, so `tools/fit/fit-all.sh` fits everything with a reference.
To undo a fit, delete its params file and rebuild the model.
