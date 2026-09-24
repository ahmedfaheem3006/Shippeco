# SEO — what was done, and what's left to activate

## What ships in the build

- `/` is a real, prerendered public marketing page (see
  `src/pages/PublicHomePage.tsx`, built by `scripts/prerender.mjs`) — the
  HTML Google receives already contains the title, headings, service
  descriptions and contact info, no JavaScript execution required.
- Unique `<title>`/meta description/canonical/Open Graph/Twitter Card tags
  per public page (currently just `/` — see `ROUTES` in
  `scripts/prerender.mjs` to add more later).
- `Organization` + `WebSite` JSON-LD structured data on the homepage, using
  only facts already present elsewhere in this codebase (company name,
  `info@shippec.com`, service area) — nothing invented.
- `public/robots.txt` + `public/sitemap.xml`, listing only `/` — every
  authenticated app route (`/login`, `/dashboard`, `/invoices`, `/pay/:id`,
  etc.) is excluded from indexing via an `X-Robots-Tag: noindex` HTTP
  header + `<meta name="robots" content="noindex">`, not via
  `robots.txt Disallow` (a Disallow would stop Google from ever seeing the
  noindex signal at all — see `public/.htaccess` for the exact rule).
- Real favicons (`favicon.ico`, `favicon-96x96.png`, `apple-touch-icon.png`)
  generated from `src/assets/shippec.jpeg` via `npm run gen:favicons` (see
  `scripts/generate-favicons.mjs`), plus a proper 1200×630 `og-image.jpg`
  share image.
- Route-level code splitting (`React.lazy` in `src/App.tsx`) so the
  homepage's JS payload doesn't include the entire authenticated app.

Measured results (real Lighthouse run against the built, prerendered
homepage via `npm run preview:static` — see the final report for the full
before/after numbers): **SEO 100, Best Practices 100, Accessibility 100,
Performance 80.**

## Activation steps (do these after deploying)

These are dashboard actions on Google's side — nothing in this repo can do
them, and nothing here can guarantee a ranking outcome.

1. **Google Search Console**: <https://search.google.com/search-console>
   → Add property → enter `https://shippeco.com`.
2. **Verify ownership**. Easiest given this is a single static site on
   Hostinger: the **HTML tag** method — GSC gives you a
   `<meta name="google-site-verification" content="...">` tag; add it to
   `Frontend/index.html`'s `<head>` (it'll then appear on every page,
   including the app shell, which is fine) and redeploy. Alternatively use
   the **HTML file upload** method if you'd rather not touch the repo:
   drop the file GSC gives you into `Frontend/public/`, redeploy, confirm
   it's reachable at `https://shippeco.com/<file>.html`, then verify.
3. **Submit the sitemap**: in GSC, Sitemaps → enter `sitemap.xml` → Submit.
   It's served at `https://shippeco.com/sitemap.xml` once deployed.
4. **Request indexing** for `/` directly: URL Inspection → paste
   `https://shippeco.com/` → Request Indexing. This nudges Google to crawl
   it sooner than it might on its own; it does not guarantee when or
   whether it appears in results.
5. Re-check back in GSC after a few days: **Coverage** should show `/` as
   indexed, and **Enhancements → Sitemaps** should show it as read
   successfully with 1 URL submitted/indexed.

## If more public pages get added later

Add the route's metadata to `ROUTES` in `Frontend/scripts/prerender.mjs`
(title/description/robots), add a `<url>` entry to
`Frontend/public/sitemap.xml`, and make sure the route sits **outside**
the `RequireAuth` group in `src/App.tsx` (or it'll never be reachable
without logging in, and the `X-Robots-Tag` rule in `.htaccess` would need
its path prefix removed from the noindex list too).

Deliberately not done in this pass: separate pages per city/country
(e.g. "شحن من مصر للسعودية", "شحن القاهرة"...). The task explicitly asked
not to create thin/duplicate pages just to target place names — there
isn't yet enough real, page-specific content (pricing, coverage detail,
process differences) to justify more than the one homepage without
resorting to filler text.
