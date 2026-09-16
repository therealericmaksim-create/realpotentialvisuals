import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { createOrderWithItems, type RenderItemInput } from "@/lib/orders";
import { ensurePropertyLinkage } from "@/lib/analysis/propertyLinkage";

// Staff-entered order — same order/order_items shape as the public /start
// intake (lib/orders.ts), but skips Stripe entirely: it's saved straight
// to status 'placed' with the customer's email already attached, and
// linkage (client/property/job) runs immediately so the order is ready
// for "Run Analysis" the moment this returns. Any signed-in staff member
// can use this, same rule as run-analysis.

type ManualOrderBody = {
  customerEmail?: string;
  curbappealPhotoKey?: string | null;
  propertyAddress?: string;
  hoaAnswer?: string;
  historicDistrictAnswer?: string;
  renderItems?: RenderItemInput[];
  logoSelected?: boolean;
};

export async function POST(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = (await req.json()) as ManualOrderBody;
  const customerEmail = (body.customerEmail ?? "").trim().toLowerCase();
  const propertyAddress = (body.propertyAddress ?? "").trim();

  if (!customerEmail) {
    return NextResponse.json({ error: "customerEmail required" }, { status: 400 });
  }
  if (!propertyAddress) {
    return NextResponse.json({ error: "propertyAddress required" }, { status: 400 });
  }
  if (!body.renderItems || body.renderItems.length === 0) {
    return NextResponse.json({ error: "at least one render item is required" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const now = new Date().toISOString();

  const { orderId, totalCents } = await createOrderWithItems(env.DB, {
    curbappealPhotoKey: body.curbappealPhotoKey ?? null,
    propertyAddress,
    hoaAnswer: body.hoaAnswer ?? "",
    historicDistrictAnswer: body.historicDistrictAnswer ?? "",
    gatePassed: null,
    gateReason: "Entered manually by staff — Gate 0/1 AI check skipped.",
    renderItems: body.renderItems,
    logoSelected: body.logoSelected ?? false,
    status: "placed",
    customerEmail,
    disclosureAcceptedAt: now,
  });

  await ensurePropertyLinkage(env.DB, orderId);

  return NextResponse.json({ orderId, status: "placed", totalCents });
}
