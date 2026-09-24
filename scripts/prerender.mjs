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
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE_ORIGIN = 'https://shippeco.com';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.jpg`;

const ROUTES = [
  {
    urlPath: '/',
    outFile: path.join(DIST, 'index.html'),
    entry: path.join(ROOT, 'src/pages/PublicHomePage.tsx'),
    exportName: 'PublicHomePage',
    title: 'شيب بيك — منصة إدارة الشحن والفواتير بين مصر والسعودية',
    description:
      'شيب بيك: منصة لإدارة فواتير الشحن، حساب تكلفة شحن DHL، مطابقة الفواتير، وتحصيل المستحقات لأنشطة الشحن بين مصر والسعودية.',
    robots: 'index, follow',
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

async function renderRouteMarkup(route, manifest) {
  const result = await esbuild.build({
    entryPoints: [route.entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    plugins: [viteAssetUrlsPlugin(manifest)],
    loader: { '.css': 'empty' },
  });

  const code = result.outputFiles[0].text;
  const tmpFile = path.join(os.tmpdir(), `shippeco-prerender-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
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

  html = html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);

  return html;
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

  for (const route of ROUTES) {
    const markup = await renderRouteMarkup(route, manifest);
    const html = buildHtmlForRoute(templateHtml, route, markup);
    await fs.mkdir(path.dirname(route.outFile), { recursive: true });
    await fs.writeFile(route.outFile, html, 'utf-8');
    console.log(`✅ Prerendered ${route.urlPath} -> ${path.relative(ROOT, route.outFile)}`);
  }
}

main().catch((err) => {
  console.error('Prerender failed:', err);
  process.exit(1);
});
