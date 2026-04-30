// One-off PWA icon generator. Run with:
//   node scripts/generate-icons.mjs
//
// Reads public/icon.svg and writes:
//   public/icon-192.png        (192x192, rounded)
//   public/icon-512.png        (512x512, rounded, manifest "any maskable")
//   public/apple-touch-icon.png (180x180, square — iOS applies its own mask)
//
// Sharp is already a transitive dep of Next.js, so no extra install needed.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const targets = [
  { filename: "icon-192.png", size: 192, squareCorners: false },
  { filename: "icon-512.png", size: 512, squareCorners: false },
  { filename: "apple-touch-icon.png", size: 180, squareCorners: true },
];

async function main() {
  const svgPath = path.join(root, "public", "icon.svg");
  const svg = await readFile(svgPath, "utf8");

  for (const t of targets) {
    const source = t.squareCorners
      ? svg.replace(/rx="\d+"/, 'rx="0"')
      : svg;
    const outPath = path.join(root, "public", t.filename);
    await sharp(Buffer.from(source))
      .resize(t.size, t.size)
      .png()
      .toFile(outPath);
    console.log(`✓ public/${t.filename} (${t.size}x${t.size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
