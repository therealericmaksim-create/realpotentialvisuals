"use client";

import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { STYLE_FAMILIES } from "@/lib/styles";
import { AI_DISCLOSURE_TEXT } from "@/lib/disclosure";
import {
  RENDER_PRICE,
  TIER_LABELS,
  TIER_DESCRIPTIONS,
  LOGO_PRICE,
  PREMIUM_CHAR_LIMIT,
  HOUSE_PHOTO_MAX_MB,
  LOGO_MAX_MB,
  EXTRA_LABELS,
  EXTRA_PRICE,
  SEASON_OPTIONS,
  HOLIDAY_OPTIONS,
  STRUCTURAL_BREAKDOWN_LABEL,
  STRUCTURAL_BREAKDOWN_PRICE,
  type ExtraKey,
  type RenderTier,
} from "@/lib/pricing";

const EXTRA_KEYS: ExtraKey[] = ["night", "seasonal", "holiday"];
const RENDER_TIERS: RenderTier[] = ["self_directed", "curated", "premium"];
const MAX_RENDERS_PER_TIER = 6;

type Step =
  | "form"
  | "disclosure"
  | "order-check"
  | "daily-intake"
  | "checkout-error"
  | "payment-success"
  | "payment-cancelled";

type RenderItem = {
  id: string;
  tier: RenderTier;
  styleName: string; // self_directed only
  customText: string; // premium only
  extras: Record<ExtraKey, boolean>;
  seasonChoice: string;
  holidayChoice: string;
  breakdown: boolean;
  collapsed: boolean;
};

function emptyExtras(): Record<ExtraKey, boolean> {
  return { night: false, seasonal: false, holiday: false };
}

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Fetches and shows the style's full architectural description on demand
// — 133 of these is too much to ship in the page bundle, so this queries
// /api/styles/description instead of rendering an image placeholder.
function StyleDescription({ styleName }: { styleName: string }) {
  const [description, setDescription] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDescription(null);

    fetch(`/api/styles/description?name=${encodeURIComponent(styleName)}`)
      .then((res) => res.json() as Promise<{ description?: string | null }>)
      .then((data) => {
        if (!cancelled) setDescription(data.description ?? null);
      })
      .catch(() => {
        if (!cancelled) setDescription(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [styleName]);

  return (
    <div className="cfg-style-preview">
      {loading ? (
        <p className="cfg-style-preview-note">Loading description&hellip;</p>
      ) : description ? (
        <p className="cfg-style-desc">{description}</p>
      ) : (
        <div className="cfg-style-preview-placeholder">
          Description coming soon for {styleName}
        </div>
      )}
    </div>
  );
}

// A small "(i)" info bubble — shows its text on hover OR click (so it
// works on touch devices with no hover at all), used both for the tier
// description next to each render row's title and for each extra
// option's description, replacing always-visible subtext that was
// cluttering both.
function InfoBubble({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="info-bubble"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="info-bubble-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="More info"
      >
        i
      </button>
      {open && <span className="info-bubble-tooltip">{text}</span>}
    </span>
  );
}

export default function StartPage() {
  return (
    <Suspense fallback={null}>
      <StartPageInner />
    </Suspense>
  );
}

function StartPageInner() {
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("form");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>("started");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderCreateError, setOrderCreateError] = useState<string | null>(
    null
  );
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);

  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{
    position: number | null;
    cap: number;
    reserved: boolean;
  } | null>(null);

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoStatus, setPhotoStatus] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >("idle");
  const [curbappealPhotoKey, setCurbappealPhotoKey] = useState<string | null>(null);
  const [gatePassed, setGatePassed] = useState<boolean | null>(null);
  const [gateReason, setGateReason] = useState<string | null>(null);

  const [propertyAddress, setPropertyAddress] = useState("");
  const [hoaAnswer, setHoaAnswer] = useState("");
  const [historicDistrictAnswer, setHistoricDistrictAnswer] = useState("");

  const [renderItems, setRenderItems] = useState<RenderItem[]>([]);

  const [logo, setLogo] = useState<File | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    if (file.size > HOUSE_PHOTO_MAX_MB * 1024 * 1024) {
      setPhotoError(
        `That file is too large (max ${HOUSE_PHOTO_MAX_MB}MB). Please choose a smaller photo.`
      );
      e.target.value = "";
      return;
    }

    setPhotoError(null);
    setPhoto(file);
    setCurbappealPhotoKey(null);
    setPhotoStatus("checking");
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));

    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/photo-check", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as {
        valid: boolean;
        key?: string;
        reason?: string;
        gatePassed?: boolean | null;
        gateReason?: string;
      };

      setGatePassed(data.gatePassed ?? null);
      setGateReason(data.gateReason ?? null);

      if (data.valid && data.key) {
        setPhotoStatus("valid");
        setCurbappealPhotoKey(data.key);
      } else {
        setPhotoStatus("invalid");
        setPhotoError(data.reason ?? "That photo couldn't be verified.");
      }
    } catch {
      setPhotoStatus("invalid");
      setPhotoError("Upload failed — check your connection and try again.");
    }
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > LOGO_MAX_MB * 1024 * 1024) {
      setLogoError(
        `That file is too large (max ${LOGO_MAX_MB}MB). Please choose a smaller file.`
      );
      e.target.value = "";
      return;
    }
    setLogoError(null);
    setLogo(file);
    setLogoName(file ? file.name : null);
  }

  function addRenderRow(tier: RenderTier) {
    setRenderItems((rows) => {
      if (rows.filter((r) => r.tier === tier).length >= MAX_RENDERS_PER_TIER) return rows;
      return [
        ...rows,
        {
          id: crypto.randomUUID(),
          tier,
          styleName: "",
          customText: "",
          extras: emptyExtras(),
          seasonChoice: "",
          holidayChoice: "",
          breakdown: false,
          collapsed: false,
        },
      ];
    });
  }

  function removeRenderRow(id: string) {
    setRenderItems((rows) => rows.filter((r) => r.id !== id));
  }

  function toggleRowCollapsed(id: string) {
    setRenderItems((rows) =>
      rows.map((r) => (r.id === id ? { ...r, collapsed: !r.collapsed } : r))
    );
  }

  function updateRowStyleName(id: string, styleName: string) {
    setRenderItems((rows) =>
      rows.map((r) => (r.id === id ? { ...r, styleName } : r))
    );
  }

  function updateRowCustomText(id: string, text: string) {
    setRenderItems((rows) =>
      rows.map((r) =>
        r.id === id ? { ...r, customText: text.slice(0, PREMIUM_CHAR_LIMIT) } : r
      )
    );
  }

  function toggleRowExtra(id: string, key: ExtraKey) {
    setRenderItems((rows) =>
      rows.map((r) =>
        r.id === id
          ? { ...r, extras: { ...r.extras, [key]: !r.extras[key] } }
          : r
      )
    );
  }

  function updateRowSeasonChoice(id: string, value: string) {
    setRenderItems((rows) =>
      rows.map((r) => (r.id === id ? { ...r, seasonChoice: value } : r))
    );
  }

  function updateRowHolidayChoice(id: string, value: string) {
    setRenderItems((rows) =>
      rows.map((r) => (r.id === id ? { ...r, holidayChoice: value } : r))
    );
  }

  function toggleRowBreakdown(id: string) {
    setRenderItems((rows) =>
      rows.map((r) => (r.id === id ? { ...r, breakdown: !r.breakdown } : r))
    );
  }

  const lineItems = useMemo(() => {
    const items: { label: string; amount: number }[] = [];

    renderItems.forEach((row, i) => {
      const tierLabel = TIER_LABELS[row.tier];
      const name =
        row.tier === "self_directed"
          ? row.styleName || `${tierLabel} render #${i + 1}`
          : `${tierLabel} render #${i + 1}`;
      items.push({ label: name, amount: RENDER_PRICE[row.tier] });

      for (const key of EXTRA_KEYS) {
        if (row.extras[key]) {
          items.push({
            label: `${EXTRA_LABELS[key]} — ${name}`,
            amount: EXTRA_PRICE,
          });
        }
      }
      if (row.breakdown) {
        items.push({
          label: `${STRUCTURAL_BREAKDOWN_LABEL} — ${name}`,
          amount: STRUCTURAL_BREAKDOWN_PRICE,
        });
      }
    });

    if (logo) {
      items.push({ label: "Add Your Logo", amount: LOGO_PRICE });
    }

    return items;
  }, [renderItems, logo]);

  const total = lineItems.reduce((sum, i) => sum + i.amount, 0);

  const renderItemsValid =
    renderItems.length > 0 &&
    renderItems.every((row) => {
      if (row.tier === "self_directed") return !!row.styleName;
      if (row.tier === "premium") return !!row.customText.trim();
      return true; // curated has nothing to fill in up front
    });

  async function handleContinueFromForm() {
    setCreatingOrder(true);
    setOrderCreateError(null);
    try {
      const payload = {
        curbappealPhotoKey,
        propertyAddress,
        hoaAnswer,
        historicDistrictAnswer,
        gatePassed,
        gateReason,
        renderItems: renderItems.map((row) => ({
          tier: row.tier,
          styleName: row.tier === "self_directed" ? row.styleName : undefined,
          customText: row.tier === "premium" ? row.customText : undefined,
          night: row.extras.night,
          seasonal: row.extras.seasonal,
          seasonChoice: row.seasonChoice,
          holiday: row.extras.holiday,
          holidayChoice: row.holidayChoice,
          breakdown: row.breakdown,
        })),
        logoSelected: !!logo,
        total,
      };
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { orderId: string; status: string };
      setOrderId(data.orderId);
      setOrderStatus(data.status);
      setStep("disclosure");
    } catch {
      setOrderCreateError(
        "Could not save your order — check your connection and try again."
      );
    } finally {
      setCreatingOrder(false);
    }
  }

  async function handleAcceptDisclosure() {
    if (!orderId) return;
    await fetch("/api/order", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, acceptDisclosure: true }),
    });
    setStep("order-check");
  }

  // Order-check: placeholder final review — marks the order verified, then
  // moves on. Real review logic (Gate 0/1 results, feasibility, etc.) goes
  // here once it exists.
  useEffect(() => {
    if (step !== "order-check" || !orderId) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/order", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, status: "verified" }),
        });
        const data = (await res.json()) as { status?: string };
        setOrderStatus(data.status ?? "verified");
      } finally {
        setStep("daily-intake");
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [step, orderId]);

  async function startCheckout(id: string) {
    setCheckoutError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id }),
      });
      if (!res.ok) throw new Error("checkout failed");
      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error("no checkout url");
      window.location.href = data.url;
    } catch {
      setCheckoutError(
        "Couldn't start checkout — check your connection and try again."
      );
      setStep("checkout-error");
    }
  }

  // Daily-intake: an atomic reserve against today's cap (lib/capacity.ts),
  // then straight to Stripe hosted Checkout. Reaching the cap doesn't block
  // checkout — see the route's own note — it just changes the message.
  useEffect(() => {
    if (step !== "daily-intake" || !orderId) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/order", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, status: "queued", checkCapacity: true }),
        });
        const data = (await res.json()) as {
          status?: string;
          capacity?: { reserved: boolean; position: number | null; cap: number } | null;
        };
        setOrderStatus(data.status ?? "queued");
        if (data.capacity) setQueueInfo(data.capacity);
      } finally {
        startCheckout(orderId);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [step, orderId]);

  // Landing back from Stripe: ?checkout=success carries the Checkout Session
  // id to confirm against Stripe/D1; ?checkout=cancelled just returns the
  // customer to a retry screen. orderId is re-seeded from the URL since the
  // redirect is a fresh page load with no client state.
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const orderParam = searchParams.get("order");
    const sessionId = searchParams.get("session_id");
    if (!checkout || !orderParam) return;

    setOrderId(orderParam);

    if (checkout === "success" && sessionId) {
      setStep("payment-success");
      setConfirmingPayment(true);
      fetch(`/api/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`)
        .then((res) => res.json() as Promise<{ paid?: boolean; status?: string }>)
        .then((data) => {
          setOrderStatus(data.status ?? (data.paid ? "placed" : "started"));
        })
        .catch(() => {})
        .finally(() => setConfirmingPayment(false));
    } else if (checkout === "cancelled") {
      setStep("payment-cancelled");
    }
  }, [searchParams]);

  if (step === "disclosure") {
    return (
      <>
        <SiteHeader />
        <div className="flow-page">
          <div className="flow-wrap">
            <div className="eyebrow">Before You Continue</div>
            <h1>The AI Disclosure</h1>
            <p>
              Please read this in full — it explains exactly what these
              visualizations are, and aren&apos;t.
            </p>

            <div className="disclosure-card">
              <p>{AI_DISCLOSURE_TEXT}</p>

              <div className="disclosure-check">
                <input
                  type="checkbox"
                  id="disclosure-accept"
                  checked={disclosureAccepted}
                  onChange={() => setDisclosureAccepted((v) => !v)}
                />
                <label htmlFor="disclosure-accept">
                  I have read, understood, and accept this disclosure.
                </label>
              </div>
            </div>

            <button
              type="button"
              className="cfg-continue"
              disabled={!disclosureAccepted}
              onClick={handleAcceptDisclosure}
            >
              Continue
            </button>
          </div>
        </div>
      </>
    );
  }

  if (step === "order-check") {
    return (
      <>
        <SiteHeader />
        <div className="flow-page">
          <div className="flow-wrap">
            <div className="flow-spinner" />
            <h1>Order Check</h1>
            <p>This is where your order gets a final review before payment.</p>
            <div className="flow-note">Not built yet.</div>
          </div>
        </div>
      </>
    );
  }

  if (step === "daily-intake") {
    return (
      <>
        <SiteHeader />
        <div className="flow-page">
          <div className="flow-wrap">
            <div className="flow-spinner" />
            <h1>Checking Availability</h1>
            <p>
              Confirming there&apos;s room to start your order, then sending
              you to secure checkout.
            </p>
            {queueInfo && (
              <div className="flow-note">
                {queueInfo.reserved
                  ? `You're order #${queueInfo.position} in today's queue (cap ${queueInfo.cap}/day).`
                  : "Today's queue is full — you'll be first up next business day."}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  if (step === "checkout-error") {
    return (
      <>
        <SiteHeader />
        <div className="flow-page">
          <div className="flow-wrap">
            <h1>Checkout Couldn&apos;t Start</h1>
            <p>{checkoutError ?? "Something went wrong starting checkout."}</p>
            <button
              type="button"
              className="cfg-continue"
              onClick={() => orderId && startCheckout(orderId)}
            >
              Try Again
            </button>
          </div>
        </div>
      </>
    );
  }

  if (step === "payment-success") {
    return (
      <>
        <SiteHeader />
        <div className="flow-page">
          <div className="flow-wrap">
            {confirmingPayment ? (
              <>
                <div className="flow-spinner" />
                <h1>Confirming Your Payment&hellip;</h1>
                <p>One moment while we verify your payment with Stripe.</p>
              </>
            ) : (
              <>
                <h1>You&apos;re All Set!</h1>
                <p>
                  Your payment went through and your order is placed. We&apos;ll
                  review your photo and start on your curated styles —
                  typically 1–2 business days.
                </p>
                {orderId && (
                  <div className="flow-note">
                    Order <code>{orderId}</code> — status:{" "}
                    <code>{orderStatus}</code>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  if (step === "payment-cancelled") {
    return (
      <>
        <SiteHeader />
        <div className="flow-page">
          <div className="flow-wrap">
            <h1>Checkout Cancelled</h1>
            <p>
              No charge was made. You can pick up right where you left off
              whenever you&apos;re ready.
            </p>
            {checkoutError && <div className="cfg-error">{checkoutError}</div>}
            <button
              type="button"
              className="cfg-continue"
              onClick={() => orderId && startCheckout(orderId)}
            >
              Return to Checkout
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <div className="configurator">
      <div className="head">
        <div className="eyebrow">Start Your Order</div>
        <h1>Upload Your Photo &amp; Build Your Order</h1>
        <p>
          Upload one photo, then add however many renders you want in each
          tier — mix Self-Directed, Curated, and Premium freely, plus
          seasonal touches or your own logo, all at once.
        </p>
      </div>

      <div className="layout">
        <div>
          {/* ---------------- PHOTO UPLOAD ---------------- */}
          <div className="cfg-card">
            <div className="cfg-two-col">
              <div>
                <h2>Your Home&apos;s Photo</h2>
                <p className="cfg-sub">
                  A clear daytime photo of the front exterior — whole house,
                  straight-on, unobstructed.
                </p>
              </div>
              <div>
                <label className="cfg-drop">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                  />
                  <div className="cfg-drop-label">
                    {photo ? "Choose a Different Photo" : "Click to Upload a Photo"}
                  </div>
                  <div className="cfg-drop-hint">
                    JPG, PNG, or WEBP, front exterior only — max {HOUSE_PHOTO_MAX_MB}MB
                  </div>
                </label>
                {photoError && <div className="cfg-error">{photoError}</div>}
                {photoPreview && (
                  <>
                    <div className="cfg-preview">
                      <img src={photoPreview} alt="Uploaded home preview" />
                    </div>
                    <div className="cfg-filename">
                      {photo?.name} ({photo && formatFileSize(photo.size)})
                    </div>
                    {photoStatus === "checking" && (
                      <div className="cfg-photo-status cfg-photo-checking">
                        <span className="cfg-mini-spinner" />
                        Uploading and verifying&hellip;
                      </div>
                    )}
                    {photoStatus === "valid" && (
                      <div className="cfg-photo-status cfg-photo-valid">
                        ✓ Photo verified
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ---------------- PROPERTY DETAILS ---------------- */}
          <div className="cfg-card">
            <h2>Property Details</h2>
            <p className="cfg-sub">
              Helps us check zoning, historic-overlay, and feasibility
              questions before we start.
            </p>
            <AddressAutocomplete
              value={propertyAddress}
              onChange={setPropertyAddress}
            />
            <select
              className="cfg-sub-select"
              style={{ marginBottom: "12px" }}
              value={hoaAnswer}
              onChange={(e) => setHoaAnswer(e.target.value)}
            >
              <option value="">Is this property in an HOA?&hellip;</option>
              <option value="yes">Yes, it&apos;s in an HOA</option>
              <option value="no">No HOA</option>
              <option value="not_sure">Not sure</option>
            </select>
            <select
              className="cfg-sub-select"
              value={historicDistrictAnswer}
              onChange={(e) => setHistoricDistrictAnswer(e.target.value)}
            >
              <option value="">Is this in a historic district?&hellip;</option>
              <option value="yes">Yes, it&apos;s in a historic district</option>
              <option value="no">Not in a historic district</option>
              <option value="not_sure">Not sure</option>
            </select>
          </div>

          {/* ---------------- RENDER TIERS ---------------- */}
          <div className="cfg-tiers-grid">
          {RENDER_TIERS.map((tier) => {
            const rows = renderItems.filter((r) => r.tier === tier);
            return (
              <div className="cfg-card" key={tier}>
                <div className="cfg-tier-head">
                  <h2>{TIER_LABELS[tier]}</h2>
                  <span className="cfg-tier-price">
                    {money(RENDER_PRICE[tier])}
                    <span className="cfg-tier-unit"> / render</span>
                  </span>
                </div>
                <p className="cfg-sub">{TIER_DESCRIPTIONS[tier]}</p>

                {rows.map((row, i) => (
                  <div className="cfg-style-row" key={row.id}>
                    <div className="cfg-row-title-bar">
                      <div className="cfg-row-title">
                        {TIER_LABELS[tier]} render #{i + 1}
                        <InfoBubble text={TIER_DESCRIPTIONS[tier]} />
                      </div>
                      <button
                        type="button"
                        className="cfg-row-toggle"
                        onClick={() => toggleRowCollapsed(row.id)}
                        aria-label={row.collapsed ? "Expand this render" : "Collapse this render"}
                      >
                        {row.collapsed ? "▼" : "▲"}
                      </button>
                    </div>

                    {!row.collapsed && (
                      <>
                        <button
                          type="button"
                          className="cfg-remove"
                          onClick={() => removeRenderRow(row.id)}
                        >
                          Remove
                        </button>

                        {tier === "self_directed" && (
                          <select
                            value={row.styleName}
                            onChange={(e) => updateRowStyleName(row.id, e.target.value)}
                          >
                            <option value="">Select a style&hellip;</option>
                            {STYLE_FAMILIES.map((fam) => (
                              <optgroup key={fam.family} label={fam.family}>
                                {fam.styles.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        )}

                        {tier === "self_directed" && row.styleName && (
                          <StyleDescription styleName={row.styleName} />
                        )}

                        {tier === "premium" && (
                          <>
                            <textarea
                              className="cfg-textarea"
                              value={row.customText}
                              onChange={(e) => updateRowCustomText(row.id, e.target.value)}
                              placeholder="Describe the specific style, era, or details you want..."
                            />
                            <div
                              className={`cfg-word-count${
                                row.customText.length >= PREMIUM_CHAR_LIMIT ? " cfg-word-warn" : ""
                              }`}
                            >
                              {row.customText.length} / {PREMIUM_CHAR_LIMIT} characters
                            </div>
                            <div className="cfg-warning">
                              Heads up: very extensive or highly detailed requests
                              can be harder to render faithfully — the more
                              specific and layered the description, the more
                              likely some details drift from exactly what you
                              pictured.
                            </div>
                          </>
                        )}

                        {EXTRA_KEYS.map((key) => (
                          <Fragment key={key}>
                            <div className="cfg-extra">
                              <input
                                type="checkbox"
                                id={`row-${row.id}-${key}`}
                                checked={row.extras[key]}
                                onChange={() => toggleRowExtra(row.id, key)}
                              />
                              <label htmlFor={`row-${row.id}-${key}`}>
                                <div className="cfg-extra-name">
                                  {EXTRA_LABELS[key]}
                                  <InfoBubble text="Applies to this render only" />
                                </div>
                              </label>
                              <div className="cfg-extra-price">{money(EXTRA_PRICE)}</div>
                            </div>

                            {key === "seasonal" && row.extras.seasonal && (
                              <select
                                className="cfg-sub-select"
                                value={row.seasonChoice}
                                onChange={(e) => updateRowSeasonChoice(row.id, e.target.value)}
                              >
                                <option value="">Choose a season&hellip;</option>
                                {SEASON_OPTIONS.map((s) => (
                                  <option key={s.value} value={s.value}>
                                    {s.label} — {s.description}
                                  </option>
                                ))}
                              </select>
                            )}

                            {key === "holiday" && row.extras.holiday && (
                              <select
                                className="cfg-sub-select"
                                value={row.holidayChoice}
                                onChange={(e) => updateRowHolidayChoice(row.id, e.target.value)}
                              >
                                <option value="">Choose a holiday&hellip;</option>
                                {HOLIDAY_OPTIONS.map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            )}
                          </Fragment>
                        ))}

                        <div className="cfg-extra">
                          <input
                            type="checkbox"
                            id={`row-${row.id}-breakdown`}
                            checked={row.breakdown}
                            onChange={() => toggleRowBreakdown(row.id)}
                          />
                          <label htmlFor={`row-${row.id}-breakdown`}>
                            <div className="cfg-extra-name">
                              {STRUCTURAL_BREAKDOWN_LABEL}
                              <InfoBubble text="An itemized list of what's structural vs. cosmetic for this render" />
                            </div>
                          </label>
                          <div className="cfg-extra-price">{money(STRUCTURAL_BREAKDOWN_PRICE)}</div>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  className="cfg-add-btn"
                  onClick={() => addRenderRow(tier)}
                  disabled={rows.length >= MAX_RENDERS_PER_TIER}
                >
                  {rows.length >= MAX_RENDERS_PER_TIER
                    ? `Maximum ${MAX_RENDERS_PER_TIER} reached`
                    : `+ Add a ${TIER_LABELS[tier]} Render (${money(RENDER_PRICE[tier])})`}
                </button>
              </div>
            );
          })}
          </div>

          {/* ---------------- LOGO ---------------- */}
          <div className="cfg-card">
            <div className="cfg-two-col">
              <div>
                <h2>Add Your Logo</h2>
                <p className="cfg-sub">
                  Your logo appears in the top-left of every delivered image,
                  alongside — not replacing — our own mark in the bottom-right.
                </p>
              </div>
              <div>
                <label className="cfg-drop">
                  <input type="file" accept="image/*" onChange={handleLogoChange} />
                  <div className="cfg-drop-label">
                    {logo ? "Choose a Different Logo" : "Click to Upload Your Logo"}
                  </div>
                  <div className="cfg-drop-hint">
                    {money(LOGO_PRICE)} — PNG with transparent background
                    recommended, max {LOGO_MAX_MB}MB
                  </div>
                </label>
                {logoError && <div className="cfg-error">{logoError}</div>}
                {logo && (
                  <div className="cfg-filename">
                    {logoName} ({formatFileSize(logo.size)})
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- ORDER SUMMARY ---------------- */}
        <div className="cfg-summary">
          <h3>Your Order</h3>
          {lineItems.map((item, i) => (
            <div className="cfg-line" key={i}>
              <span>{item.label}</span>
              <span className="cfg-line-amt">{money(item.amount)}</span>
            </div>
          ))}
          <div className="cfg-total">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>

          {orderCreateError && (
            <div className="cfg-error">{orderCreateError}</div>
          )}

          <button
            type="button"
            className="cfg-continue"
            disabled={
              photoStatus !== "valid" ||
              !propertyAddress.trim() ||
              !hoaAnswer ||
              !historicDistrictAnswer ||
              !renderItemsValid ||
              creatingOrder
            }
            onClick={handleContinueFromForm}
          >
            {creatingOrder ? "Saving Your Order…" : "Continue"}
          </button>
          <div className="cfg-continue-note">
            {photoStatus !== "valid"
              ? "Upload and verify your photo above to continue."
              : !propertyAddress.trim() || !hoaAnswer || !historicDistrictAnswer
                ? "Fill in your property details above to continue."
                : !renderItemsValid
                  ? "Add at least one render above to continue."
                  : "Next: the AI disclosure, an availability check, then secure checkout."}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
