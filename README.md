# Crown Rush

A simple, addictive low-poly defend-and-build game for the browser (desktop and phone).
No storyline, just the loop:

1. Raiders attack. You start with only the King.
2. Shoot them down and grab the coins they drop.
3. Carry the coins to a build pad and stand on it to spend them.
4. Pads build your village: an archery range, more archers, watchtowers, a palisade, a barracks...
5. Every build unlocks new pads, so your army and village keep growing while the waves get harder.

The palisade is a real wall. Its outline is laid out as a ghost before you pay, each wall goes up section by
section with gates the King can walk through, and raiders have to bash a section down before they can get
in. Broken sections show a repair pad. Gate guards and corner towers unlock once the walls are up.

Sound is synthesised in the browser (no audio files): a looping background melody, arrow hits, coin pickups,
the "ching" of coins being spent, build fanfares and wave horns. The speaker button in the corner mutes it.

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
- `WALLS` is the palisade layout: the village rectangle, the sections along each side, gates, and wall HP.

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
