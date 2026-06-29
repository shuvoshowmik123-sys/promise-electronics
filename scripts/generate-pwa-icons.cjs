const sharp = require('sharp');
const path = require('path');

const LOGO_SRC = path.resolve(__dirname, '../client/public/logo-mark-white.png');
const OUT_DIR = path.resolve(__dirname, '../client/public/icons');

const PORTALS = [
  {
    name: 'customer',
    // Sky/teal gradient feel — solid #0ea5e9
    bg: { r: 14, g: 165, b: 233 },
  },
  {
    name: 'admin',
    // Dark navy — #0f172a
    bg: { r: 15, g: 23, b: 42 },
  },
  {
    name: 'corporate',
    // Blue — #1e40af
    bg: { r: 30, g: 64, b: 175 },
  },
];

const SIZES = [192, 512];

async function generateIcon(portal, size, maskable) {
  const bg = portal.bg;
  const suffix = maskable ? '-maskable' : '';
  const filename = `${portal.name}${suffix}-${size}.png`;

  // For maskable: logo occupies ~60% of canvas (safe zone is 80% circle)
  // For regular: logo occupies ~75% of canvas with small padding
  const logoScale = maskable ? 0.55 : 0.72;
  const logoSize = Math.round(size * logoScale);
  const offset = Math.round((size - logoSize) / 2);

  const resizedLogo = await sharp(LOGO_SRC)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Create colored background with rounded corners for regular, square for maskable
  let background;
  if (maskable) {
    // Maskable: full square, OS applies its own mask
    background = sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { ...bg, alpha: 255 },
      },
    }).png();
  } else {
    // Regular: rounded rect via SVG overlay
    const radius = Math.round(size * 0.18);
    const svg = `<svg width="${size}" height="${size}">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="rgb(${bg.r},${bg.g},${bg.b})" />
    </svg>`;
    background = sharp(Buffer.from(svg)).png();
  }

  const bgBuffer = await background.toBuffer();

  await sharp(bgBuffer)
    .composite([{ input: resizedLogo, left: offset, top: offset }])
    .png({ quality: 90 })
    .toFile(path.join(OUT_DIR, filename));

  console.log(`  Created: ${filename}`);
}

async function main() {
  console.log('Generating PWA icons...');
  console.log(`Logo source: ${LOGO_SRC}`);
  console.log(`Output dir: ${OUT_DIR}\n`);

  for (const portal of PORTALS) {
    console.log(`Portal: ${portal.name}`);
    for (const size of SIZES) {
      await generateIcon(portal, size, false);   // regular
      await generateIcon(portal, size, true);    // maskable
    }
    console.log('');
  }

  console.log('Done! 12 icons generated.');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
