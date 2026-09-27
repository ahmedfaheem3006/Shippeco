// Mimics the production hosting rules in public/.htaccess so they can be
// checked locally (`vite preview` knows nothing about this project's
// index.html / app.html / 404.html split):
//   - real files are served as-is (missing ones are 404, never HTML with 200);
//   - "/" serves the prerendered index.html;
//   - known SPA routes (from src/App.tsx, same generator as the .htaccess)
//     serve app.html with 200;
//   - anything else serves 404.html with a real 404 status, URL unchanged.
// It's an emulation of the generated rules, not Apache/LiteSpeed itself.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAppRoutes, makeRouteMatcher } from './app-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = process.env.PORT ? Number(process.env.PORT) : 4174;

const routes = readAppRoutes(ROOT);
const isAppRoute = makeRouteMatcher(routes);
const noindexPrefixes = [...new Set(routes.map((r) => r.replace(/^\/+/, '').split('/')[0]))];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.xml': 'application/xml',
  '.txt': 'text/plain', '.woff2': 'font/woff2',
};

function isNoindexPath(urlPath) {
  return noindexPrefixes.some((p) => urlPath === `/${p}` || urlPath.startsWith(`/${p}/`));
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const asFile = path.join(DIST, urlPath);
  const inDist = asFile.startsWith(DIST);

  let target;
  let status = 200;
  if (urlPath === '/') {
    target = path.join(DIST, 'index.html');
  } else if (inDist && fs.existsSync(asFile) && fs.statSync(asFile).isFile()) {
    target = asFile;
  } else if (isAppRoute(urlPath)) {
    target = path.join(DIST, 'app.html');
  } else {
    target = path.join(DIST, '404.html');
    status = 404;
  }

  res.statusCode = status;
  res.setHeader('Content-Type', MIME[path.extname(target)] || 'application/octet-stream');
  if (isNoindexPath(urlPath)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  fs.createReadStream(target).pipe(res);
});

server.listen(PORT, () => {
  const actualPort = server.address().port;
  console.log(`Static preview (hosting-rule emulation, ${routes.length} SPA routes) on http://localhost:${actualPort}`);
});
