import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const SRC = join(process.cwd(), '..', 'assets', 'icon.png');
const RES = join(process.cwd(), 'android', 'app', 'src', 'main', 'res');

const SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const FG_SIZES = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

for (const [dir, size] of Object.entries(SIZES)) {
  const out = join(RES, dir);
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  await sharp(SRC).resize(size, size).toFile(join(out, 'ic_launcher.png'));
  await sharp(SRC).resize(size, size).toFile(join(out, 'ic_launcher_round.png'));
}

for (const [dir, size] of Object.entries(FG_SIZES)) {
  const out = join(RES, dir);
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  const inner = Math.round(size * 0.65);
  const pad = Math.round((size - inner) / 2);
  await sharp(SRC)
    .resize(inner, inner)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(join(out, 'ic_launcher_foreground.png'));
}

const BG = { r: 11, g: 13, b: 23, alpha: 1 };
const splashDirs = [
  ['drawable', 200, 200],
  ['drawable-port-mdpi', 480, 800],
  ['drawable-port-hdpi', 720, 1280],
  ['drawable-port-xhdpi', 1080, 1920],
  ['drawable-port-xxhdpi', 1440, 2560],
  ['drawable-port-xxxhdpi', 2160, 3840],
  ['drawable-land-mdpi', 800, 480],
  ['drawable-land-hdpi', 1280, 720],
  ['drawable-land-xhdpi', 1920, 1080],
  ['drawable-land-xxhdpi', 2560, 1440],
  ['drawable-land-xxxhdpi', 3840, 2160],
];

for (const [dir, w, h] of splashDirs) {
  const out = join(RES, dir);
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  const logoSize = Math.min(w, h) * 0.22;
  const logo = await sharp(SRC).resize(Math.round(logoSize), Math.round(logoSize)).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(join(out, 'splash.png'));
}

console.log('OK: icons + splash generated');
