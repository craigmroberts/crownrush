# Fit a character to a reference image (no AI, no tokens)

    blender -b -P tools/fit/fit.py -- king tools/fit/refs/king.png

Put a front-view reference on a plain or transparent background in `tools/fit/refs/`, run the line
above, and walk away. The script rebuilds the character, renders a flat front view, scores it against
the reference (silhouette overlap plus colour per horizontal band), nudges one proportion, and keeps
the change if the score rose. It stops when it reaches the target score or when 25 tries in a row
made nothing better. About four seconds per try on this machine; a run is a few minutes.

It prints one verdict line and writes:

- `tools/fit/params/<who>.json` – the best proportions and colours. `make_character.py` loads this
  automatically, so the next model build uses the fitted look.
- `tools/fit/reports/<who>.png` – reference | render | overlay. Red is reference shape the model
  cannot make; blue is model shape the reference lacks. Red means "add a part", not "run it longer".

**Pinning colours.** Automatic colour matching is reliable for broad areas (a tunic, a dress, boots)
and unreliable for skin, hair and small trims on shaded artwork. Eyedrop those from the reference into
`tools/fit/refs/<who>.colors.json` and they override the guess:

    { "skin": "#f0c096", "hair": "#5a3a22", "gold": "#e0b23a" }

Role names are the builder's palette names (skin, hair, beard, blue, gold, leather, boot, white, red,
pink, navy, darkRed, ink, bone, boneDark, steel, steelDark).

Options: `--iters 150` (max renders), `--target 0.86` (score to stop at, 0..1), `--patience 25`,
`--res 160` (comparison resolution), `--seed 2` (a different search path).

The runs are independent per character, so `for c in king queen archer; do ...; done` fits the lot
overnight. To undo a fit, delete its params file.
