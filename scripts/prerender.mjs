// Post-build prerender step for the public marketing routes.
//
// Runs after `vite build` (see package.json "build" script). It:
//   1. Renders the listed public page component(s) to static HTML via
//      react-dom/server, so crawlers get real content + metadata without
//      executing JS (Vite/React alone only ship an empty <div id="root">).
//   2. Duplicates the original (empty-shell) dist/index.html as dist/app.html
//      — the SPA fallback target for every other (authenticated) app route —
//      then overwrites dist/index.html per public route with its prerendered
//      HTML + page-specific title/description/canonical/OG tags.
//
// public/.htaccess serves dist/index.html directly for "/" (it's a real
// file) and rewrites every other non-file request to dist/app.html, so the
// authenticated app is completely unaffected by this step.
import esbuild from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { readAppRoutes, buildNoindexRule, buildRewriteRules } from './app-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
// The domain the public/static files (robots.txt, sitemap.xml) are written
// with in public/ — rewritten below to SITE_ORIGIN at build time.
const SOURCE_ORIGIN = 'https://shippeco.com';
// Resolved in main() from VITE_PUBLIC_SITE_ORIGIN (same variable the app's
// src/config/publicSite.ts reads), defaulting to the currently-live domain.
let SITE_ORIGIN = SOURCE_ORIGIN;
let OG_IMAGE = `${SITE_ORIGIN}/og-image.jpg`;

/** Minimal .env reader (KEY=value lines, '#' comments) — this script is a
 *  plain Node process, not Vite, so it doesn't get Vite's own .env loading
 *  or import.meta.env for free. Only used to fill the esbuild `define`
 *  below so any prerendered component that reads import.meta.env.VITE_*
 *  (directly, or transitively via src/utils/env.ts) sees the same values
 *  the real client build would, instead of crashing on `undefined`. */
async function loadDotEnv() {
  const vars = {};
  const raw = await fs.readFile(path.join(ROOT, '.env'), 'utf-8').catch(() => '');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  // Real environment variables win over .env (same precedence as Vite) —
  // this is how CI (GitHub Actions secrets/vars) passes them in.
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('VITE_') && value !== undefined) vars[key] = value;
  }
  return vars;
}

/** robots.txt / sitemap.xml are static files in public/ written against
 *  SOURCE_ORIGIN; rewrite them in dist/ to the configured SITE_ORIGIN so
 *  switching domains is a single env-var change, not a hunt for strings. */
async function rewriteStaticOrigin() {
  if (SITE_ORIGIN === SOURCE_ORIGIN) return;
  for (const file of ['robots.txt', 'sitemap.xml']) {
    const p = path.join(DIST, file);
    const raw = await fs.readFile(p, 'utf-8').catch(() => null);
    if (raw) await fs.writeFile(p, raw.split(SOURCE_ORIGIN).join(SITE_ORIGIN), 'utf-8');
  }
}

const ROUTES = [
  {
    urlPath: '/',
    outFile: path.join(DIST, 'index.html'),
    entry: path.join(ROOT, 'src/pages/PublicHomePage.tsx'),
    exportName: 'PublicHomePage',
    title: 'شيب بيك للخدمات اللوجستية | شحن محلي ودولي وتغليف وتخزين',
    description:
      'شيب بيك (SHIPPEC): حلول الشحن المحلي والدولي، والتغليف والتخزين والتوزيع والتخليص الجمركي للأفراد والشركات. ابدأ شحنتك أو اطلب تواصل فريقنا.',
    robots: 'index, follow',
  },
  {
    // Served by the host's ErrorDocument with a real HTTP 404 for unknown
    // URLs (see public/.htaccess). No canonical/OG tags: it must never
    // claim to be the homepage, and it's not in the sitemap.
    urlPath: null,
    outFile: path.join(DIST, '404.html'),
    entry: path.join(ROOT, 'src/pages/NotFoundPage.tsx'),
    exportName: 'NotFoundPage',
    title: 'الصفحة غير موجودة | SHIPPEC',
    description: 'الرابط المطلوب غير موجود على موقع شيب بيك.',
    robots: 'noindex, nofollow',
    socialTags: false,
  },
];

async function loadViteManifest() {
  const manifestPath = path.join(DIST, '.vite', 'manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf-8').catch(() => null);
  if (!raw) {
    throw new Error(
      `Vite manifest not found at ${manifestPath} — is "build.manifest: true" set in vite.config.ts?`
    );
  }
  return JSON.parse(raw);
}

/** esbuild plugin: resolves image imports (e.g. the logo) to the exact
 *  hashed URL Vite already emitted for that asset, using the build manifest,
 *  instead of trying to re-process the asset ourselves. */
function viteAssetUrlsPlugin(manifest) {
  const bySource = new Map();
  for (const [key, entry] of Object.entries(manifest)) {
    if (entry.file) bySource.set(path.resolve(ROOT, key), `/${entry.file}`);
  }

  return {
    name: 'vite-asset-urls',
    setup(build) {
      build.onResolve({ filter: /\.(png|jpe?g|svg|gif|webp)$/i }, (args) => {
        const resolved = path.resolve(args.resolveDir, args.path);
        return { path: resolved, namespace: 'vite-asset-url' };
      });
      build.onLoad({ filter: /.*/, namespace: 'vite-asset-url' }, (args) => {
        const url = bySource.get(args.path);
        if (!url) {
          throw new Error(
            `No built asset found for "${args.path}" in the Vite manifest — was it actually imported anywhere that vite build could see?`
          );
        }
        return { contents: `export default ${JSON.stringify(url)};`, loader: 'js' };
      });
    },
  };
}

async function renderRouteMarkup(route, manifest, envVars) {
  const result = await esbuild.build({
    entryPoints: [route.entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    // Never bundle React itself: components that use hooks (useState, etc.)
    // must resolve to the EXACT SAME react module instance that
    // react-dom/server uses below to actually run the render, or hooks
    // break with "Invalid hook call" / null dispatcher errors. Left as
    // real imports here, resolved by Node's own module resolution instead
    // — see the tmpFile location comment just below for why that requires
    // writing the bundle inside node_modules/.
    external: ['react', 'react-dom', 'react-dom/*'],
    plugins: [viteAssetUrlsPlugin(manifest)],
    loader: { '.css': 'empty' },
    define: {
      'import.meta.env': JSON.stringify({ MODE: 'production', PROD: true, DEV: false, ...envVars }),
    },
  });

  const code = result.outputFiles[0].text;
  // Written under node_modules/ (not the OS temp dir) so that the `import
  // 'react'` left in place by the `external` option above resolves, via
  // Node's normal upward node_modules search, to this project's own
  // installed React — the same instance prerender.mjs itself imports.
  const tmpDir = path.join(ROOT, 'node_modules', '.shippeco-prerender-tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  await fs.writeFile(tmpFile, code, 'utf-8');
  try {
    const mod = await import(pathToFileURL(tmpFile).href);
    const Component = mod[route.exportName] ?? mod.default;
    if (!Component) {
      throw new Error(`Module for ${route.entry} has no export "${route.exportName}" or default export.`);
    }
    return renderToStaticMarkup(React.createElement(Component));
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

function buildHtmlForRoute(templateHtml, route, markup) {
  let html = templateHtml;

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(route.title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/>/,
    `<meta name="description" content="${escapeHtml(route.description)}" />`
  );
  html = html.replace(
    /<meta name="robots" content="[^"]*"\s*\/>/,
    `<meta name="robots" content="${route.robots}" />`
  );

  html = html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
  if (route.socialTags === false) return html;

  const canonicalUrl = `${SITE_ORIGIN}${route.urlPath}`;
  const extraTags = [
    `<link rel="canonical" href="${canonicalUrl}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="شيب بيك" />`,
    `<meta property="og:locale" content="ar_EG" />`,
    `<meta property="og:title" content="${escapeHtml(route.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(route.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(route.description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ].join('\n    ');
  html = html.replace('</head>', `    ${extraTags}\n  </head>`);

  return html;
}

/** Fills the two marked blocks of dist/.htaccess from src/App.tsx's routes
 *  (see scripts/app-routes.mjs). Fails the build if a marker is missing,
 *  rather than deploying rules that would 404 the whole app. */
async function writeHostingRules() {
  const htaccessPath = path.join(DIST, '.htaccess');
  const src = await fs.readFile(htaccessPath, 'utf-8');
  const routes = readAppRoutes(ROOT);
  const markers = [
    [/^[ \t]*# @@NOINDEX_RULE@@[ \t]*$/m, buildNoindexRule(routes)],
    [/^[ \t]*# @@APP_ROUTE_RULES@@[ \t]*$/m, buildRewriteRules(routes)],
  ];
  let out = src;
  for (const [re, replacement] of markers) {
    if (!re.test(out)) throw new Error(`dist/.htaccess is missing marker ${re} — cannot generate hosting rules.`);
    out = out.replace(re, replacement);
  }
  await fs.writeFile(htaccessPath, out, 'utf-8');
  console.log(`✅ Hosting rules: ${routes.length} SPA routes -> app.html, everything else -> 404.html (HTTP 404)`);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function main() {
  const templateHtml = await fs.readFile(path.join(DIST, 'index.html'), 'utf-8');

  // The plain, un-prerendered shell becomes the SPA fallback target for
  // every authenticated app route (see public/.htaccess).
  await fs.writeFile(path.join(DIST, 'app.html'), templateHtml, 'utf-8');

  const manifest = await loadViteManifest();
  const envVars = await loadDotEnv();
  SITE_ORIGIN = (envVars.VITE_PUBLIC_SITE_ORIGIN || SOURCE_ORIGIN).replace(/\/+$/, '');
  OG_IMAGE = `${SITE_ORIGIN}/og-image.jpg`;
  await rewriteStaticOrigin();
  await writeHostingRules();

  for (const route of ROUTES) {
    const markup = await renderRouteMarkup(route, manifest, envVars);
    const html = buildHtmlForRoute(templateHtml, route, markup);
    await fs.mkdir(path.dirname(route.outFile), { recursive: true });
    await fs.writeFile(route.outFile, html, 'utf-8');
    console.log(`✅ Prerendered ${route.urlPath ?? '(404 page)'} -> ${path.relative(ROOT, route.outFile)}`);
  }
}

main().catch((err) => {
  console.error('Prerender failed:', err);
  process.exit(1);
});
