// Generates responsive WebP variants of the real marketing photos used on
// the public homepage (Frontend/src/pages/PublicHomePage.tsx), from the
// originals in src/assets/. Originals are left untouched — only new files
// are added under src/assets/landing/, so they flow through Vite's normal
// asset pipeline (hashed, copied into dist/) exactly like the logo already
// does, and scripts/prerender.mjs resolves their built URLs the same way.
//
// No cropping: every source image here is the same 1672x941 (~16:9) frame,
// and every output keeps that exact aspect ratio — only downscaled, never
// cut — so the logo/people/packages in the originals are never trimmed.
//
// Re-run with: npm run optimize:landing-images (after replacing a source image)
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src/assets');
const OUT_DIR = path.join(ROOT, 'src/assets/landing');

// [source file, output base name] — hero1.png ("احتياطية فقط") and hero.png
// (old template art) are deliberately excluded; only the four images the
// brief assigns to a real section are processed.
const IMAGES = [
  ['hero2.png', 'hero-shipment'],
  ['image 1.png', 'customer-delivery'],
  ['image 2.png', 'packing-preparation'],
  ['image 3.png', 'van-warehouse'],
];

// Mobile width covers a 2x-DPR ~400px-wide slot; desktop covers a 2x-DPR
// ~700px-wide slot (the largest this design ever shows an image at, the
// hero, uses roughly half the viewport on desktop).
const WIDTHS = { mobile: 800, desktop: 1400 };

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  for (const [source, base] of IMAGES) {
    const input = sharp(path.join(SRC_DIR, source));
    for (const [tag, width] of Object.entries(WIDTHS)) {
      const outFile = path.join(OUT_DIR, `${base}-${tag}.webp`);
      await input
        .clone()
        .resize({ width, withoutEnlargement: true }) // never upscale, never crop
        .webp({ quality: 82 })
        .toFile(outFile);
      const { size } = await fs.stat(outFile);
      console.log(`✅ ${base}-${tag}.webp (${width}px wide, ${(size / 1024).toFixed(0)} KB)`);
    }
  }
}

main().catch((err) => {
  console.error('Landing image optimization failed:', err);
  process.exit(1);
});
