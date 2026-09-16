import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkGatePhoto } from "@/lib/openai";
import { getConfigValue } from "@/lib/systemConfig";
import { MAX_PHOTO_BYTES, detectImageType } from "@/lib/imageValidation";

// Real upload + validity check, including Gate 0/1 (Automation Routing
// Sheet Phase 1 steps 3-4: is this a structure, is it residential) plus a
// basic quality read (step 2), bundled into one vision call. The gate
// fails open — with no OPENAI_API_KEY set, it's skipped and the upload is
// accepted on format/size validity alone, same as before this existed.

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

  const { env } = getCloudflareContext() as unknown as {
    env: EnvWithMedia & { OPENAI_API_KEY?: string };
  };

  const openaiKey = await getConfigValue(env.DB, "OPENAI_API_KEY", env.OPENAI_API_KEY);
  const gate = await checkGatePhoto(openaiKey, arrayBuffer, detected.mime);
  if (gate.ran && !gate.passed) {
    return NextResponse.json({
      valid: false,
      reason: gate.reason || "This photo doesn't look like a residential exterior.",
      gatePassed: false,
      gateReason: gate.reason,
    });
  }

  const key = `originals/${crypto.randomUUID()}.${detected.ext}`;

  let storedInR2 = false;
  if (env.MEDIA) {
    await env.MEDIA.put(key, buf, {
      httpMetadata: { contentType: detected.mime },
    });
    storedInR2 = true;
  }

  return NextResponse.json({
    valid: true,
    key,
    storedInR2,
    gatePassed: gate.ran ? gate.passed : null,
    gateReason: gate.reason,
  });
}
