import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Serves one style's description on demand — 133 full architectural
// descriptions is too much to ship in the /start page bundle, so the
// dropdown queries this instead of rendering an image placeholder.

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const row = await env.DB.prepare(
    `SELECT description FROM styles WHERE name = ?`
  )
    .bind(name)
    .first<{ description: string | null }>();

  if (!row) {
    return NextResponse.json({ error: "style not found" }, { status: 404 });
  }

  return NextResponse.json({ name, description: row.description });
}
