// Mimics public/.htaccess's routing logic (real files served as-is, "/"
// serves index.html, everything else falls back to app.html) so the
// production Hostinger topology can be sanity-checked locally — `vite
// preview` doesn't know about this project's two-HTML-file setup.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = process.env.PORT ? Number(process.env.PORT) : 4174;

const NOINDEX_PREFIXES = [
  'login', 'dashboard', 'invoices', 'new-invoice', 'reports', 'clients',
  'collection-model', 'expenses', 'calculator', 'reconcile', 'invoice-template',
  'paymob-links', 'settings', 'profit-report', 'audit-log', 'wa-templates', 'tasks', 'quote-requests', 'pay',
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain',
};

function isNoindexPath(urlPath) {
  return NOINDEX_PREFIXES.some((p) => urlPath === `/${p}` || urlPath.startsWith(`/${p}/`));
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const asFile = path.join(DIST, urlPath);

  let target;
  if (urlPath !== '/' && fs.existsSync(asFile) && fs.statSync(asFile).isFile()) {
    target = asFile;
  } else if (urlPath === '/') {
    target = path.join(DIST, 'index.html');
  } else {
    target = path.join(DIST, 'app.html');
  }

  const ext = path.extname(target);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  if (isNoindexPath(urlPath)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  fs.createReadStream(target).pipe(res);
});

server.listen(PORT, () => {
  const actualPort = server.address().port;
  console.log(`Static preview (Hostinger-like routing) on http://localhost:${actualPort}`);
});
