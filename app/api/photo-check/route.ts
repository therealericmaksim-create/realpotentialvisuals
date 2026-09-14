import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Real upload + basic validity check. Gate 0 (is this a structure?) and
// Gate 1 (residential vs. non-residential) are NOT implemented here yet —
// those need a real vision-model call. This endpoint only confirms the
// upload is a genuine, storable JPG/PNG and puts it in R2.

const MAX_BYTES = 15 * 1024 * 1024;

const MAGIC_BYTES: { mime: string; ext: string; bytes: number[] }[] = [
  { mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
];

function detectImageType(buf: Uint8Array) {
  for (const candidate of MAGIC_BYTES) {
    if (candidate.bytes.every((b, i) => buf[i] === b)) return candidate;
  }
  return null;
}

type EnvWithMedia = CloudflareEnv & { MEDIA?: R2Bucket };

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("photo");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { valid: false, reason: "No photo received." },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({
      valid: false,
      reason: `File is too large (max ${MAX_BYTES / (1024 * 1024)}MB).`,
    });
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(buf);

  if (!detected) {
    return NextResponse.json({
      valid: false,
      reason: "That doesn't look like a valid JPG or PNG file.",
    });
  }

  const key = `originals/${crypto.randomUUID()}.${detected.ext}`;
  const { env } = getCloudflareContext() as unknown as { env: EnvWithMedia };

  let storedInR2 = false;
  if (env.MEDIA) {
    await env.MEDIA.put(key, buf, {
      httpMetadata: { contentType: detected.mime },
    });
    storedInR2 = true;
  }

  return NextResponse.json({ valid: true, key, storedInR2 });
}
