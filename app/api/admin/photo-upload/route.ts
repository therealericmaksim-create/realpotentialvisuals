import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { MAX_PHOTO_BYTES, detectImageType } from "@/lib/imageValidation";

// Photo upload for the admin Manual Order form. Same format/size
// validation as the public /api/photo-check, but deliberately skips the
// Gate 0/1 AI vision call — staff are looking at the photo themselves
// while entering the order, so a second AI opinion just costs money for
// no benefit. Any signed-in staff member can use this, same rule as
// run-analysis: it doesn't touch who-can-do-what, only order intake.

type EnvWithMedia = CloudflareEnv & { MEDIA?: R2Bucket };

export async function POST(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("photo");

  if (!(file instanceof File)) {
    return NextResponse.json({ valid: false, reason: "No photo received." }, { status: 400 });
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({
      valid: false,
      reason: `File is too large (max ${MAX_PHOTO_BYTES / (1024 * 1024)}MB).`,
    });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buf = new Uint8Array(arrayBuffer);
  const detected = detectImageType(buf);

  if (!detected) {
    return NextResponse.json({
      valid: false,
      reason: "That doesn't look like a valid JPG, PNG, or WEBP file.",
    });
  }

  const { env } = getCloudflareContext() as unknown as { env: EnvWithMedia };

  const key = `originals/${crypto.randomUUID()}.${detected.ext}`;

  let storedInR2 = false;
  if (env.MEDIA) {
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType: detected.mime } });
    storedInR2 = true;
  }

  return NextResponse.json({ valid: true, key, storedInR2 });
}
