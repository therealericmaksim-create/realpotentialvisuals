"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { orderNumber, orderStatusLabel } from "@/lib/orderDisplay";

// The customer's own order history. Same sign-in gate as /start — the
// list is scoped server-side to the verified session, so this page never
// asks for (or trusts) an identifier for whose orders to show.

type CustomerIdentity = { name: string | null; email: string | null };

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

export default function OrdersPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<CustomerIdentity | null | undefined>(undefined);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json() as Promise<{ identity: CustomerIdentity | null }>)
      .then((data) => setIdentity(data.identity))
      .catch(() => setIdentity(null));
  }, []);

  const loadOrders = useCallback(() => {
    fetch(`/api/customer/orders?page=${page}`)
      .then(async (res) => {
        const text = await res.text();
        let parsed: { orders?: OrderRow[]; totalPages?: number; total?: number; error?: string } | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`HTTP ${res.status} — non-JSON response: ${text.slice(0, 200)}`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} — ${parsed?.error ?? "unknown error"}`);
        return parsed as { orders: OrderRow[]; totalPages: number; total: number };
      })
      .then((d) => {
        setOrders(d.orders ?? []);
        setTotalPages(d.totalPages ?? 1);
        setTotal(d.total ?? 0);
      })
      .catch((e: Error) => setError(`Couldn't load your orders: ${e.message}`));
  }, [page]);

  useEffect(() => {
    if (identity) loadOrders();
  }, [identity, loadOrders]);

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
            <div className="eyebrow">Your Orders</div>
            <h1>Sign In With Google</h1>
            <p>Sign in with the same Google account you used to place your order to see your order history.</p>
            <a
              className="cfg-continue"
              href={`/api/auth/google/start?redirect_to=${encodeURIComponent("/orders")}`}
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
          <div className="eyebrow">Your Orders</div>
          <h1 style={{ fontSize: 28, marginBottom: 6 }}>Order History</h1>
          <p style={{ color: "var(--gray)", fontSize: 15 }}>
            {total === 0
              ? "You haven't placed an order yet."
              : `${total} order${total === 1 ? "" : "s"}, most recent first.`}
          </p>

          {error && <div className="cfg-error" style={{ marginTop: 16 }}>{error}</div>}
          {!orders && !error && <div className="flow-spinner" style={{ marginTop: 30 }} />}

          {orders && orders.length === 0 && !error && (
            <a className="cfg-continue" href="/start" style={{ display: "inline-block", marginTop: 20, textDecoration: "none", textAlign: "center" }}>
              Start Your First Order
            </a>
          )}

          {orders && orders.length > 0 && (
            <div className="orders-list">
              {orders.map((o) => (
                <button key={o.id} className="order-card" onClick={() => router.push(`/order/${o.id}`)}>
                  {o.curbappeal_photo_key ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="order-card-thumb"
                      src={`/api/customer/media/${o.curbappeal_photo_key}`}
                      alt="Your uploaded property photo"
                    />
                  ) : (
                    <div className="order-card-thumb order-card-thumb-empty" />
                  )}
                  <div className="order-card-body">
                    <div className="order-card-num">{orderNumber(o.id)}</div>
                    <div className="order-card-addr">{o.property_address ?? "No address on file"}</div>
                    <div className="order-card-meta">
                      {new Date(o.created_at).toLocaleDateString()} — {o.render_count} render
                      {o.render_count === 1 ? "" : "s"} — ${(o.total_amount_cents / 100).toFixed(2)}
                    </div>
                  </div>
                  <div className="order-card-status">
                    {/* Progress, not a single status: an order can be part
                        delivered, and the count is the honest answer. */}
                    {o.render_count > 0 && o.complete_count < o.render_count
                      ? `${o.complete_count} of ${o.render_count} ready`
                      : orderStatusLabel(o.status)}
                  </div>
                </button>
              ))}
            </div>
          )}

          {orders && totalPages > 1 && (
            <div className="orders-pager">
              <button
                type="button"
                className="btn btn-outline"
                disabled={page <= 1}
                onClick={() => {
                  setOrders(null);
                  setPage((p) => Math.max(1, p - 1));
                }}
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-outline"
                disabled={page >= totalPages}
                onClick={() => {
                  setOrders(null);
                  setPage((p) => Math.min(totalPages, p + 1));
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
