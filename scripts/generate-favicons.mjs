// Generates favicon.ico, favicon-96x96.png and apple-touch-icon.png from the
// brand wordmark (src/assets/shippec.jpeg).
//
// The source is a wide wordmark (Arabic + "SHIPPEC"), not a square mark, so
// per the task requirement we do NOT crop or distort it to fit a square —
// instead we letterbox it onto a white square canvas (matching the logo's
// own white background) with a small margin, then downscale that square
// master to every needed size.
//
// Re-run with: npm run gen:favicons (after replacing src/assets/shippec.jpeg)
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'src/assets/shippec.jpeg');
const OUT_DIR = path.join(ROOT, 'public');

const MASTER_SIZE = 1024;
const PADDING_RATIO = 0.14; // margin on each side, as a fraction of the canvas
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 }; // matches the logo's own white background

async function buildSquareMaster() {
  const contentSize = Math.round(MASTER_SIZE * (1 - PADDING_RATIO * 2));

  const logo = await sharp(SOURCE)
    .resize(contentSize, contentSize, { fit: 'contain', background: BACKGROUND })
    .toBuffer();

  return sharp({
    create: {
      width: MASTER_SIZE,
      height: MASTER_SIZE,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const master = await buildSquareMaster();

  const png96 = await sharp(master).resize(96, 96).png().toBuffer();
  await fs.writeFile(path.join(OUT_DIR, 'favicon-96x96.png'), png96);

  const appleTouch = await sharp(master)
    // Apple touch icons don't composite well over transparency (iOS adds its
    // own rounded mask + background), so flatten explicitly onto white.
    .flatten({ background: BACKGROUND })
    .resize(180, 180)
    .png()
    .toBuffer();
  await fs.writeFile(path.join(OUT_DIR, 'apple-touch-icon.png'), appleTouch);

  const icoSizes = [16, 32, 48];
  const icoBuffers = await Promise.all(
    icoSizes.map((size) => sharp(master).resize(size, size).png().toBuffer())
  );
  const ico = await pngToIco(icoBuffers);
  await fs.writeFile(path.join(OUT_DIR, 'favicon.ico'), ico);

  // Open Graph / Twitter share image (1200x630) — logo centered on the same
  // brand indigo used across the app's primary buttons/accents.
  const OG_W = 1200;
  const OG_H = 630;
  const ogLogo = await sharp(SOURCE)
    .resize(900, 420, { fit: 'contain', background: { r: 79, g: 70, b: 229, alpha: 1 } })
    .toBuffer();
  const ogImage = await sharp({
    create: { width: OG_W, height: OG_H, channels: 4, background: { r: 79, g: 70, b: 229, alpha: 1 } },
  })
    .composite([{ input: ogLogo, gravity: 'center' }])
    .flatten({ background: { r: 79, g: 70, b: 229 } })
    .jpeg({ quality: 90 })
    .toBuffer();
  await fs.writeFile(path.join(OUT_DIR, 'og-image.jpg'), ogImage);

  console.log('✅ Generated public/favicon.ico, favicon-96x96.png, apple-touch-icon.png, og-image.jpg');
}

main().catch((err) => {
  console.error('Favicon generation failed:', err);
  process.exit(1);
});
