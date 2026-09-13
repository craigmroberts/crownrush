import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';

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

export default defineConfig({
  base: './',
  server: { port: 5173 },
  plugins: [shotPlugin()],
});
