# The brand, and what has been decided

This is the written half of the brand guide: the decisions, the reasoning and the questions still
open. The **measured** half — how many colours the code actually contains, which tokens are dead,
what the type ramp is, every icon — is not here on purpose. It is counted from `src/` on every
`npm run board` and shown at **/board/#/brand**, because a number written down in a document is a
copy, and a copy starts drifting the moment the code moves.

That is not hypothetical. The page this replaces reported "361 colours, 85 near-identical pairs, 13
of 16 tokens dead, and `font-weight: 900` requested from a face that stops at 800". Every one of
those figures was true when it was written. By the time it was migrated the colours were 395, the
pairs 90, the dead tokens 3, and the font-weight bug had been fixed — and the page had no way to
know, because nothing it said was connected to anything.

**Where things live now**

| | |
| --- | --- |
| Decisions, reasoning, open questions | this file |
| Colour census, tokens, type ramp, icons | `/board/#/brand`, measured by `tools/board/brand.mjs` |
| What the UI actually looks like | `/board/#/ui` — the real game in frames |
| The tokens themselves | `src/style.css` `:root`, with the reason beside each |

---

## The palette: Emerald, and why

Deep forest-teal panels with gold. Six directions were built as complete, switchable token sets and
tried against the real game; this is the one that shipped.

| Direction | The case for it | The case against |
| --- | --- | --- |
| **Emerald** — *shipped* | Deep forest-teal with gold, so the HUD reads as part of the meadow rather than a layer floating over it | Green UI on a green world is the hardest separation to hold. It leans entirely on **value**, which is why the panels are far darker than any terrain the game draws — including the near-white diamond-age walls |
| As it shipped before | Gold on dark olive | Arrived at by accretion rather than choice. This was the baseline every other option had to beat, and it did not win anything |
| Royal | Deep navy with brighter gold. Blue is the one hue the grass world does not own, so the UI never competes with terrain — and the crown is literally the subject | Navy on green clashes at the edges; the scrim has to work harder |
| Parchment | The panel as a physical object — dark ink on vellum — instead of a hole cut in the world. A bright daylight game arguably wants bright UI | Inverts ink and ground, so every text colour flips. The direction most likely to expose hardcoded colours |
| Dusk | Near-black neutral panels, one hot amber. The modern mobile default: maximum legibility, colour spent only where it carries meaning | Reads as generic. Nothing about it says medieval, or says Crown Rush |
| Plum | Saturated plum and warm coral — a game that wants to look fun rather than historical | Fights the low-poly naturalistic world. Would want the 3D palette to move with it |

Gold survives every repaint: it is the crown, and it is the only hue the grass, the stone and the
snow never take.

**Gold is deliberately not one of the five reward-pool colours.** It belongs to the primary button,
and a gold card would read as "the recommended one".

---

## Four decisions taken from the reference shots

All four shipped. They are recorded here because the reasoning is the part worth keeping.

### 1. The enemy count is a bar at the top, not a ring in the corner

The raid meter was a 30px ring in the top-left sharing a row with the Keep level, and it was easy to
miss — which was the complaint. A bar across the top is the same information given the width of the
screen.

It costs **108px of top**: the hearts, the Keep level and the map all move down, and the purse with
them. That is the real price and it was paid knowingly. The bar drains as the raid does so it reads
without a number, but the count stays underneath, because "14 left" is the thing a player acts on
when it gets low. The drained portion is dark and the remainder is the warm colour.

### 2. One plainer button, whose selected state is a glow

Near-black fill, a hairline border, an italic label, one size. The selected item carries a gold ring
with a glow rather than being a different shape.

**One caution, still true:** a selected state comes from a controller cursor, and Crown Rush is
played with a thumb. It maps cleanly onto the places that already have a chosen option — the
run-length pills, the three reward cards — and onto the pressed state everywhere else. It is not a
free swap for all the other treatments.

### 3. Colour the phrase that matters

The clause a player is scanning for gets a second colour inside the sentence. One token
(`--emph`), and a notice becomes readable at a glance instead of a read.

> **Nightfall** — The sun is going down. **Get behind your walls.**

The rule is: **colour the thing to do, never the flavour.** The instruction is the coloured half;
the narration stays plain.

### 4. The token layer has to be real

The previous `:root` declared sixteen properties and thirteen of them had **zero readers** anywhere
in the stylesheet, the JS or the markup. The values had drifted into hundreds of literals, to the
point where `--rim: #d8a83e` and the button frame's `#d8a63c` were the same intended colour two
shades apart, one of them unreachable.

**Anything added to `:root` has to be read by something, or it is decoration pretending to be a
decision.** `tokens-resolve` in `npm run check` enforces the half of that which can be enforced.

---

## Voice: two of them, and four places to speak

Four surfaces carry messages, and which one gets what is a decision, not an accident.

| Surface | Carries |
| --- | --- |
| `#toast` | Narration, centre-bottom. Has sub-parts for kind, face and paging |
| `#alarm` | Urgent. Stacks above the notice line |
| `#pad-tip` | Build-pad detail |
| `.overlay` panels | Anything that stops the game |

**The narrator** is the voice worth keeping:

> The sun is going down. Get behind your walls.
> A thief has your coins! Cut them down before they reach the edge.
> Dawn. You held night 3.
> They want her back. Raiders are coming!

**The system** is a different voice in the same channel, with nowhere else to go:

> Graphics trouble: switching to safe mode.
> Lost the graphics card for a moment. Restoring…

That collision is unresolved. A player being told the renderer fell over, in the voice and the
place that otherwise narrates their kingdom, is the one clear argument for a fifth channel.

---

## The icons are the healthiest thing here

Hand-drawn SVGs, one shared outline colour, one stroke weight of 1.6, one 24px grid, and no emoji
anywhere. The closest the game has to a working design system, and the part of it nothing should
change without a reason.

**The catch:** they hardcode their fills, so a palette change means editing `src/icons.js` alongside
the stylesheet. The icons do not move with the tokens. That is the one thing about them worth
fixing, and it has not been.

---

## Still open

Everything below is a question for the owner. Nothing here argues for keeping something, except the
copy voice and the icon discipline.

- **Name and mark.** Is Crown Rush staying? The wordmark is live text today, so changing it costs
  almost nothing right now. A real logo asset would spend bytes on the title screen.
- **Reach.** UI only, or the 3D world's material palette too? The world is a separate and much
  larger palette, and the two have never been considered together.
- **Fonts.** Baloo 2 + Nunito is a common pairing. Keep it, or spend the ~135 kB on something more
  distinctive?
- **How prescriptive.** Rules that mostly fit what exists — or a real redesign the code moves
  toward, accepting a long tail of follow-up tickets?
- **The three dead tokens.** `--frame-hi`, `--frame-lo` and `--danger-edge` are left from a
  three-stop button frame the code no longer paints; it uses a flat `border-color` now. Either the
  gradient comes back or they go, and that is a design call rather than a cleanup.
