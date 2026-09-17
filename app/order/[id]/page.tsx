"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { orderNumber, orderStatusLabel } from "@/lib/orderDisplay";

// One order's detail for the customer who placed it. Ownership is enforced
// server-side — an id belonging to someone else 404s exactly like one that
// doesn't exist — so this page can take the id straight from the URL.

type CustomerIdentity = { name: string | null; email: string | null };

type OrderDetail = {
  order: {
    id: string;
    status: string;
    property_address: string | null;
    curbappeal_photo_key: string | null;
    logo_key: string | null;
    total_amount_cents: number;
    created_at: string;
    hoa_answer: string | null;
    historic_district_answer: string | null;
  };
  items: {
    id: string;
    tier: string;
    tier_label: string;
    style_name: string;
    custom_text: string | null;
    night: number;
    seasonal: number;
    season_choice: string | null;
    holiday: number;
    holiday_choice: string | null;
    breakdown: number;
    unit_price_cents: number;
  }[];
  renders: { id: string; delivered_key: string | null; storage_key: string | null; style_name: string }[];
};

function itemExtras(i: OrderDetail["items"][number]): string {
  const extras: string[] = [];
  if (i.night) extras.push("Night View");
  if (i.seasonal) extras.push(`Seasonal (${i.season_choice ?? "—"})`);
  if (i.holiday) extras.push(`Holiday (${i.holiday_choice ?? "—"})`);
  if (i.breakdown) extras.push("Structural Breakdown");
  return extras.length > 0 ? extras.join(", ") : "No extras";
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [identity, setIdentity] = useState<CustomerIdentity | null | undefined>(undefined);
  const [data, setData] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json() as Promise<{ identity: CustomerIdentity | null }>)
      .then((d) => setIdentity(d.identity))
      .catch(() => setIdentity(null));
  }, []);

  const loadOrder = useCallback(() => {
    fetch(`/api/customer/orders/${id}`)
      .then(async (res) => {
        const text = await res.text();
        let parsed: (OrderDetail & { error?: string }) | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`HTTP ${res.status} — non-JSON response: ${text.slice(0, 200)}`);
        }
        if (res.status === 404) throw new Error("We couldn't find that order on your account.");
        if (!res.ok) throw new Error(`HTTP ${res.status} — ${parsed?.error ?? "unknown error"}`);
        return parsed as OrderDetail;
      })
      .then((d) => setData(d))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (identity) loadOrder();
  }, [identity, loadOrder]);

  if (identity === undefined) {
    return (
      <>
        <SiteHeader />
        <div className="flow-page">
          <div className="flow-wrap">
            <div className="flow-spinner" />
          </div>
        </div>
        <SiteFooter />
      </>
    );
  }

  if (identity === null) {
    return (
      <>
        <SiteHeader />
        <div className="flow-page">
          <div className="flow-wrap">
            <div className="eyebrow">Your Order</div>
            <h1>Sign In With Google</h1>
            <p>Sign in with the Google account you used to place this order to view it.</p>
            <a
              className="cfg-continue"
              href={`/api/auth/google/start?redirect_to=${encodeURIComponent(`/order/${id}`)}`}
              style={{ display: "inline-block", textDecoration: "none", textAlign: "center" }}
            >
              Sign in with Google
            </a>
          </div>
        </div>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <div className="legal-page">
        <div className="orders-wrap">
          <button type="button" className="order-back" onClick={() => router.push("/orders")}>
            ← Back to your orders
          </button>

          {error && <div className="cfg-error" style={{ marginTop: 16 }}>{error}</div>}
          {!data && !error && <div className="flow-spinner" style={{ marginTop: 30 }} />}

          {data && (
            <>
              <div className="eyebrow">Order {orderNumber(data.order.id)}</div>
              <h1 style={{ fontSize: 28, marginBottom: 6 }}>
                {data.order.property_address ?? "No address on file"}
              </h1>
              <p style={{ color: "var(--gray)", fontSize: 15 }}>
                Placed {new Date(data.order.created_at).toLocaleDateString()} —{" "}
                {orderStatusLabel(data.order.status)} — ${(data.order.total_amount_cents / 100).toFixed(2)}
              </p>

              <h2 className="order-section-head">Your Photo</h2>
              {data.order.curbappeal_photo_key ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="order-detail-photo"
                  src={`/api/customer/media/${data.order.curbappeal_photo_key}`}
                  alt="The property photo you uploaded"
                />
              ) : (
                <p style={{ color: "var(--gray)" }}>No photo on file for this order.</p>
              )}

              <h2 className="order-section-head">Your Renders</h2>
              {data.renders.length === 0 ? (
                <p style={{ color: "var(--gray)" }}>
                  {data.order.status === "complete"
                    ? "Your renders aren't showing here yet — please contact us and we'll sort it out."
                    : "Your renders aren't ready yet. They'll appear here as soon as they're finished, and we'll email you when they are."}
                </p>
              ) : (
                <div className="order-render-grid">
                  {data.renders.map((r) => (
                    <figure key={r.id} className="order-render">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/customer/media/${r.delivered_key ?? r.storage_key}`}
                        alt={`${r.style_name} visualization of your property`}
                      />
                      <figcaption>{r.style_name}</figcaption>
                    </figure>
                  ))}
                </div>
              )}

              <h2 className="order-section-head">What You Ordered</h2>
              <div className="order-items">
                {data.items.map((i) => (
                  <div key={i.id} className="order-item">
                    <div>
                      <div className="order-item-tier">{i.tier_label}</div>
                      <div className="order-item-style">
                        {i.tier === "premium"
                          ? i.custom_text || "Custom request"
                          : i.style_name || "Style being selected by our curator"}
                      </div>
                      <div className="order-item-extras">{itemExtras(i)}</div>
                    </div>
                    <div className="order-item-price">${(i.unit_price_cents / 100).toFixed(2)}</div>
                  </div>
                ))}
              </div>

              <h2 className="order-section-head">Property Details</h2>
              <p style={{ color: "var(--gray)", fontSize: 14 }}>
                HOA: {data.order.hoa_answer ?? "not answered"} — Historic district:{" "}
                {data.order.historic_district_answer ?? "not answered"}
              </p>
            </>
          )}
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
