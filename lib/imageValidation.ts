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
