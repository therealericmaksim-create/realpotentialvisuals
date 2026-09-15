import Link from "next/link";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { hasRole } from "@/lib/staffAuth";

// Reads D1 at request time — must never be statically prerendered.
export const dynamic = "force-dynamic";

// Landing page for the admin backend (admin.realpotentialvisuals.com).
// Real authorization gate lives in app/admin/layout.tsx — by the time
// this renders, the caller is already a confirmed active staff member.

export default async function AdminHome() {
  const { env } = getCloudflareContext();
  const staff = await getCurrentStaff();

  const orderCount = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM orders`
  ).first<{ n: number }>();

  const latest = await env.DB.prepare(
    `SELECT id, status, created_at FROM orders ORDER BY created_at DESC LIMIT 1`
  ).first<{ id: string; status: string; created_at: string }>();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "24px 20px" }}>
      <div
        style={{
          padding: 16,
          border: "1px solid #333",
          borderRadius: 8,
          maxWidth: 500,
        }}
      >
        <div>Total orders: {orderCount?.n ?? "—"}</div>
        {latest ? (
          <div style={{ marginTop: 8, fontSize: 13, color: "#999" }}>
            Most recent: <code>{latest.id}</code> — {latest.status} (
            {latest.created_at})
          </div>
        ) : (
          <div style={{ marginTop: 8, fontSize: 13, color: "#999" }}>
            No orders yet.
          </div>
        )}
      </div>

      <p style={{ marginTop: 20 }}>
        <Link href="/orders" style={{ color: "#c9a227" }}>
          View Orders →
        </Link>
      </p>

      {staff && hasRole(staff, "principal") && (
        <p style={{ marginTop: 8 }}>
          <Link href="/staff" style={{ color: "#c9a227" }}>
            Manage Staff →
          </Link>
        </p>
      )}
    </div>
  );
}
