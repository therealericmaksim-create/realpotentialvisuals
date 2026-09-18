// Stamps the "Human Curated / AI-POWERED / Not a real photo" badge onto
// the bottom-right of a render.
//
// THIS MUST NEVER GO THROUGH THE IMAGE MODEL. Asking a generative model to
// include a logo means asking it to redraw one, and it will: mangled
// letterforms, invented crowns, wrong wording. The badge is a legal and
// trust statement, so it is composited here, pixel-for-pixel, from the
// exact source file. The only transformation applied is a proportional
// area-average downscale so the text stays legible at the render's size —
// no rotation, no recolouring, no distortion, no aspect change.
//
// Implemented against the PNG spec directly rather than an image library
// because Workers have no canvas, and the zlib layer PNG needs is already
// available natively as CompressionStream/DecompressionStream. That keeps
// this dependency-free and, more importantly, fully deterministic.

export type Rgba = { width: number; height: number; data: Uint8Array };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes as unknown as BodyInit).body!.pipeThrough(
    new DecompressionStream("deflate")
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes as unknown as BodyInit).body!.pipeThrough(
    new CompressionStream("deflate")
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Supports the 8-bit, non-interlaced colour types these images actually
// use: greyscale, RGB, greyscale+alpha and RGBA. Anything else throws
// rather than silently producing a wrong picture.
export async function decodePng(bytes: Uint8Array): Promise<Rgba> {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error("Not a PNG (bad signature)");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Uint8Array[] = [];

  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );
    const dataStart = offset + 8;

    if (type === "IHDR") {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if (type === "IDAT") {
      idat.push(bytes.subarray(dataStart, dataStart + length));
    } else if (type === "IEND") {
      break;
    }

    offset = dataStart + length + 4;
  }

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth} (only 8 is handled)`);
  if (interlace !== 0) throw new Error("Interlaced PNG is not supported");

  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (channels === 0) throw new Error(`Unsupported PNG colour type ${colorType}`);

  let total = 0;
  for (const part of idat) total += part.length;
  const joined = new Uint8Array(total);
  let at = 0;
  for (const part of idat) {
    joined.set(part, at);
    at += part.length;
  }

  const raw = await inflate(joined);
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    line.set(raw.subarray(pos, pos + stride));
    pos += stride;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      line[x] = v & 0xff;
    }
    prev.set(line);

    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      if (channels === 1) {
        out[d] = out[d + 1] = out[d + 2] = line[s];
        out[d + 3] = 255;
      } else if (channels === 2) {
        out[d] = out[d + 1] = out[d + 2] = line[s];
        out[d + 3] = line[s + 1];
      } else if (channels === 3) {
        out[d] = line[s];
        out[d + 1] = line[s + 1];
        out[d + 2] = line[s + 2];
        out[d + 3] = 255;
      } else {
        out[d] = line[s];
        out[d + 1] = line[s + 1];
        out[d + 2] = line[s + 2];
        out[d + 3] = line[s + 3];
      }
    }
  }

  return { width, height, data: out };
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export async function encodePng(image: Rgba): Promise<Uint8Array> {
  const { width, height, data } = image;
  const stride = width * 4;
  // Filter type 0 (None) on every scanline: the deflate pass does the
  // compressing, and skipping adaptive filtering keeps this fast and
  // trivially correct.
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = await deflate(raw);
  const parts = [
    new Uint8Array(PNG_SIGNATURE),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ];

  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// Area-average (box filter) downscale. Chosen over nearest-neighbour or
// bilinear specifically because the badge is mostly small text: a box
// filter is what keeps "Not a real photo" readable instead of aliasing it
// into noise.
export function resize(src: Rgba, width: number, height: number): Rgba {
  const out = new Uint8Array(width * height * 4);
  const xRatio = src.width / width;
  const yRatio = src.height / height;

  for (let y = 0; y < height; y++) {
    const sy0 = Math.floor(y * yRatio);
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < width; x++) {
      const sx0 = Math.floor(x * xRatio);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * xRatio));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1 && sy < src.height; sy++) {
        for (let sx = sx0; sx < sx1 && sx < src.width; sx++) {
          const s = (sy * src.width + sx) * 4;
          const alpha = src.data[s + 3];
          // Weight colour by alpha so transparent pixels don't drag the
          // badge's edges toward black.
          r += src.data[s] * alpha;
          g += src.data[s + 1] * alpha;
          b += src.data[s + 2] * alpha;
          a += alpha;
          n++;
        }
      }

      const d = (y * width + x) * 4;
      if (a > 0) {
        out[d] = Math.round(r / a);
        out[d + 1] = Math.round(g / a);
        out[d + 2] = Math.round(b / a);
        out[d + 3] = Math.round(a / n);
      } else {
        out[d] = out[d + 1] = out[d + 2] = out[d + 3] = 0;
      }
    }
  }

  return { width, height, data: out };
}

// How much of the render's width the badge occupies, and how far it sits
// off the edge. Proportional so the badge reads the same at any output
// size, with a floor so it never shrinks below legibility on a small
// render.
const BADGE_WIDTH_FRACTION = 0.3;
const BADGE_MIN_WIDTH = 260;
const MARGIN_FRACTION = 0.025;

export function drawBadgeBottomRight(base: Rgba, badge: Rgba): Rgba {
  const targetWidth = Math.min(
    base.width,
    Math.max(BADGE_MIN_WIDTH, Math.round(base.width * BADGE_WIDTH_FRACTION))
  );
  // Aspect ratio is preserved exactly — the badge is never stretched.
  const targetHeight = Math.max(1, Math.round((badge.height / badge.width) * targetWidth));
  const scaled = targetWidth === badge.width ? badge : resize(badge, targetWidth, targetHeight);

  const margin = Math.round(base.width * MARGIN_FRACTION);
  const left = Math.max(0, base.width - scaled.width - margin);
  const top = Math.max(0, base.height - scaled.height - margin);

  const out = new Uint8Array(base.data);

  for (let y = 0; y < scaled.height; y++) {
    const by = top + y;
    if (by >= base.height) break;
    for (let x = 0; x < scaled.width; x++) {
      const bx = left + x;
      if (bx >= base.width) break;

      const s = (y * scaled.width + x) * 4;
      const alpha = scaled.data[s + 3];
      if (alpha === 0) continue;

      const d = (by * base.width + bx) * 4;
      if (alpha === 255) {
        out[d] = scaled.data[s];
        out[d + 1] = scaled.data[s + 1];
        out[d + 2] = scaled.data[s + 2];
        out[d + 3] = 255;
        continue;
      }

      // Standard source-over alpha compositing.
      const sa = alpha / 255;
      out[d] = Math.round(scaled.data[s] * sa + out[d] * (1 - sa));
      out[d + 1] = Math.round(scaled.data[s + 1] * sa + out[d + 1] * (1 - sa));
      out[d + 2] = Math.round(scaled.data[s + 2] * sa + out[d + 2] * (1 - sa));
      out[d + 3] = Math.max(out[d + 3], alpha);
    }
  }

  return { width: base.width, height: base.height, data: out };
}

// The whole job: render PNG in, badged PNG out.
export async function applyBadge(renderPng: Uint8Array, badgePng: Uint8Array): Promise<Uint8Array> {
  const base = await decodePng(renderPng);
  const badge = await decodePng(badgePng);
  return encodePng(drawBadgeBottomRight(base, badge));
}

export const BADGE_ASSET_PATH = "/images/render-overlay-ai.png";

// The badge ships as a static asset, so it is served through the ASSETS
// binding rather than duplicated into R2 or inlined as base64 — one copy,
// versioned with the code, and no bundle bloat.
export async function loadBadgeAsset(assets: Fetcher | undefined): Promise<Uint8Array> {
  if (!assets) {
    throw new Error("The ASSETS binding is unavailable, so the badge file could not be read");
  }
  const res = await assets.fetch(new Request(`https://assets.local${BADGE_ASSET_PATH}`));
  if (!res.ok) {
    throw new Error(`Badge asset ${BADGE_ASSET_PATH} could not be read (HTTP ${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

// Applies the badge, or explains why it could not. Callers must treat a
// failure as fatal to DELIVERY — an unbadged render must never reach a
// customer — while still keeping the generated image, which cost money.
export async function badgeRenderOrExplain(
  assets: Fetcher | undefined,
  renderPng: Uint8Array
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  try {
    const badge = await loadBadgeAsset(assets);
    return { ok: true, bytes: await applyBadge(renderPng, badge) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
