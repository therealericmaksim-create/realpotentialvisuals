"use client";

import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { STYLE_FAMILIES } from "@/lib/styles";
import { AI_DISCLOSURE_TEXT } from "@/lib/disclosure";
import {
  STARTER_PRICE,
  STARTER_ORIGINAL_PRICE,
  ADD_STYLE_PRICE,
  PREMIUM_PRICE,
  LOGO_PRICE,
  PREMIUM_CHAR_LIMIT,
  HOUSE_PHOTO_MAX_MB,
  LOGO_MAX_MB,
  EXTRA_LABELS,
  EXTRA_STARTER_BUNDLE_PRICE,
  EXTRA_ADDITIONAL_STYLE_PRICE,
  SEASON_OPTIONS,
  HOLIDAY_OPTIONS,
  STRUCTURAL_BREAKDOWN_LABEL,
  STRUCTURAL_BREAKDOWN_PRICE,
  type ExtraKey,
} from "@/lib/pricing";

const EXTRA_KEYS: ExtraKey[] = ["night", "seasonal", "holiday"];

type Step =
  | "form"
  | "disclosure"
  | "order-check"
  | "daily-intake"
  | "checkout-error"
  | "payment-success"
  | "payment-cancelled";

type AdditionalStyle = {
  id: string;
  styleName: string;
  extras: Record<ExtraKey, boolean>;
  seasonChoice: string;
  holidayChoice: string;
  breakdown: boolean;
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
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [gatePassed, setGatePassed] = useState<boolean | null>(null);
  const [gateReason, setGateReason] = useState<string | null>(null);

  const [propertyAddress, setPropertyAddress] = useState("");
  const [hoaAnswer, setHoaAnswer] = useState("");
  const [historicDistrictAnswer, setHistoricDistrictAnswer] = useState("");

  const [starterExtras, setStarterExtras] =
    useState<Record<ExtraKey, boolean>>(emptyExtras());
  const [starterSeasonChoice, setStarterSeasonChoice] = useState("");
  const [starterHolidayChoice, setStarterHolidayChoice] = useState("");
  const [starterBreakdown, setStarterBreakdown] = useState(false);

  const [additionalStyles, setAdditionalStyles] = useState<AdditionalStyle[]>(
    []
  );

  const [premiumEnabled, setPremiumEnabled] = useState(false);
  const [premiumText, setPremiumText] = useState("");

  const [logo, setLogo] = useState<File | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const premiumCharCount = premiumText.length;

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
    setPhotoKey(null);
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
        setPhotoKey(data.key);
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

  function handlePremiumTextChange(text: string) {
    setPremiumText(text.slice(0, PREMIUM_CHAR_LIMIT));
  }

  function addStyleRow() {
    setAdditionalStyles((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        styleName: "",
        extras: emptyExtras(),
        seasonChoice: "",
        holidayChoice: "",
        breakdown: false,
      },
    ]);
  }

  function removeStyleRow(id: string) {
    setAdditionalStyles((rows) => rows.filter((r) => r.id !== id));
  }

  function updateStyleRow(id: string, styleName: string) {
    setAdditionalStyles((rows) =>
      rows.map((r) => (r.id === id ? { ...r, styleName } : r))
    );
  }

  function toggleStyleExtra(id: string, key: ExtraKey) {
    setAdditionalStyles((rows) =>
      rows.map((r) =>
        r.id === id
          ? { ...r, extras: { ...r.extras, [key]: !r.extras[key] } }
          : r
      )
    );
  }

  function updateRowSeasonChoice(id: string, value: string) {
    setAdditionalStyles((rows) =>
      rows.map((r) => (r.id === id ? { ...r, seasonChoice: value } : r))
    );
  }

  function updateRowHolidayChoice(id: string, value: string) {
    setAdditionalStyles((rows) =>
      rows.map((r) => (r.id === id ? { ...r, holidayChoice: value } : r))
    );
  }

  function toggleRowBreakdown(id: string) {
    setAdditionalStyles((rows) =>
      rows.map((r) => (r.id === id ? { ...r, breakdown: !r.breakdown } : r))
    );
  }

  const lineItems = useMemo(() => {
    const items: { label: string; amount: number }[] = [
      { label: "Starter Package", amount: STARTER_PRICE },
    ];

    for (const key of EXTRA_KEYS) {
      if (starterExtras[key]) {
        items.push({
          label: `${EXTRA_LABELS[key]} — all 3 Starter renders`,
          amount: EXTRA_STARTER_BUNDLE_PRICE[key],
        });
      }
    }

    if (starterBreakdown) {
      items.push({
        label: `${STRUCTURAL_BREAKDOWN_LABEL} — all 3 Starter renders`,
        amount: STRUCTURAL_BREAKDOWN_PRICE * 3,
      });
    }

    additionalStyles.forEach((row, i) => {
      const name = row.styleName || `Additional style #${i + 1}`;
      items.push({ label: name, amount: ADD_STYLE_PRICE });
      for (const key of EXTRA_KEYS) {
        if (row.extras[key]) {
          items.push({
            label: `${EXTRA_LABELS[key]} — ${name}`,
            amount: EXTRA_ADDITIONAL_STYLE_PRICE[key],
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

    if (premiumEnabled) {
      items.push({ label: "Premium Custom Style", amount: PREMIUM_PRICE });
    }

    if (logo) {
      items.push({ label: "Add Your Logo", amount: LOGO_PRICE });
    }

    return items;
  }, [starterExtras, starterBreakdown, additionalStyles, premiumEnabled, logo]);

  const total = lineItems.reduce((sum, i) => sum + i.amount, 0);

  async function handleContinueFromForm() {
    setCreatingOrder(true);
    setOrderCreateError(null);
    try {
      const payload = {
        photoKey,
        propertyAddress,
        hoaAnswer,
        historicDistrictAnswer,
        gatePassed,
        gateReason,
        starter: {
          night: starterExtras.night,
          seasonal: starterExtras.seasonal,
          seasonChoice: starterSeasonChoice,
          holiday: starterExtras.holiday,
          holidayChoice: starterHolidayChoice,
          breakdown: starterBreakdown,
        },
        additionalStyles: additionalStyles.map((row) => ({
          styleName: row.styleName,
          night: row.extras.night,
          seasonal: row.extras.seasonal,
          seasonChoice: row.seasonChoice,
          holiday: row.extras.holiday,
          holidayChoice: row.holidayChoice,
          breakdown: row.breakdown,
          unitPrice: ADD_STYLE_PRICE,
        })),
        premiumEnabled,
        premiumText,
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
          Your Starter Package is included automatically. Add extra styles,
          seasonal touches, a custom premium request, or your own logo below
          — all at once.
        </p>
      </div>

      <div className="layout">
        <div>
          {/* ---------------- PHOTO UPLOAD ---------------- */}
          <div className="cfg-card">
            <h2>Your Home&apos;s Photo</h2>
            <p className="cfg-sub">
              A clear daytime photo of the front exterior — whole house,
              straight-on, unobstructed.
            </p>
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
                JPG or PNG, front exterior only — max {HOUSE_PHOTO_MAX_MB}MB
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

          {/* ---------------- STARTER PACKAGE ---------------- */}
          <div className="cfg-card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <h2 style={{ marginBottom: 0 }}>Starter Package</h2>
              <span className="cfg-included">
                Included — <span className="cfg-price-was">{money(STARTER_ORIGINAL_PRICE)}</span>{" "}
                {money(STARTER_PRICE)}
              </span>
            </div>
            <p className="cfg-sub">
              3 professional visualizations, in styles our team hand-picks
              for your specific home and neighborhood — always included.
            </p>

            <p
              className="cfg-sub"
              style={{ fontWeight: 600, color: "var(--white)", marginBottom: "4px" }}
            >
              Want a themed look across your Starter renders?
            </p>
            <p className="cfg-sub" style={{ marginTop: 0 }}>
              This transforms your same 3 Starter images into night, seasonal,
              or holiday versions — it doesn&apos;t add extra renders.
              Selecting one now applies it to all 3, before you&apos;ve even
              seen which styles you&apos;ll get, at a bundled rate. Prefer to
              apply it to just one specific render instead? You can always do
              that later, once you&apos;ve received your 3 curated images, at
              the regular single-render price.
            </p>

            {EXTRA_KEYS.map((key) => (
              <Fragment key={key}>
                <div className="cfg-extra">
                  <input
                    type="checkbox"
                    id={`starter-${key}`}
                    checked={starterExtras[key]}
                    onChange={() =>
                      setStarterExtras((s) => ({ ...s, [key]: !s[key] }))
                    }
                  />
                  <label htmlFor={`starter-${key}`}>
                    <div className="cfg-extra-name">{EXTRA_LABELS[key]}</div>
                    <div className="cfg-extra-note">Applies to all 3 Starter renders</div>
                  </label>
                  <div className="cfg-extra-price">
                    {money(EXTRA_STARTER_BUNDLE_PRICE[key])}
                  </div>
                </div>

                {key === "seasonal" && starterExtras.seasonal && (
                  <select
                    className="cfg-sub-select"
                    value={starterSeasonChoice}
                    onChange={(e) => setStarterSeasonChoice(e.target.value)}
                  >
                    <option value="">Choose a season&hellip;</option>
                    {SEASON_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label} — {s.description}
                      </option>
                    ))}
                  </select>
                )}

                {key === "holiday" && starterExtras.holiday && (
                  <select
                    className="cfg-sub-select"
                    value={starterHolidayChoice}
                    onChange={(e) => setStarterHolidayChoice(e.target.value)}
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
                id="starter-breakdown"
                checked={starterBreakdown}
                onChange={() => setStarterBreakdown((v) => !v)}
              />
              <label htmlFor="starter-breakdown">
                <div className="cfg-extra-name">{STRUCTURAL_BREAKDOWN_LABEL}</div>
                <div className="cfg-extra-note">
                  An itemized list of what&apos;s structural vs. cosmetic, for
                  all 3 Starter renders
                </div>
              </label>
              <div className="cfg-extra-price">
                {money(STRUCTURAL_BREAKDOWN_PRICE * 3)}
              </div>
            </div>
          </div>

          {/* ---------------- ADDITIONAL STYLES ---------------- */}
          <div className="cfg-card">
            <h2>Add Your Own Style{additionalStyles.length > 1 ? "s" : ""}</h2>
            <p className="cfg-sub">
              Pick any style yourself — {money(ADD_STYLE_PRICE)} each. We&apos;ll
              tell you whether it&apos;s buildable or conceptual for your home
              when we deliver it.
            </p>

            {additionalStyles.map((row, i) => (
              <div className="cfg-style-row" key={row.id}>
                <div className="cfg-style-row-head">
                  <select
                    value={row.styleName}
                    onChange={(e) => updateStyleRow(row.id, e.target.value)}
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
                  <button
                    type="button"
                    className="cfg-remove"
                    onClick={() => removeStyleRow(row.id)}
                  >
                    Remove
                  </button>
                </div>

                {row.styleName && <StyleDescription styleName={row.styleName} />}

                {EXTRA_KEYS.map((key) => (
                  <Fragment key={key}>
                    <div className="cfg-extra">
                      <input
                        type="checkbox"
                        id={`row-${row.id}-${key}`}
                        checked={row.extras[key]}
                        onChange={() => toggleStyleExtra(row.id, key)}
                      />
                      <label htmlFor={`row-${row.id}-${key}`}>
                        <div className="cfg-extra-name">{EXTRA_LABELS[key]}</div>
                        <div className="cfg-extra-note">
                          Applies to style #{i + 1} only
                        </div>
                      </label>
                      <div className="cfg-extra-price">
                        {money(EXTRA_ADDITIONAL_STYLE_PRICE[key])}
                      </div>
                    </div>

                    {key === "seasonal" && row.extras.seasonal && (
                      <select
                        className="cfg-sub-select"
                        value={row.seasonChoice}
                        onChange={(e) =>
                          updateRowSeasonChoice(row.id, e.target.value)
                        }
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
                        onChange={(e) =>
                          updateRowHolidayChoice(row.id, e.target.value)
                        }
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
                    <div className="cfg-extra-name">{STRUCTURAL_BREAKDOWN_LABEL}</div>
                    <div className="cfg-extra-note">
                      An itemized list of what&apos;s structural vs. cosmetic
                      for style #{i + 1}
                    </div>
                  </label>
                  <div className="cfg-extra-price">
                    {money(STRUCTURAL_BREAKDOWN_PRICE)}
                  </div>
                </div>
              </div>
            ))}

            <button type="button" className="cfg-add-btn" onClick={addStyleRow}>
              + Add Additional Style ({money(ADD_STYLE_PRICE)})
            </button>
          </div>

          {/* ---------------- PREMIUM ---------------- */}
          <div className="cfg-card cfg-premium">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <h2 style={{ marginBottom: 0 }}>Something Specific?</h2>
              <span className="cfg-extra-price">{money(PREMIUM_PRICE)}</span>
            </div>
            <p className="cfg-sub">
              Extreme-complexity requests — a Roman villa, a pagoda roof, a
              full custom vision. Describe exactly what you want.
            </p>

            {!premiumEnabled ? (
              <button
                type="button"
                className="cfg-add-btn"
                onClick={() => setPremiumEnabled(true)}
              >
                + Add Premium Custom Style
              </button>
            ) : (
              <>
                <textarea
                  value={premiumText}
                  onChange={(e) => handlePremiumTextChange(e.target.value)}
                  placeholder="Describe the specific style, era, or details you want..."
                />
                <div
                  className={`cfg-word-count${
                    premiumCharCount >= PREMIUM_CHAR_LIMIT ? " cfg-word-warn" : ""
                  }`}
                >
                  {premiumCharCount} / {PREMIUM_CHAR_LIMIT} characters
                </div>
                <div className="cfg-warning">
                  Heads up: very extensive or highly detailed requests can be
                  harder to render faithfully — the more specific and
                  layered the description, the more likely some details
                  drift from exactly what you pictured.
                </div>
                <button
                  type="button"
                  className="cfg-remove"
                  style={{ marginTop: "12px" }}
                  onClick={() => {
                    setPremiumEnabled(false);
                    setPremiumText("");
                  }}
                >
                  Remove Premium Request
                </button>
              </>
            )}
          </div>

          {/* ---------------- LOGO ---------------- */}
          <div className="cfg-card">
            <h2>Add Your Logo</h2>
            <p className="cfg-sub">
              Your logo appears in the top-left of every delivered image,
              alongside — not replacing — our own mark in the bottom-right.
            </p>
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
                : "Next: the AI disclosure, an availability check, then secure checkout."}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
