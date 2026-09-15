import Link from "next/link";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  status: string;
  property_address: string | null;
  customer_email: string | null;
  job_id: string | null;
  created_at: string;
};

export default async function OrdersList() {
  const { env } = getCloudflareContext();
  const rows = await env.DB.prepare(
    `SELECT id, status, property_address, customer_email, job_id, created_at
     FROM orders ORDER BY created_at DESC LIMIT 50`
  ).all<OrderRow>();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "24px 20px" }}>
      <h1 style={{ fontSize: 20 }}>Orders</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
            <th style={{ padding: "6px 8px" }}>Order</th>
            <th style={{ padding: "6px 8px" }}>Status</th>
            <th style={{ padding: "6px 8px" }}>Address</th>
            <th style={{ padding: "6px 8px" }}>Customer</th>
            <th style={{ padding: "6px 8px" }}>Ready for analysis?</th>
          </tr>
        </thead>
        <tbody>
          {(rows.results ?? []).map((o) => (
            <tr key={o.id} style={{ borderBottom: "1px solid #222" }}>
              <td style={{ padding: "6px 8px" }}>
                <Link href={`/orders/${o.id}`} style={{ color: "#c9a227" }}>
                  {o.id.slice(0, 8)}
                </Link>
              </td>
              <td style={{ padding: "6px 8px" }}>{o.status}</td>
              <td style={{ padding: "6px 8px" }}>{o.property_address ?? "—"}</td>
              <td style={{ padding: "6px 8px" }}>{o.customer_email ?? "—"}</td>
              <td style={{ padding: "6px 8px" }}>{o.job_id ? "yes" : "no"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
