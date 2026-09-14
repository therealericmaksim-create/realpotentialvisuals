"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { STYLE_FAMILIES, slugifyStyleName } from "@/lib/styles";
import {
  STARTER_PRICE,
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

// Shows an example render for the selected style once one exists at
// /public/images/styles/<slug>.jpg. Falls back to a plain placeholder —
// most styles don't have a real render yet.
function StylePreview({ styleName }: { styleName: string }) {
  const [failed, setFailed] = useState(false);
  const slug = slugifyStyleName(styleName);

  useEffect(() => setFailed(false), [styleName]);

  return (
    <div className="cfg-style-preview">
      {!failed ? (
        <img
          src={`/images/styles/${slug}.jpg`}
          alt={`Example ${styleName} render`}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="cfg-style-preview-placeholder">
          Example image coming soon for {styleName}
        </div>
      )}
      <p className="cfg-style-preview-note">
        Example only — actual output rendering may vary.
      </p>
    </div>
  );
}

export default function StartPage() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

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

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > HOUSE_PHOTO_MAX_MB * 1024 * 1024) {
      setPhotoError(
        `That file is too large (max ${HOUSE_PHOTO_MAX_MB}MB). Please choose a smaller photo.`
      );
      e.target.value = "";
      return;
    }
    setPhotoError(null);
    setPhoto(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
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
              </>
            )}
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
              <span className="cfg-included">Included — {money(STARTER_PRICE)}</span>
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

                {row.styleName && <StylePreview styleName={row.styleName} />}

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

          <button type="button" className="cfg-continue" disabled>
            Continue to Payment
          </button>
          <div className="cfg-continue-note">
            Checkout isn&apos;t wired up yet — this is a preview of the order
            builder only.
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
