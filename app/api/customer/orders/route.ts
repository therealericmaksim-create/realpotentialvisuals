import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentCustomer, ORDER_OWNERSHIP_SQL, orderOwnershipParams } from "@/lib/currentCustomer";

// The customer's own order history, newest first, 25 per page. Only ever
// returns orders owned by the verified session — there is no way to ask
// this endpoint for someone else's orders, because the identity comes
// from the signed cookie, never from a parameter.

const PAGE_SIZE = 25;

type OrderRow = {
  id: string;
  status: string;
  property_address: string | null;
  curbappeal_photo_key: string | null;
  total_amount_cents: number;
  created_at: string;
  render_count: number;
  complete_count: number;
};

export async function GET(req: NextRequest) {
  const { env } = getCloudflareContext();
  const identity = await getCurrentCustomer(req, env.DB);
  if (!identity) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const pageParam = Number(req.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const owner = orderOwnershipParams(identity);

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM orders o WHERE ${ORDER_OWNERSHIP_SQL}`
  )
    .bind(...owner)
    .first<{ n: number }>();
  const total = totalRow?.n ?? 0;

  const rows = await env.DB.prepare(
    `SELECT o.id, o.status, o.property_address, o.curbappeal_photo_key,
            o.total_amount_cents, o.created_at,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as render_count,
            (SELECT COUNT(*) FROM order_items oi
             WHERE oi.order_id = o.id AND oi.stage = 'complete') as complete_count
     FROM orders o
     WHERE ${ORDER_OWNERSHIP_SQL}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...owner, PAGE_SIZE, offset)
    .all<OrderRow>();

  return NextResponse.json({
    orders: rows.results ?? [],
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}
