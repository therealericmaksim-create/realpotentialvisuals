// Shared magic-byte + size validation for any uploaded photo — used by the
// public /api/photo-check (with the AI gate) and the admin
// /api/admin/photo-upload (gate skipped, staff already vetting the photo
// by eye) so both accept exactly the same set of real files.

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

function bytesAt(buf: Uint8Array, offset: number, bytes: number[]): boolean {
  return bytes.every((b, i) => buf[offset + i] === b);
}

export type DetectedImageType = { mime: string; ext: string };

const IMAGE_TYPES: (DetectedImageType & { matches: (buf: Uint8Array) => boolean })[] = [
  {
    mime: "image/jpeg",
    ext: "jpg",
    matches: (buf) => bytesAt(buf, 0, [0xff, 0xd8, 0xff]),
  },
  {
    mime: "image/png",
    ext: "png",
    matches: (buf) => bytesAt(buf, 0, [0x89, 0x50, 0x4e, 0x47]),
  },
  {
    // WEBP's magic bytes aren't contiguous: "RIFF" at byte 0, then a
    // 4-byte little-endian file size, then "WEBP" at byte 8.
    mime: "image/webp",
    ext: "webp",
    matches: (buf) =>
      bytesAt(buf, 0, [0x52, 0x49, 0x46, 0x46]) &&
      bytesAt(buf, 8, [0x57, 0x45, 0x42, 0x50]),
  },
];

export function detectImageType(buf: Uint8Array): DetectedImageType | null {
  const found = IMAGE_TYPES.find((candidate) => candidate.matches(buf));
  return found ? { mime: found.mime, ext: found.ext } : null;
}

export type ImageDimensions = { width: number; height: number };

// Reads width/height straight out of the file header. Needed because the
// image model only emits a few fixed sizes, so we have to pick the one
// whose shape matches the customer's photo — guessing landscape produced
// a re-framed, re-cropped render on the first real run.
//
// Header parsing only: no decoding, no dependency, and it stops as soon as
// it has the numbers. Returns null rather than throwing on anything it
// doesn't recognise, since a missing size only costs us the aspect match.
export function readImageDimensions(buf: Uint8Array): ImageDimensions | null {
  // PNG: IHDR is always the first chunk — width/height are big-endian
  // uint32s at fixed offsets.
  if (bytesAt(buf, 0, [0x89, 0x50, 0x4e, 0x47])) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (buf.byteLength < 24) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // JPEG: walk the segment chain to a Start Of Frame marker, which is the
  // only place the real dimensions live. SOF0–SOF15, skipping the four
  // markers in that range that aren't frame headers (DHT/JPG/DAC/RSTn).
  if (bytesAt(buf, 0, [0xff, 0xd8, 0xff])) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let offset = 2;
    while (offset + 9 < buf.byteLength) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      if (length <= 0) return null;
      offset += 2 + length;
    }
    return null;
  }

  // WebP: three container flavours, each storing the size differently.
  if (
    bytesAt(buf, 0, [0x52, 0x49, 0x46, 0x46]) &&
    bytesAt(buf, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    // VP8X (extended): 24-bit little-endian, stored as value-1.
    if (bytesAt(buf, 12, [0x56, 0x50, 0x38, 0x58]) && buf.byteLength >= 30) {
      const w = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
      const h = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
      return { width: w, height: h };
    }
    // VP8 (lossy): dimensions follow the 3-byte start code in the frame header.
    if (bytesAt(buf, 12, [0x56, 0x50, 0x38, 0x20]) && buf.byteLength >= 30) {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    // VP8L (lossless): 14 bits each, packed across four bytes.
    if (bytesAt(buf, 12, [0x56, 0x50, 0x38, 0x4c]) && buf.byteLength >= 25) {
      const bits = buf[21] | (buf[22] << 8) | (buf[23] << 16) | (buf[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  return null;
}
