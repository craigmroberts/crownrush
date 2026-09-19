// #168: adaptive quality. The game had one adaptive path -- safeMode(), which fires when a frame
// draws NOTHING -- and no response at all between "fine" and "blank". The load is not steady: a quiet
// morning and night 30 are wildly different scenes (137 to 270 draws, 617k to 988k triangles from one
// build, minutes apart), and the worst of that lands on the worst device. This gives the game a few
// things to give up, in the order they cost the look, and the discipline to give them up quietly and
// take them back slowly.
//
// THE MEASURE IS THE RAW FRAME DELTA, not `dt`. `dt` is capped at 0.05 in main.js, so read from it
// every device is 20fps or better. And a frame over `stall` (a quarter second) is thrown away rather
// than counted: that is a tab switch, a GC pause, a first-frame shader compile -- or SwiftShader,
// which paints a frame a second and would otherwise drop the probe and every headless check to the
// floor tier the moment it started. A stall is a hitch, not a rate; the rate is what this tunes to.
//
// HYSTERESIS, because a switch that flaps is worse than none: dropping grass at 44fps and putting it
// back at 46 is a world that visibly breathes. Drop after `dropAfter` seconds under the next tier's
// threshold; restore one tier only after `restoreAfter` seconds a clear `restoreMargin` above the
// tier's own threshold. Drop quickly, restore slowly, and only ever one tier at a time each way.
//
// `?quality=N` pins a tier -- 0 for full, which is how a probe or a screenshot harness asks for the
// same picture every time -- and `?perf=1` names the tier that is active, so the first report is not
// "the grass disappeared" with nothing to explain it.
import { CFG } from './config.js';

export const QualityMethods = {
  // called once a frame from main.js with the real elapsed seconds since the last frame
  updateQuality(raw) {
    const Q = CFG.quality;
    const q = this.quality;
    if (q.forced != null || !this.running) return;   // pinned, or paused: a paused frame is cheap and proves nothing
    if (!(raw > 0) || raw > Q.stall) return;
    const fps = 1 / raw;
    const t = q.tier;
    const dropAt = t < Q.tiers.length ? Q.tiers[t].fps : 0;
    const restoreAt = t > 0 ? Q.tiers[t - 1].fps + Q.restoreMargin : Infinity;
    if (fps < dropAt) {
      q.slow += raw;
      q.fast = 0;
      if (q.slow >= Q.dropAfter) {
        this.applyQuality(t + 1);
        q.slow = 0;
      }
    } else if (fps > restoreAt) {
      q.fast += raw;
      q.slow = 0;
      if (q.fast >= Q.restoreAfter) {
        this.applyQuality(t - 1);
        q.fast = 0;
      }
    } else {
      // in the band: the slow clock drains rather than resetting, so a 44/46 flicker neither drops
      // nor forgets; the fast clock resets, because "sustained" means sustained
      q.slow = Math.max(0, q.slow - raw);
      q.fast = 0;
    }
  },

  // tier 0 is the full picture; tier n is CFG.quality.tiers[n - 1]
  applyQuality(tier) {
    const Q = CFG.quality;
    const q = this.quality;
    tier = Math.max(0, Math.min(Q.tiers.length, tier));
    if (tier === q.tier && q.applied) return;
    q.tier = tier;
    q.applied = true;
    const s = tier ? Q.tiers[tier - 1] : { grass: 1, flowers: 1, wind: true, shadows: true, dpr: 1, post: true };
    this.world.setQuality(s);
    q.dpr = s.dpr;
    // #189: the grade pass goes with the tier. Only the PASS is switched, never the path -- the
    // composer stays in place at every tier, because swapping between it and a direct render changes
    // the tone-mapping define on every material and recompiles the scene. See post.js.
    if (this.post) this.post.grade.enabled = s.post !== false;
    this.resize();   // re-derives the pixel ratio with `q.dpr` in it
  },

  // for the perf overlay
  qualityLabel() {
    const q = this.quality;
    if (!q.tier) return `quality full${q.forced != null ? ' (pinned)' : ''}`;
    const s = CFG.quality.tiers[q.tier - 1];
    return `quality tier ${q.tier} of ${CFG.quality.tiers.length}${q.forced != null ? ' (pinned)' : ''}: grass ${Math.round(s.grass * 100)}% · flowers ${Math.round(s.flowers * 100)}%`
      + `${s.wind ? '' : ' · wind off'}${s.shadows ? '' : ' · contact shadows off'}${s.post === false ? ' · post off' : ''}${s.dpr < 1 ? ` · resolution ×${s.dpr}` : ''}`;
  },
};
