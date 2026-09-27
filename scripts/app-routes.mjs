// Single source of truth for which URL paths are real SPA routes, derived
// from the <Route path="..."> declarations in src/App.tsx. Used to:
//   - generate the Apache/LiteSpeed rewrite rules in dist/.htaccess
//     (scripts/prerender.mjs), so a known route is served app.html (200)
//     and anything else gets a genuine HTTP 404 with dist/404.html;
//   - emulate the same rules in scripts/preview-static.mjs.
// Adding a <Route path="/something"> to App.tsx is therefore enough — the
// hosting rules follow automatically on the next build.
import fs from 'node:fs';
import path from 'node:path';

/** Returns route paths as written in App.tsx, excluding "/" (served by the
 *  prerendered index.html) and the "*" catch-all. */
export function extractAppRoutes(appTsxSource) {
  const paths = new Set();
  for (const m of appTsxSource.matchAll(/<Route\b[^>]*?\bpath=["']([^"']+)["']/g)) {
    const p = m[1].trim();
    if (p === '*' || p === '/') continue;
    paths.add(p);
  }
  return [...paths].sort();
}

export function readAppRoutes(rootDir) {
  const src = fs.readFileSync(path.join(rootDir, 'src', 'App.tsx'), 'utf-8');
  const routes = extractAppRoutes(src);
  if (routes.length < 5) {
    // Fail loudly rather than ship hosting rules that 404 the whole app.
    throw new Error(`Only found ${routes.length} routes in src/App.tsx — refusing to generate hosting rules.`);
  }
  return routes;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Converts a React Router path ("/pay/:id") to an anchored regex source
 *  without the leading slash, matching an optional trailing slash:
 *  "^pay/[^/]+/?$". Dynamic segments match exactly one path segment. */
export function routeToPattern(routePath) {
  const segments = routePath.replace(/^\/+|\/+$/g, '').split('/');
  const body = segments.map((seg) => (seg.startsWith(':') ? '[^/]+' : escapeRe(seg))).join('/');
  return `^${body}/?$`;
}

/** Same rules as the generated .htaccess, for tooling/tests. */
export function makeRouteMatcher(routes) {
  const res = routes.map((r) => new RegExp(routeToPattern(r)));
  return (urlPath) => {
    const p = urlPath.replace(/^\/+/, '');
    return res.some((re) => re.test(p));
  };
}

/** Every SPA route is part of the private/app side of the site (the only
 *  public page, "/", is excluded from `routes`), so all of them are tagged
 *  noindex for the X-Robots-Tag header. */
export function buildNoindexRule(routes) {
  const firstSegments = [...new Set(routes.map((r) => r.replace(/^\/+/, '').split('/')[0]))].sort();
  return [
    '  # --- generated from src/App.tsx ---',
    `  RewriteCond %{REQUEST_URI} ^/(${firstSegments.map(escapeRe).join('|')})(/|$) [NC]`,
    '  RewriteRule ^ - [E=SHIPPECO_NOINDEX:1]',
  ].join('\n');
}

export function buildRewriteRules(routes) {
  const lines = [
    '  # --- generated from src/App.tsx by scripts/prerender.mjs; do not edit in dist/ ---',
  ];
  for (const r of routes) lines.push(`  RewriteRule ${routeToPattern(r)} app.html [L]`);
  lines.push('  # --- end generated ---');
  return lines.join('\n');
}
