import { defineConfig } from 'vite';
import { writeFileSync, readFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, extname } from 'node:path';

// Dev-only helper: POST a data URL to /__shot?name=foo to save a PNG/JPEG next to the project
// (used for automated visual checks; harmless in production builds).
function shotPlugin() {
  return {
    name: 'shot',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const name = new URL(req.url, 'http://x').searchParams.get('name') || 'shot';
          const dir = '.shots';
          const m = /^data:image\/(\w+);base64,(.*)$/.exec(body);
          if (!m) {
            res.statusCode = 400;
            return res.end('bad body');
          }
          mkdirSync(dir, { recursive: true });
          writeFileSync(`${dir}/${name}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`, Buffer.from(m[2], 'base64'));
          res.end('ok');
        });
      });
    },
  };
}

// #141: dev only -- where `KTX2Loader` and `DRACOLoader` go looking for their own decoders.
//
// Both reach for a sibling file with `new URL('../libs/<x>/...', import.meta.url)`, which the BUILD
// resolves into a hashed asset of the bundle -- that is the whole reason `src/props.js` refuses
// `setTranscoderPath` (see the comment there; pointing at a copy under public/ emitted both, which is
// the duplicate-decoder trap r186 sprang with Draco).
//
// In dev those loaders are served pre-bundled out of `node_modules/.vite/deps/`, so `import.meta.url`
// is `/node_modules/.vite/deps/...` and `../libs/basis/...` resolves to `/node_modules/.vite/libs/`,
// which does not exist. And it does not 404: the SPA fallback answers 200 with index.html, the worker
// parses `<!doctype html>` as JavaScript, and the game dies at "Loading 9 of 11" with
// `Unexpected identifier 'html'`. Reproduced by fetching the URL directly:
//
//     200  text/html        /node_modules/.vite/libs/basis/basis_transcoder.js
//     200  text/javascript  /node_modules/three/examples/jsm/libs/basis/basis_transcoder.js
//
// It looks intermittent because the dep pre-bundle is rebuilt whenever the import graph changes, so a
// session starts working and stops after an unrelated edit. It was dismissed as HMR noise twice.
//
// `optimizeDeps.exclude` on the two loaders was the other route and is worse: excluded, they import
// `three` themselves while the app's own `three` stays pre-bundled, and two copies of three.js in one
// page is a class of bug far nastier than this one. This maps the directory instead and touches
// nothing else -- the build is untouched (`apply: 'serve'`), and it is mounted at exactly the path
// that is broken, so it cannot shadow a real file.
//
// A miss 404s LOUDLY rather than falling through. A 200 of text/html where JavaScript was asked for
// is the failure this is about, and the Oops screen is least able to explain it -- its own text says
// a reload fixes it, and a reload does not.
function devThreeLibsPlugin() {
  const TYPES = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
  return {
    name: 'dev-three-libs',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/node_modules/.vite/libs', (req, res, next) => {
        const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
        // Nothing here should ever climb out of the libs directory.
        if (rel.includes('..')) return next();
        const file = join('node_modules/three/examples/jsm/libs', rel);
        let body;
        try { body = readFileSync(file); } catch {
          const msg = `dev-three-libs: no such file ${file} (asked for as /node_modules/.vite/libs/${rel})`;
          console.warn(`  ${msg}`);
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain');
          return res.end(msg);
        }
        res.setHeader('Content-Type', TYPES[extname(rel)] || 'application/octet-stream');
        res.end(body);
      });
    },
  };
}

// Writes the service worker, with the list of everything the build produced baked into it.
//
// The list has to be generated rather than written by hand because Vite hashes the bundle's names,
// and the files under public/ — the models, the icons, the manifest — are copied through with the
// names they already had. A hand-written list would go stale on the first rebuild.
//
// Staleness is the thing this has to get right. index.html already carries an apology for "a stale
// cached bundle after a deploy", which is what a badly behaved cache does to a game whose asset names
// change on every build. So: the cache name carries a hash of the file list, and activating a new
// worker deletes every cache that is not the current one. A deploy therefore re-downloads the lot,
// which at two megabytes is a fair price for never serving a player half of one version and half of
// another — and it is the only way the unhashed files under public/ can ever be updated at all.
function serviceWorkerPlugin() {
  const walk = (dir, base = dir) => {
    const out = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...walk(full, base));
      else out.push(relative(base, full).split('\\').join('/'));
    }
    return out;
  };

  return {
    name: 'service-worker',
    apply: 'build',
    writeBundle(options, bundle) {
      const fromBundle = Object.keys(bundle);
      let fromPublic = [];
      try { fromPublic = walk('public'); } catch { /* no public directory */ }
      // "./" is the page itself, which is what a navigation asks for.
      const files = ['./', ...new Set([...fromBundle, ...fromPublic])]
        .filter((f) => f !== 'sw.js')
        .sort();
      // Hash the CONTENTS as well as the names. Vite hashes the bundle's names, so for JS and CSS
      // the names alone were enough -- but the files under public/ keep the names they have, and a
      // deploy that only redraws a character model produced the same list, the same cache name and a
      // byte-identical sw.js. Nothing would have told the browser anything had changed, the old cache
      // would have gone on serving the old model, and the Check for updates row (#84) would have said
      // "Up to date" and meant it. Read from the bundle rather than off disk: public/ is copied by a
      // plugin of Vite's own and there is no promise it has landed by the time this runs.
      const h = createHash('sha256');
      for (const f of files) {
        h.update(f);
        const out = bundle[f];
        if (out) h.update(out.type === 'asset' ? out.source : out.code);
        else if (f !== './') h.update(readFileSync(join('public', f)));
      }
      const version = h.digest('hex').slice(0, 12);
      // #120: the save format this build can read, baked in so the WAITING worker can be asked for it.
      // The old page is the one that has to decide whether to promise a run will survive an update,
      // and it cannot know what the new build does to a save -- but the new build's worker ships in
      // the same commit as its `game-save.js`, so asking that worker is asking the new build.
      //
      // Read out of the source rather than imported: this plugin runs in Vite's Node context and
      // `game-save.js` pulls in three.js through `models.js`. It throws rather than baking a blank,
      // because a silently absent save version turns the row's reassurance into a guess -- which is
      // the one thing #120 says it must never be.
      const saveSrc = readFileSync(join('src', 'game-save.js'), 'utf8');
      const saveVer = /^const VERSION = (\d+);$/m.exec(saveSrc);
      if (!saveVer) throw new Error('service-worker: could not read VERSION out of src/game-save.js');
      const sw = SERVICE_WORKER
        .replace('__VERSION__', version)
        .replace('__SAVE_VERSION__', saveVer[1])
        .replace('__FILES__', JSON.stringify(files, null, 2));
      writeFileSync(join(options.dir, 'sw.js'), sw);
      console.log(`  service worker: ${files.length} files precached, cache crownrush-${version}, save v${saveVer[1]}`);
    },
  };
}

const SERVICE_WORKER = `// Generated by vite.config.js at build time. Do not edit; edit the template there.
const CACHE = 'crownrush-__VERSION__';
// #120: what \`game-save.js\` in THIS build sets VERSION to. A waiting worker is asked for it by the
// page it is waiting to replace, which is how that page can tell whether installing keeps the run.
const SAVE_VERSION = __SAVE_VERSION__;
const FILES = __FILES__;

// Cache lookups ignore Vary. Without this the game loads its shell offline and then fails to fetch
// its own bundle: a server that answers with "Vary: Accept-Encoding" makes the browser compare the
// headers of the request that filled the cache against the headers of the one asking for it, and a
// module script does not ask the way the install-time fetch did, so the entry is there and never
// matches. Everything here is static and content-addressed, so there is nothing for Vary to protect.
const HIT = { ignoreVary: true };

// Take everything at once. The game is about two megabytes and is no use with pieces missing.
// \`cache: 'reload'\` keeps the browser's own HTTP cache out of it, so a deploy cannot precache the
// version it happens to be holding from the last one.
//
// #84: it installs and then WAITS. \`skipWaiting()\` used to be on the end of that chain, so a new
// worker took over a page that was already running, and the activate handler below deletes every
// cache that is not its own.
//
// Nothing breaks from that today, and it is worth being exact about why: registerServiceWorker is
// called only after the last model has been fetched, so a run holds everything it needs in memory
// and asks the cache for nothing. That is the current load order rather than a promise -- the first
// thing this game fetches lazily would be looking in a cache that had just been emptied, from a page
// still running the build that expected it.
//
// The reason it changed now is the other half: a worker that swaps itself in cannot be offered,
// declined, or saved before. The page asks for the handover when it is ready to reload instead.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))),
  );
});

// #84: the two things the page needs to be able to ask. SKIP_WAITING is "I have saved what I can and
// I am about to reload, take over"; VERSION is which build is actually answering, which is the only
// way anybody can tell two of them apart from inside a game with no version number on screen.
//
// #120 adds a third. SAVE_VERSION is asked of a WAITING worker rather than the controlling one -- a
// worker in \`waiting\` still receives messages, and it is the only part of a build that the page it
// is about to replace can talk to before it replaces it. Answered together with the cache name so one
// reply covers both, and the page can tell a stale worker that only knows about VERSION apart from a
// build that has no save version at all.
self.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data.type === 'VERSION' && e.ports && e.ports[0]) e.ports[0].postMessage(CACHE);
  if (e.data.type === 'BUILD' && e.ports && e.ports[0]) e.ports[0].postMessage({ cache: CACHE, save: SAVE_VERSION });
});

// A new build means a new cache name, so every older one is rubbish and goes. This is what keeps the
// unhashed files under public/ — the character models above all — from being pinned forever.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // The page itself goes to the network first, so a deploy is picked up the next time the game is
  // opened with a connection, and falls back to the cached copy when there is none. Everything else
  // is content-addressed or version-cached, so the copy in hand is the right one.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./', HIT).then((hit) => hit || caches.match(request, HIT))),
    );
    return;
  }

  e.respondWith(
    caches.match(request, HIT).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
      }
      return res;
    })),
  );
});
`;

export default defineConfig({
  base: './',
  server: { port: 5173 },
  plugins: [shotPlugin(), devThreeLibsPlugin(), serviceWorkerPlugin()],
});
