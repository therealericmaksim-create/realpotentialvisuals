import { getCloudflareContext } from "@opennextjs/cloudflare";

// Reads D1 at request time — must never be statically prerendered.
export const dynamic = "force-dynamic";

// Placeholder landing page for the admin backend (admin.realpotentialvisuals.com).
// Access control lives in Cloudflare Access in front of this Worker, not
// here — see middleware.ts. This page exists mainly to prove the
// subdomain routing and D1 binding both work before any real admin
// feature gets built on top of it.

export default async function AdminHome() {
  const { env } = getCloudflareContext();

  const orderCount = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM orders`
  ).first<{ n: number }>();

  const latest = await env.DB.prepare(
    `SELECT id, status, created_at FROM orders ORDER BY created_at DESC LIMIT 1`
  ).first<{ id: string; status: string; created_at: string }>();

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 640,
        margin: "60px auto",
        padding: "0 20px",
        color: "#e5e5e5",
        background: "#111",
      }}
    >
      <h1 style={{ fontSize: 22 }}>RealPotential Visuals — Admin</h1>
      <p style={{ color: "#999" }}>
        Nothing built here yet. This page confirms the admin subdomain
        routes correctly and can read the live database.
      </p>
      <div
        style={{
          marginTop: 24,
          padding: 16,
          border: "1px solid #333",
          borderRadius: 8,
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
    </div>
  );
}
