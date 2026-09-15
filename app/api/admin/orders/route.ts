import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

type OrderRow = {
  id: string;
  status: string;
  property_address: string | null;
  customer_email: string | null;
  job_id: string | null;
  created_at: string;
};

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { env } = getCloudflareContext();
  const rows = await env.DB.prepare(
    `SELECT id, status, property_address, customer_email, job_id, created_at
     FROM orders ORDER BY created_at DESC LIMIT 50`
  ).all<OrderRow>();

  return NextResponse.json({ orders: rows.results ?? [] });
}
