import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { id } = await params;
  const { env } = getCloudflareContext();

  const order = await env.DB.prepare(
    `SELECT o.id, o.status, o.property_address, o.customer_email, o.job_id, o.curbappeal_photo_key,
            o.hoa_answer, o.historic_district_answer, o.logo_key, o.total_amount_cents, o.created_at,
            j.property_id
     FROM orders o LEFT JOIN jobs j ON j.id = o.job_id WHERE o.id = ?`
  )
    .bind(id)
    .first<{
      id: string;
      status: string;
      property_address: string;
      customer_email: string | null;
      job_id: string | null;
      curbappeal_photo_key: string | null;
      hoa_answer: string | null;
      historic_district_answer: string | null;
      logo_key: string | null;
      total_amount_cents: number;
      created_at: string;
      property_id: string | null;
    }>();

  if (!order) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const renderItems = await env.DB.prepare(
    `SELECT tier, style_name, custom_text, night, seasonal, season_choice, holiday, holiday_choice,
            breakdown, unit_price_cents
     FROM order_items WHERE order_id = ?`
  )
    .bind(id)
    .all<{
      tier: string;
      style_name: string | null;
      custom_text: string | null;
      night: number;
      seasonal: number;
      season_choice: string | null;
      holiday: number;
      holiday_choice: string | null;
      breakdown: number;
      unit_price_cents: number;
    }>();

  const analysis = order.property_id
    ? await env.DB.prepare(
        `SELECT psa.structure_profile_id, sp.house_type, sp.roof_form, sp.massing_envelope
         FROM curbappeal_property_structure_analysis psa
         JOIN curbappeal_structure_profiles sp ON sp.id = psa.structure_profile_id
         WHERE psa.property_id = ?`
      )
        .bind(order.property_id)
        .first<{ structure_profile_id: string; house_type: string; roof_form: string; massing_envelope: string }>()
    : null;

  const consensus = analysis
    ? await env.DB.prepare(
        `SELECT c.classification_status, c.primary_score_pct, c.secondary_score_pct,
                s1.name as primary_name, s2.name as secondary_name
         FROM curbappeal_structure_profile_consensus c
         LEFT JOIN styles s1 ON s1.id = c.primary_style_id
         LEFT JOIN styles s2 ON s2.id = c.secondary_style_id
         WHERE c.structure_profile_id = ?`
      )
        .bind(analysis.structure_profile_id)
        .first<{
          classification_status: string;
          primary_score_pct: number | null;
          secondary_score_pct: number | null;
          primary_name: string | null;
          secondary_name: string | null;
        }>()
    : null;

  const topMatches = analysis
    ? await env.DB.prepare(
        `SELECT s.name, c.combined_score_pct, c.fit_tier
         FROM curbappeal_profile_style_compatibility c JOIN styles s ON s.id = c.style_id
         WHERE c.structure_profile_id = ? ORDER BY c.combined_score_pct DESC LIMIT 8`
      )
        .bind(analysis.structure_profile_id)
        .all<{ name: string; combined_score_pct: number; fit_tier: string }>()
    : null;

  const regulatory = order.property_id
    ? await env.DB.prepare(
        `SELECT zoning_district, historic_overlay, flood_zone, summary FROM curbappeal_property_regulatory_lookups
         WHERE property_id = ? ORDER BY looked_up_at DESC LIMIT 1`
      )
        .bind(order.property_id)
        .first<{ zoning_district: string | null; historic_overlay: number | null; flood_zone: string | null; summary: string }>()
    : null;

  const neighborhood = order.property_id
    ? await env.DB.prepare(
        `SELECT style_read, homes_visible, street_view_key FROM curbappeal_property_neighborhood_reads
         WHERE property_id = ? ORDER BY created_at DESC LIMIT 1`
      )
        .bind(order.property_id)
        .first<{ style_read: string; homes_visible: number; street_view_key: string | null }>()
    : null;

  return NextResponse.json({
    order,
    renderItems: renderItems.results ?? [],
    analysis,
    consensus,
    topMatches: topMatches?.results ?? [],
    regulatory,
    neighborhood,
  });
}
