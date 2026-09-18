# The cast, against the story

Every character model the game ships, next to what the bible now says that character is. The models
were built **before** draft four of the story, so a gap is expected — this is the record of where it
is, not a complaint that it exists.

Read this alongside **/board/#/cast**, which renders each one live and animated from the real rig.
A still is half a judgement; a silhouette either reads in the walk cycle or it does not.

**How to use this file.** It is the only place the scores live — the board reads it, so editing here
is editing the board. Each entry carries:

- **Fit** — `n/5`, or `unjudged` where nobody has looked yet. Do not invent one to fill the column.
- **Story says** — what the bible asks for.
- **Model is** — what is actually on screen.
- **Gap** — the shortest honest description of the difference.

`Fit` means *does this model read as this character*, not *is this model good*.

---

## king — King Corvyn

**Story id** corvyn · **Model** `king.glb` · **Wears** no tint; ships as authored

**Story says.** Young, unglamorous, stubborn. The first king in four generations to do any of the
work himself — the one with the pick in his hand when the quarry wants working. Married a
blacksmith's daughter and never explained himself. His answer to the supernatural is to fetch a
hammer and ask what it is made of.

**Model is.** A broad gold crown, full dark beard, blue tunic with gold trim, red sleeves, brown
boots. Reads as a storybook king: prosperous, ceremonial, middle-aged.

**Gap.** **Unglamorous is the word the model misses.** The crown is the largest single element on
him and it is the ceremonial kind; the tunic is court dress. Nothing on him says he works. The
beard also reads older than "young".

**Fit** 2/5

**Would close it.** A smaller, plainer circlet. Sleeves pushed back. Something at the belt that is a
tool rather than a jewel — the hammer is in his characterisation twice and on his body nowhere.

---

## queen — Wren

**Story id** wren · **Model** `queen.glb` · **Wears** no tint; ships as authored

**Story says.** Not highborn. Broad hands, no patience for court, funny in a way that alarms people.
A blacksmith's daughter. Later: the last of a line she has never heard of, dreaming of a mountain.

**Model is.** Pink floor-length gown, gold tiara with a blue stone, long brown hair, neat and
symmetrical. Reads as a fairytale princess.

**Gap.** **The single widest gap in the cast.** Every visual cue says highborn, which is the one
thing the story is explicit that she is not — "not highborn" is the first clause of her entry. The
gown would also stop her doing anything the story has her do.

**Fit** 1/5

**Would close it.** Working clothes she could be carried off in. Hands that read as broad. The
tiara is the thing to lose first — she is the King's wife, not a queen by birth, and the story makes
a point of it.

---

## boss — The Rust (Ser Aldric Vane)

**Story id** rust · **Model** `boss.glb` · **Wears** `rankTints('boss', rank 0)` — `bone: #e3d7b8`, `boneDark: #5b4a33`

**Story says.** A man in **rusted armour** who has not taken his helm off in twenty years. Was the
kingdom's greatest knight; there is a statue of him in the square. He has been trying to lose for
eleven years and is very good at his job and cannot help it. At 20% health he stops fighting and
opens his arms, and then the helm comes off.

**Model is.** Bone-cream armour with brown leather, a brown helm. Bulky, rounded.

**Gap.** **He is not rusted.** The name is the design brief and the model does not meet it — the
colour the game actually paints him is pale bone, because `boss` falls through to the default tint
in `rankTints` and rank 0's `light` is `#e3d7b8`. Nothing about the silhouette says "was once the
finest knight in the kingdom" either; there is no trace of the man under it, which is the whole
point of the twist.

**Fit** 1/5

**Would close it.** Orange-brown oxidised metal, obviously. Beyond that: some piece of the
kingdom's own heraldry still legible under the corrosion, so the reveal is something a player could
have seen coming. **The helm needs to be removable** — the story's biggest beat is it coming off,
and it is currently one mesh.

---

## king_mounted — King Corvyn, mounted

**Story id** corvyn · **Model** `king_mounted.glb` · **Wears** no tint; loaded after the first run starts

**Story says.** The same man. The stables are a late unlock, so this is how the player spends the
back half of a run.

**Model is.** Not yet looked at on the sheet.

**Gap.** Whatever is wrong with the King on foot is wrong here too, and is seen for longer.

**Fit** unjudged

---

## raider — the Rust's men

**Model** `raider.glb` · **Plays** `knight`, `thief` and `sapper` · **Wears** per-type tints

**Story says.** They wear the kingdom's own colours under the rust. Somebody taught them to stand
off and shoot the wall crews. One of your own soldiers knew a face among the dead — it was his
father's. Bramble: *"they're not raiders, love. Raiders want something. Look at their feet."*

**Model is.** Not yet looked at on the sheet.

**Gap.** Unmeasured. But the story makes two specific visual demands and both are checkable: **the
kingdom's colours under the rust**, and **something wrong with their feet.** Bramble's line is the
moment the player is told what they are, and it only works if the thing she points at is on screen.

**Fit** unjudged

---

## elite — the Rust's elite and shieldbearers

**Model** `elite.glb` · **Plays** `elite` and `shield` · **Wears** per-type tints

**Story says.** Nothing specific. They are the harder version of the raiders and inherit the same
rule: the kingdom's colours under the rust.

**Model is.** Not yet looked at on the sheet.

**Fit** unjudged

---

## brute — the brute

**Model** `brute.glb` · **Wears** `darkRed: tunic`, `leather: trim`

**Story says.** Nothing specific.

**Model is.** Not yet looked at on the sheet.

**Fit** unjudged

---

## archer — your archers, and theirs

**Model** `archer.glb` · **Wears** friendly: hair tint only, veterans get `#f2d16b` / `#8d1d22`.
Enemy archers get the rank tunic.

**Story says.** Nothing specific about your soldiers as individuals. The one story demand is that
**yours and theirs must be distinguishable at a glance**, because the same rig plays both.

**Model is.** Not yet looked at on the sheet.

**Fit** unjudged

---

## swordsman — your swordsmen

**Model** `swordsman.glb` · **Wears** no tint

**Story says.** Nothing specific.

**Model is.** Not yet looked at on the sheet.

**Fit** unjudged

---

## Named in the story, with no model at all

`src/story.js` says so itself: *"Bramble, Bracken and Ilka have no model yet and a missing image is
not a portrait."* They appear in the cast list with a coloured medallion instead of a face.

| Character | The story asks for | Where they appear |
| --- | --- | --- |
| **Ser Bracken** | A knight who rode in unasked from somewhere south. Useful the way a good hammer is useful. Opens the east gate at Lv. 12 | Cast list, medallion only |
| **Bramble** | The hedge-witch. Seventy-odd, chickens, poultices, a filthy sense of humour. The first to say *witch* and mean it as a trade | Cast list, medallion only |
| **Ilka** | One of theirs, who put her sword down in the iron field instead of using it. Speaks the line over the Rust's body | Cast list, medallion only |

Bracken is the one that costs most to leave out: he is on screen as an ally for ten levels and then
betrays you, and a betrayal by someone the player never had a face for is a plot summary rather than
a turn.
