import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { hasRole } from "@/lib/staffAuth";

type Params = { params: Promise<{ id: string }> };

// A real, permanent delete — distinct from deactivate (which just flips
// active=0 and keeps the row/history). Requested explicitly as its own
// capability. Deletes that staff member's own staff_roles rows first,
// since the schema's FK constraints (PRAGMA foreign_keys = ON) would
// otherwise reject deleting a staff row anything still references —
// nothing else in the schema references staff by row yet in production
// (renders/curations/escalations/etc. are all still empty), but this
// keeps the operation correct regardless.
export async function DELETE(_req: Request, { params }: Params) {
  const actingStaff = await getCurrentStaff();
  if (!actingStaff || !hasRole(actingStaff, "principal")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id: staffId } = await params;
  if (staffId === actingStaff.id) {
    return NextResponse.json({ error: "cannot delete yourself" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  await env.DB.prepare(`DELETE FROM staff_roles WHERE staff_id = ?`).bind(staffId).run();
  await env.DB.prepare(`DELETE FROM staff WHERE id = ?`).bind(staffId).run();

  return NextResponse.json({ ok: true });
}
