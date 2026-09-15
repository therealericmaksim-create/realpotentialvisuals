import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runAnalysisAction } from "./actions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function OrderDetail({ params }: Params) {
  const { id } = await params;
  const { env } = getCloudflareContext();

  const order = await env.DB.prepare(
    `SELECT o.id, o.status, o.property_address, o.customer_email, o.job_id, j.property_id
     FROM orders o LEFT JOIN jobs j ON j.id = o.job_id WHERE o.id = ?`
  )
    .bind(id)
    .first<{ id: string; status: string; property_address: string; customer_email: string | null; job_id: string | null; property_id: string | null }>();

  if (!order) {
    return <div style={{ padding: 20, fontFamily: "system-ui" }}>Order not found.</div>;
  }

  const analysis = order.property_id
    ? await env.DB.prepare(
        `SELECT psa.structure_profile_id, sp.house_type, sp.roof_form, sp.massing_envelope
         FROM property_structure_analysis psa
         JOIN structure_profiles sp ON sp.id = psa.structure_profile_id
         WHERE psa.property_id = ?`
      )
        .bind(order.property_id)
        .first<{ structure_profile_id: string; house_type: string; roof_form: string; massing_envelope: string }>()
    : null;

  const consensus = analysis
    ? await env.DB.prepare(
        `SELECT c.classification_status, c.primary_score_pct, c.secondary_score_pct,
                s1.name as primary_name, s2.name as secondary_name
         FROM structure_profile_consensus c
         LEFT JOIN styles s1 ON s1.id = c.primary_style_id
         LEFT JOIN styles s2 ON s2.id = c.secondary_style_id
         WHERE c.structure_profile_id = ?`
      )
        .bind(analysis.structure_profile_id)
        .first<{ classification_status: string; primary_score_pct: number | null; secondary_score_pct: number | null; primary_name: string | null; secondary_name: string | null }>()
    : null;

  const topMatches = analysis
    ? await env.DB.prepare(
        `SELECT s.name, c.combined_score_pct, c.fit_tier
         FROM profile_style_compatibility c JOIN styles s ON s.id = c.style_id
         WHERE c.structure_profile_id = ? ORDER BY c.combined_score_pct DESC LIMIT 8`
      )
        .bind(analysis.structure_profile_id)
        .all<{ name: string; combined_score_pct: number; fit_tier: string }>()
    : null;

  const regulatory = order.property_id
    ? await env.DB.prepare(
        `SELECT zoning_district, historic_overlay, flood_zone, summary FROM property_regulatory_lookups
         WHERE property_id = ? ORDER BY looked_up_at DESC LIMIT 1`
      )
        .bind(order.property_id)
        .first<{ zoning_district: string | null; historic_overlay: number | null; flood_zone: string | null; summary: string }>()
    : null;

  const neighborhood = order.property_id
    ? await env.DB.prepare(
        `SELECT style_read, homes_visible FROM property_neighborhood_reads
         WHERE property_id = ? ORDER BY created_at DESC LIMIT 1`
      )
        .bind(order.property_id)
        .first<{ style_read: string; homes_visible: number }>()
    : null;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "24px 20px", maxWidth: 700 }}>
      <h1 style={{ fontSize: 20 }}>Order {order.id.slice(0, 8)}</h1>
      <p style={{ color: "#999" }}>
        {order.property_address} — {order.customer_email ?? "no email"} — status: {order.status}
      </p>

      {!order.job_id && (
        <p style={{ color: "#c66" }}>
          No property/job linkage yet — this order hasn&apos;t completed payment confirmation.
        </p>
      )}

      {order.job_id && (
        <form action={runAnalysisAction} style={{ marginTop: 12 }}>
          <input type="hidden" name="orderId" value={order.id} />
          <button
            type="submit"
            style={{
              padding: "10px 18px",
              background: "#c9a227",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {analysis ? "Re-run Analysis" : "Run Analysis"}
          </button>
        </form>
      )}

      {analysis && (
        <div style={{ marginTop: 24, border: "1px solid #333", borderRadius: 8, padding: 16 }}>
          <h2 style={{ fontSize: 15 }}>Structure</h2>
          <p style={{ fontSize: 13, color: "#999" }}>
            {analysis.house_type} — {analysis.roof_form} roof — {analysis.massing_envelope}
          </p>

          {consensus && (
            <>
              <h2 style={{ fontSize: 15, marginTop: 16 }}>Consensus</h2>
              <p style={{ fontSize: 13, color: "#999" }}>
                {consensus.primary_name} ({consensus.primary_score_pct}%)
                {consensus.secondary_name && ` / ${consensus.secondary_name} (${consensus.secondary_score_pct}%)`}
                {" — "}
                {consensus.classification_status}
              </p>
            </>
          )}

          {topMatches && (
            <>
              <h2 style={{ fontSize: 15, marginTop: 16 }}>Top matches</h2>
              <ul style={{ fontSize: 13, color: "#999", paddingLeft: 18 }}>
                {(topMatches.results ?? []).map((m, i) => (
                  <li key={i}>
                    {m.name} — {m.combined_score_pct}% ({m.fit_tier})
                  </li>
                ))}
              </ul>
            </>
          )}

          {neighborhood && (
            <>
              <h2 style={{ fontSize: 15, marginTop: 16 }}>Neighborhood read</h2>
              <p style={{ fontSize: 13, color: "#999" }}>{neighborhood.style_read}</p>
            </>
          )}

          {regulatory && (
            <>
              <h2 style={{ fontSize: 15, marginTop: 16 }}>Regulatory</h2>
              <p style={{ fontSize: 13, color: "#999" }}>
                Zoning: {regulatory.zoning_district ?? "unknown"} — Historic overlay:{" "}
                {regulatory.historic_overlay === null ? "unknown" : regulatory.historic_overlay ? "yes" : "no"} — Flood
                zone: {regulatory.flood_zone ?? "unknown"}
              </p>
              <p style={{ fontSize: 12, color: "#777" }}>{regulatory.summary}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
