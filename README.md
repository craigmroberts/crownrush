# Crown Rush

A simple, addictive low-poly defend-and-build game for the browser (desktop and phone).
No storyline, just the loop:

1. Raiders attack. You start with only the King.
2. Shoot them down and grab the coins they drop.
3. Carry the coins to a build pad and stand on it to spend them.
4. Pads build your village: an archery range, more archers, watchtowers, a palisade, a barracks...
5. Every build unlocks new pads, so your army and village keep growing while the waves get harder.

**Goal:** survive 30 waves to secure the kingdom. After that the raids keep coming for a high score.

- The village starts as a small plot. "Expand Village" pads grow it in three stages, each with its own
  wall ring. When the outer ring is complete the old inner wall is torn down.
- Walls are real: raiders are blocked and bash a section down before they can get in. Broken sections
  show a repair pad. Upgrade pads rebuild every section from wood to brick, stone and iron.
- Watchtowers are built empty. A "Man the Tower" pad next to each one takes archers from your army
  (the price is people, not coins). Gate guards work the same way.
- Red arrows at the screen edge point at raiders you can't see, with a count and a skull for bosses.
- Sound is synthesised in the browser (no audio files): a looping background melody, arrow hits, coin
  pickups, the "ching" of coins being spent, build fanfares and wave horns. The speaker button mutes it.

## Run it locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). To play on your phone, make sure it is on the
same Wi-Fi and open the "Network" URL that Vite prints instead.

## Controls

- Phone: drag anywhere on the screen to move the King (virtual joystick).
- Desktop: WASD or arrow keys, or drag with the mouse.
- Everything else is automatic: the King and his archers shoot the nearest enemy, coins are picked up by
  walking near them, and standing on a build pad spends coins one at a time.

## Tuning the game

All balance lives in [`src/config.js`](src/config.js):

- `CFG` holds unit stats, wave pacing, enemy stats and the coin pickup radius.
- `PADS` is the build tree. Each pad has a position, a cost, an icon, what it requires, and what it does
  (spawn units, build a structure, or apply an upgrade). Add an entry and it appears in the game.
- `TIERS` is the village layout: the rectangle for each expansion stage, its gates, and wall section length.
- `CFG.wallLevels` sets HP and repair cost per wall material.

## Project layout

```
index.html        HUD + start / game-over screens
src/main.js       bootstraps the game loop
src/game.js       the whole simulation: player, army, enemies, waves, coins, pads, camera
src/models.js     low-poly model builders (king, archers, knights, boss, buildings, pads)
src/world.js      terrain, paths, cliffs, trees, lighting
src/input.js      virtual joystick + keyboard
src/hud.js        DOM overlay
src/audio.js      Web Audio synth: music loop and sound effects
src/config.js     balance and build tree
```

Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). No other dependencies.

## Build for the web

```bash
npm run build
```

The output in `dist/` is a static site you can drop on any host.
