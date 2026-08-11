/**
 * Generates the edge-snap feather strip asset (feather-strip.webp).
 *
 * Realistic white feather with a tapered shaft, fine barb texture along both
 * vanes, and a soft glow (gradient + blur halo). Rendered through sharp into a
 * 6-frame horizontal strip that plays as a gentle swaying animation, anchored
 * at the quill base.
 *
 * Run: node scripts/generate-feather-assets.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "assets", "feather-strip.webp");

const FRAME_W = 28;
const FRAME_H = 100;
const FRAMES = 6;

function featherSvg(angleDeg, swayY) {
  const cx = FRAME_W / 2;
  const rootY = FRAME_H - 6;
  // Left vane with barb notches along the outer edge; right vane mirrored.
  const leftVane = [
    `M ${cx - 0.5} 6`,
    `C ${cx - 3.5} 12, ${cx - 6} 20, ${cx - 7.5} 28`,
    `L ${cx - 10} 32 L ${cx - 7} 36`,
    `L ${cx - 10.5} 43 L ${cx - 7} 47`,
    `L ${cx - 9.5} 55 L ${cx - 6} 59`,
    `L ${cx - 8} 67 L ${cx - 5} 71`,
    `L ${cx - 6.5} 78 L ${cx - 3.5} 82`,
    `C ${cx - 2.5} 87, ${cx - 1.5} 90, ${cx - 0.5} 92`,
    `L ${cx - 0.5} 6 Z`,
  ].join(" ");
  const rightVane = [
    `M ${cx + 0.5} 6`,
    `C ${cx + 3.5} 12, ${cx + 6} 20, ${cx + 7.5} 28`,
    `L ${cx + 10} 32 L ${cx + 7} 36`,
    `L ${cx + 10.5} 43 L ${cx + 7} 47`,
    `L ${cx + 9.5} 55 L ${cx + 6} 59`,
    `L ${cx + 8} 67 L ${cx + 5} 71`,
    `L ${cx + 6.5} 78 L ${cx + 3.5} 82`,
    `C ${cx + 2.5} 87, ${cx + 1.5} 90, ${cx + 0.5} 92`,
    `L ${cx + 0.5} 6 Z`,
  ].join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W}" height="${FRAME_H}" viewBox="0 0 ${FRAME_W} ${FRAME_H}">
  <defs>
    <linearGradient id="vane" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.98"/>
      <stop offset="0.55" stop-color="#f7f9fd" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#e9edf6" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="shaft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#d9dfec" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="glow" x="-80%" y="-60%" width="260%" height="220%">
      <feGaussianBlur stdDeviation="1.6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <g transform="translate(${cx} ${rootY}) rotate(${angleDeg}) translate(${-cx} ${-rootY + swayY})">
    <g filter="url(#glow)" opacity="0.5">
      <path d="${leftVane} ${rightVane}" fill="#dfe6ff"/>
    </g>
    <path d="${leftVane}" fill="url(#vane)" stroke="#c6cede" stroke-width="0.35" stroke-linejoin="round"/>
    <path d="${rightVane}" fill="url(#vane)" stroke="#c6cede" stroke-width="0.35" stroke-linejoin="round"/>
    <path d="M ${cx - 0.5} ${rootY - 4} L ${cx - 0.5} 8" stroke="url(#shaft)" stroke-width="1.5" stroke-linecap="round"/>
    <ellipse cx="${cx}" cy="${rootY - 4}" rx="4.2" ry="2.4" fill="#fffdf5" stroke="#c6cede" stroke-width="0.4" stroke-opacity="0.6"/>
    <path d="M ${cx - 0.5} ${rootY - 4} L ${cx - 0.5} ${rootY - 12}" stroke="#f2e8d8" stroke-width="0.8" stroke-linecap="round" opacity="0.7"/>
  </g>
</svg>`;
}

const angles = [-6, -2, 2, 6, 2, -2];
const sways = [-1, 0, 1, 2, 1, 0];

const frameBuffers = await Promise.all(
  angles.map((angle, i) => sharp(Buffer.from(featherSvg(angle, sways[i]))).png().toBuffer()),
);

const strip = await sharp({
  create: { width: FRAME_W * FRAMES, height: FRAME_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite(frameBuffers.map((buf, i) => ({ input: buf, left: i * FRAME_W, top: 0 })))
  .webp({ lossless: true, quality: 100 })
  .toBuffer();

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, strip);
const dims = await sharp(outPath).metadata();
console.log(`generated ${outPath}: ${dims.width}x${dims.height}, ${FRAMES} frames of ${FRAME_W}x${FRAME_H}`);
