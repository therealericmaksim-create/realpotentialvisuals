import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

// Staff-only R2 passthrough — the admin UI needs to display uploaded
// house photos and retained Street View images, and R2 objects aren't
// public. Path segments are taken as an R2 key as-is (e.g.
// originals/<uuid>.webp or neighborhood/<uuid>.jpg).

type Params = { params: Promise<{ key: string[] }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { key } = await params;
  const { env } = getCloudflareContext();
  const object = await env.MEDIA.get(key.join("/"));

  if (!object) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new NextResponse(object.body as ReadableStream, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
