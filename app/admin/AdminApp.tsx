"use client";

import { useEffect, useState, useCallback } from "react";
import { TIER_LABELS } from "@/lib/pricing";
import "./admin.css";

type StaffInfo = {
  name: string;
  roles: string[];
  isPrincipal: boolean;
};

type IdentityProfile = {
  staff: { name: string; email: string; roles: string[] };
  identity: { name: string | null; email: string | null; pictureUrl: string | null } | null;
};

type DashboardData = {
  awaitingAnalysis: number;
  awaitingCuration: number;
  awaitingQc: number;
  openRequests: number;
  openEscalations: number;
  todayIntake: number;
  dailyIntakeCap: number;
};

type NavStatus = "built" | "partial" | "planned";
type NavChild = { key: string; label: string; status: NavStatus };
type NavGroup = {
  key: string;
  label: string;
  color: string;
  priority?: number;
  v2?: boolean;
  badge?: keyof DashboardData;
  children: NavChild[];
};

const NAV: NavGroup[] = [
  { key: "orders", label: "Orders", color: "var(--ops)", badge: "awaitingAnalysis", children: [
    { key: "orders-list", label: "All Orders", status: "built" },
    { key: "orders-manual", label: "Manual Order", status: "planned" },
  ]},
  { key: "curation", label: "Curation", color: "var(--ops)", priority: 1, badge: "awaitingCuration", children: [
    { key: "curation-queue", label: "Curation Queue", status: "planned" },
    { key: "curation-workspace", label: "Job Curation Workspace", status: "planned" },
  ]},
  { key: "production", label: "Production", color: "var(--ops)", priority: 2, children: [
    { key: "production-worksheet", label: "Daily Worksheet", status: "planned" },
    { key: "production-materials", label: "Material Selections", status: "planned" },
    { key: "production-prompts", label: "Prompt History", status: "planned" },
    { key: "production-renders", label: "Render Iterations", status: "planned" },
  ]},
  { key: "qc", label: "Quality Control", color: "var(--exec)", priority: 3, badge: "awaitingQc", children: [
    { key: "qc-queue", label: "QC Queue", status: "planned" },
    { key: "qc-history", label: "Approved / Rejected", status: "planned" },
    { key: "qc-delivered", label: "Delivered", status: "planned" },
  ]},
  { key: "requests", label: "Requests & Escalations", color: "var(--ops)", priority: 4, badge: "openRequests", children: [
    { key: "requests-queue", label: "Custom & Premium Requests", status: "planned" },
    { key: "escalations-queue", label: "Escalations", status: "planned" },
  ]},
  { key: "finance", label: "Finance", color: "var(--fin)", priority: 5, children: [
    { key: "finance-payments", label: "Payments", status: "planned" },
    { key: "finance-refunds", label: "Refunds", status: "planned" },
    { key: "finance-chargebacks", label: "Chargebacks & Disputes", status: "planned" },
    { key: "finance-payouts", label: "Contractor Payouts", status: "planned" },
  ]},
  { key: "users", label: "Users", color: "var(--exec)", children: [
    { key: "users-all", label: "All Users", status: "built" },
  ]},
  { key: "settings", label: "Settings", color: "var(--exec)", priority: 6, children: [
    { key: "settings-pricing", label: "Pricing & Packages", status: "planned" },
    { key: "settings-disclosure", label: "Disclosure Copy Version", status: "planned" },
    { key: "settings-intake-cap", label: "Daily Intake Cap", status: "planned" },
    { key: "settings-config", label: "General Config", status: "planned" },
  ]},
  { key: "contests", label: "Contests", color: "var(--mkt)", v2: true, children: [
    { key: "contests-mgmt", label: "Contest Management", status: "planned" },
    { key: "contests-entries", label: "Entries Review", status: "planned" },
    { key: "contests-voting", label: "Voting Controls", status: "planned" },
  ]},
  { key: "catalog", label: "Catalog", color: "var(--eng)", v2: true, children: [
    { key: "catalog-styles", label: "Style Catalog Editor", status: "planned" },
    { key: "catalog-materials", label: "Materials & Elements", status: "planned" },
    { key: "catalog-compat", label: "Style Compatibility (view)", status: "planned" },
  ]},
  { key: "reports", label: "Reports & Audit", color: "var(--exec)", v2: true, children: [
    { key: "reports-metrics", label: "Metrics Dashboard", status: "planned" },
    { key: "reports-audit", label: "Audit Log Viewer", status: "planned" },
  ]},
];

function StatusTag({ status }: { status: NavStatus }) {
  const label = status === "built" ? "Built" : status === "partial" ? "Partial" : "Planned";
  return <span className={`status-tag status-${status}`}>{label}</span>;
}

export default function AdminApp({ staff }: { staff: StaffInfo }) {
  const [openGroup, setOpenGroup] = useState<string | null>("orders");
  const [section, setSection] = useState<string>("dashboard");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [identity, setIdentity] = useState<IdentityProfile["identity"]>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [orderSearch, setOrderSearch] = useState("");

  const loadDashboard = useCallback(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json() as Promise<DashboardData>)
      .then((d) => setDashboard(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Real Google login name/photo — fetched once here (not baked into
  // every /api/admin/* request, see lib/access.ts's header comment for
  // why that regressed other routes). Falls back to the DB name/initials
  // if Cloudflare Access's identity endpoint doesn't return one.
  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json() as Promise<IdentityProfile>)
      .then((d) => setIdentity(d.identity))
      .catch(() => {});
  }, []);

  function toggleGroup(key: string) {
    setOpenGroup((cur) => (cur === key ? null : key));
  }

  function goTo(childKey: string) {
    setSection(childKey);
    setSelectedOrderId(null);
  }

  function openOrder(id: string) {
    setSelectedOrderId(id);
    setSection("order-detail");
  }

  function runSearch() {
    // Orders is the only real, searchable dataset today — everything
    // else in the nav is still a placeholder with nothing to search.
    setOrderSearch(searchQuery.trim());
    setOpenGroup("orders");
    goTo("orders-list");
  }

  const displayName = identity?.name || staff.name;
  const pictureUrl = identity?.pictureUrl ?? null;
  const initials = displayName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const capPct = dashboard && dashboard.dailyIntakeCap > 0
    ? Math.min(100, Math.round((dashboard.todayIntake / dashboard.dailyIntakeCap) * 100))
    : 0;

  return (
    <div className="rpv-admin">
      <div className="shell">
        <header>
          <button className="brand" onClick={() => goTo("dashboard")}>
            <span className="dot" />
            RealPotential Visuals
          </button>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch();
            }}
          >
            <input
              type="text"
              placeholder="Search orders…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="search-btn" aria-label="Search">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="6" cy="6" r="4.5" />
                <path d="M9.5 9.5L13 13" />
              </svg>
            </button>
          </form>
          <div className="header-right">
            <div className="cap-indicator" title="Today's intake vs. daily cap">
              <span className="lbl">Intake</span>
              <div className="cap-track">
                <div className="cap-fill" style={{ width: `${capPct}%` }} />
              </div>
              <span className="cap-num">
                {dashboard ? `${dashboard.todayIntake}/${dashboard.dailyIntakeCap}` : "—"}
              </span>
            </div>
            <div className="bell">
              {(dashboard?.openEscalations ?? 0) > 0 && <span className="pip" />}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 2a4 4 0 0 0-4 4v2.5L2.5 11h11L12 8.5V6a4 4 0 0 0-4-4Z" />
                <path d="M6.5 13a1.5 1.5 0 0 0 3 0" />
              </svg>
            </div>
            <div className="staff-badge">
              {pictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="avatar" src={pictureUrl} alt={displayName} />
              ) : (
                <span className="avatar">{initials}</span>
              )}
              <div>
                <div className="name">{displayName}</div>
                <div className="role">{(staff.roles.join(", ") || "no role").toUpperCase()}</div>
              </div>
            </div>
          </div>
        </header>

        <aside>
          <div className="nav-group open">
            <button
              className={`nav-head${section === "dashboard" ? " active-branch" : ""}`}
              style={{ borderLeftColor: "var(--text-faint)" }}
              onClick={() => goTo("dashboard")}
            >
              <span>Dashboard</span>
            </button>
          </div>

          {NAV.map((group) => (
            <div key={group.key} className={`nav-group${openGroup === group.key ? " open" : ""}`}>
              <button
                className="nav-head"
                style={{ borderLeftColor: group.color }}
                onClick={() => toggleGroup(group.key)}
              >
                {group.priority && <span className="priority-pip">{group.priority}</span>}
                <span>{group.label}</span>
                {group.v2 && <span className="status-tag status-planned" style={{ marginLeft: 8 }}>V2</span>}
                {group.badge && dashboard && dashboard[group.badge] > 0 && (
                  <span className="nav-badge hot">{dashboard[group.badge]}</span>
                )}
                <span className="chev">▶</span>
              </button>
              <div className="nav-sub">
                {group.children.map((child) => (
                  <button
                    key={child.key}
                    className={section === child.key ? "active" : ""}
                    onClick={() => goTo(child.key)}
                  >
                    {child.label}
                    <StatusTag status={child.status} />
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="sidebar-foot">
            <p>
              Solo operation — every screen is visible to every login. Role colours mark future ownership, not a
              current permission wall.
            </p>
          </div>
        </aside>

        <main>
          {section === "dashboard" && <DashboardSection dashboard={dashboard} onNavigate={goTo} />}
          {section === "orders-list" && (
            <OrdersListSection
              onOpenOrder={openOrder}
              initialQuery={orderSearch}
              onQueryConsumed={() => setOrderSearch("")}
            />
          )}
          {section === "order-detail" && selectedOrderId && (
            <OrderDetailSection orderId={selectedOrderId} onBack={() => goTo("orders-list")} onRan={loadDashboard} />
          )}
          {section === "users-all" && <UsersSection isPrincipal={staff.isPrincipal} />}
          {!["dashboard", "orders-list", "order-detail", "users-all"].includes(section) && (
            <PlaceholderSection sectionKey={section} />
          )}
        </main>
      </div>
    </div>
  );
}

function DashboardSection({
  dashboard,
  onNavigate,
}: {
  dashboard: DashboardData | null;
  onNavigate: (key: string) => void;
}) {
  const cards: { label: string; value: number | string; sub: string; tone: "" | "warn" | "alert"; go: string }[] = [
    {
      label: "Awaiting Analysis",
      value: dashboard?.awaitingAnalysis ?? "—",
      sub: "Paid, Phase 2 not yet run",
      tone: (dashboard?.awaitingAnalysis ?? 0) > 0 ? "alert" : "",
      go: "orders-list",
    },
    {
      label: "Awaiting Curation",
      value: dashboard?.awaitingCuration ?? "—",
      sub: "The core differentiator — not yet built",
      tone: (dashboard?.awaitingCuration ?? 0) > 0 ? "warn" : "",
      go: "curation-queue",
    },
    {
      label: "Awaiting QC",
      value: dashboard?.awaitingQc ?? "—",
      sub: "Renders pending review before delivery",
      tone: "",
      go: "qc-queue",
    },
    {
      label: "Open Requests",
      value: dashboard?.openRequests ?? "—",
      sub: "Custom / Premium, needs a quote",
      tone: (dashboard?.openRequests ?? 0) > 0 ? "warn" : "",
      go: "requests-queue",
    },
    {
      label: "Open Escalations",
      value: dashboard?.openEscalations ?? "—",
      sub: (dashboard?.openEscalations ?? 0) > 0 ? "Needs attention" : "Nothing stuck right now",
      tone: (dashboard?.openEscalations ?? 0) > 0 ? "alert" : "",
      go: "escalations-queue",
    },
    {
      label: "Today's Intake",
      value: dashboard ? `${dashboard.todayIntake}/${dashboard.dailyIntakeCap}` : "—",
      sub: "Cap set in Settings · Daily Intake Cap",
      tone: "",
      go: "settings-intake-cap",
    },
  ];

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Dashboard</div>
        <h1>What needs you today</h1>
        <p>A queue view, not a report. Every card below is a real backlog item — click through to act on it.</p>
      </div>

      <div className="grid">
        {cards.map((c) => (
          <div key={c.label} className={`stat-card ${c.tone}`}>
            <div className="stat-top">
              <span className="stat-lbl">{c.label}</span>
            </div>
            <div className="stat-num">{c.value}</div>
            <div className="stat-sub">{c.sub}</div>
            <button className="stat-link" onClick={() => onNavigate(c.go)}>
              Go there →
            </button>
          </div>
        ))}
      </div>

      <div className="section-block">
        <h3>Build priority, in order</h3>
        <p className="note">Each row is where the next Claude Code session should look first.</p>
        <div className="empty-row"><span className="priority-pip">1</span> Curation workspace — the screen the business is actually about</div>
        <div className="empty-row"><span className="priority-pip">2</span> Production worksheet — where daily hands-on time is spent</div>
        <div className="empty-row"><span className="priority-pip">3</span> Quality Control — a distinct pass, never folded into Production</div>
        <div className="empty-row"><span className="priority-pip">4</span> Requests &amp; Escalations — no landing spot exists today</div>
        <div className="empty-row"><span className="priority-pip">5</span> Finance — refunds and chargeback evidence, cheap now, expensive later</div>
        <div className="empty-row"><span className="priority-pip">6</span> Settings — pricing, disclosure, and intake cap out of hardcoded values</div>
        <div className="empty-row"><span className="status-tag status-planned">V2</span> Contests, Catalog, Reports &amp; Audit — real, but none block delivery</div>
      </div>
    </>
  );
}

type OrderListRow = {
  id: string;
  status: string;
  property_address: string | null;
  customer_email: string | null;
  job_id: string | null;
  created_at: string;
};

function OrdersListSection({
  onOpenOrder,
  initialQuery,
  onQueryConsumed,
}: {
  onOpenOrder: (id: string) => void;
  initialQuery: string;
  onQueryConsumed: () => void;
}) {
  const [orders, setOrders] = useState<OrderListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    fetch("/api/admin/orders")
      .then(async (r) => {
        const text = await r.text();
        let parsed: { orders?: OrderListRow[]; error?: string } | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          // Not JSON at all — almost always means something between the
          // browser and this route returned an HTML page instead (a
          // Cloudflare Access re-auth redirect, or an edge error page)
          // rather than the route ever actually running. Show the raw
          // status and a snippet instead of a generic message, since
          // that's the only way to tell which case this is.
          throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
        }
        if (!r.ok) {
          throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
        }
        return parsed as { orders: OrderListRow[] };
      })
      .then((d) => setOrders(d.orders ?? []))
      .catch((e: Error) => setError(`Failed to load orders: ${e.message}`));
  }, []);

  // Adopt a query the header search bar just ran, then let local edits
  // (typing in the box below) take over from there.
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      onQueryConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const q = query.trim().toLowerCase();
  const filtered =
    orders && q
      ? orders.filter(
          (o) =>
            o.id.toLowerCase().includes(q) ||
            (o.property_address ?? "").toLowerCase().includes(q) ||
            (o.customer_email ?? "").toLowerCase().includes(q) ||
            o.status.toLowerCase().includes(q)
        )
      : orders;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Orders</div>
        <h1>All Orders</h1>
        <p>Every order placed, most recent first.</p>
      </div>
      <div className="section-block">
        <input
          type="text"
          placeholder="Filter by address, email, status, or order id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 16, maxWidth: 420 }}
        />
        {error && <p className="error-text">{error}</p>}
        {!orders && !error && <p className="loading">Loading…</p>}
        {filtered && filtered.length === 0 && (
          <p className="loading">{q ? "No orders match that search." : "No orders yet."}</p>
        )}
        {filtered && filtered.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Address</th>
                <th>Customer</th>
                <th>Ready for analysis?</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => onOpenOrder(o.id)}>
                  <td>{o.id.slice(0, 8)}</td>
                  <td><span className="pill">{o.status}</span></td>
                  <td>{o.property_address ?? "—"}</td>
                  <td>{o.customer_email ?? "—"}</td>
                  <td>{o.job_id ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

type OrderRenderItem = {
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
};

type OrderDetail = {
  order: {
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
  };
  renderItems: OrderRenderItem[];
  analysis: { house_type: string; roof_form: string; massing_envelope: string } | null;
  consensus: {
    classification_status: string;
    primary_score_pct: number | null;
    secondary_score_pct: number | null;
    primary_name: string | null;
    secondary_name: string | null;
  } | null;
  topMatches: { name: string; combined_score_pct: number; fit_tier: string }[];
  regulatory: { zoning_district: string | null; historic_overlay: number | null; flood_zone: string | null; summary: string } | null;
  neighborhood: { style_read: string; homes_visible: number; street_view_key: string | null } | null;
};

function OrderDetailSection({
  orderId,
  onBack,
  onRan,
}: {
  orderId: string;
  onBack: () => void;
  onRan: () => void;
}) {
  const [data, setData] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/admin/orders/${orderId}`)
      .then(async (r) => {
        const text = await r.text();
        let parsed: (OrderDetail & { error?: string }) | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
        return parsed as OrderDetail;
      })
      .then((d) => setData(d))
      .catch((e: Error) => setError(`Failed to load order: ${e.message}`));
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAnalysis() {
    setRunning(true);
    try {
      await fetch(`/api/admin/orders/${orderId}/run-analysis`, { method: "POST" });
      load();
      onRan();
    } finally {
      setRunning(false);
    }
  }

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="loading">Loading…</p>;

  const { order, renderItems, analysis, consensus, topMatches, regulatory, neighborhood } = data;
  const total = (order.total_amount_cents / 100).toFixed(2);

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to Orders</button>
      <div className="page-head">
        <div className="eyebrow">Order {order.id.slice(0, 8)}</div>
        <h1>{order.property_address}</h1>
        <p>{order.customer_email ?? "no email"} — status: {order.status} — ${total} — placed {new Date(order.created_at).toLocaleString()}</p>
      </div>

      {order.curbappeal_photo_key && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="detail-photo" src={`/api/admin/media/${order.curbappeal_photo_key}`} alt="Uploaded property photo" />
      )}

      <div className="section-block">
        <h3>Intake</h3>
        <p className="note">HOA: {order.hoa_answer ?? "not answered"}</p>
        <p className="note">Historic district: {order.historic_district_answer ?? "not answered"}</p>
        <p className="note">
          Logo:{" "}
          {order.logo_key ? (
            <a href={`/api/admin/media/${order.logo_key}`} target="_blank" rel="noreferrer">
              view uploaded logo
            </a>
          ) : (
            "none uploaded"
          )}
        </p>
      </div>

      <div className="section-block">
        <h3>Renders Ordered ({renderItems.length})</h3>
        {renderItems.length === 0 && <p className="note">No render items on this order.</p>}
        {renderItems.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Style / Request</th>
                <th>Extras</th>
                <th>Breakdown</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {renderItems.map((item, i) => {
                const extras: string[] = [];
                if (item.night) extras.push("Night View");
                if (item.seasonal) extras.push(`Seasonal (${item.season_choice ?? "—"})`);
                if (item.holiday) extras.push(`Holiday (${item.holiday_choice ?? "—"})`);
                return (
                  <tr key={i}>
                    <td>{TIER_LABELS[item.tier as keyof typeof TIER_LABELS] ?? item.tier}</td>
                    <td>
                      {item.tier === "premium"
                        ? item.custom_text || "—"
                        : item.style_name || (item.tier === "curated" ? "not yet assigned" : "—")}
                    </td>
                    <td>{extras.length > 0 ? extras.join(", ") : "—"}</td>
                    <td>{item.breakdown ? "yes" : "no"}</td>
                    <td>${(item.unit_price_cents / 100).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!order.job_id && (
        <p className="error-text">No property/job linkage yet — this order hasn&apos;t completed payment confirmation.</p>
      )}

      {order.job_id && (
        <button className="btn-primary" onClick={runAnalysis} disabled={running}>
          {running ? "Running…" : analysis ? "Re-run Analysis" : "Run Analysis"}
        </button>
      )}

      {analysis && (
        <div className="section-block" style={{ marginTop: 20 }}>
          <h3>Structure</h3>
          <p className="note">{analysis.house_type} — {analysis.roof_form} roof — {analysis.massing_envelope}</p>

          {consensus && (
            <>
              <h3 style={{ marginTop: 16 }}>Consensus</h3>
              <p className="note">
                {consensus.primary_name} ({consensus.primary_score_pct}%)
                {consensus.secondary_name && ` / ${consensus.secondary_name} (${consensus.secondary_score_pct}%)`}
                {" — "}{consensus.classification_status}
              </p>
            </>
          )}

          {topMatches.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Top matches</h3>
              {topMatches.map((m, i) => (
                <div key={i} className="empty-row">{m.name} — {m.combined_score_pct}% ({m.fit_tier})</div>
              ))}
            </>
          )}

          {neighborhood && (
            <>
              <h3 style={{ marginTop: 16 }}>Neighborhood read</h3>
              <p className="note">{neighborhood.style_read}</p>
              {neighborhood.street_view_key && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="detail-photo"
                  src={`/api/admin/media/${neighborhood.street_view_key}`}
                  alt="Street View of the surrounding block"
                />
              )}
            </>
          )}

          {regulatory && (
            <>
              <h3 style={{ marginTop: 16 }}>Regulatory</h3>
              <p className="note">
                Zoning: {regulatory.zoning_district ?? "unknown"} — Historic overlay:{" "}
                {regulatory.historic_overlay === null ? "unknown" : regulatory.historic_overlay ? "yes" : "no"} — Flood zone: {regulatory.flood_zone ?? "unknown"}
              </p>
              <p className="note">{regulatory.summary}</p>
            </>
          )}
        </div>
      )}
    </>
  );
}

type StaffMemberRow = {
  id: string;
  name: string;
  email: string;
  active: number;
  roles: { staffRoleId: string; name: string }[];
};

const ALL_ROLES = [
  "principal", "quality_controller", "router", "curator", "designer",
  "client_liaison", "content_lead", "channel_lead", "systems_engineer",
  "prompt_engineer", "bookkeeper", "compliance_officer",
];

function RoleCheckboxes({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (role: string, checked: boolean) => void;
}) {
  return (
    <div className="role-checkbox-grid">
      {ALL_ROLES.map((r) => (
        <label key={r} className="role-checkbox">
          <input
            type="checkbox"
            checked={selected.has(r)}
            onChange={(e) => onChange(r, e.target.checked)}
          />
          {r.replace(/_/g, " ")}
        </label>
      ))}
    </div>
  );
}

function EditRolesModal({
  user,
  onClose,
  onSaved,
}: {
  user: StaffMemberRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(user.roles.map((r) => r.name)));
  const [saving, setSaving] = useState(false);

  function toggle(role: string, checked: boolean) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (checked) next.add(role);
      else next.delete(role);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/admin/staff/${user.id}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: [...selected] }),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>Edit Roles</h3>
        <p className="note">{user.name} — {user.email}</p>
        <RoleCheckboxes selected={selected} onChange={toggle} />
        <div className="modal-actions">
          <button className="cfg-remove" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersSection({ isPrincipal }: { isPrincipal: boolean }) {
  const [list, setList] = useState<StaffMemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<StaffMemberRow | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRoles, setNewRoles] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/staff")
      .then(async (r) => {
        const text = await r.text();
        let parsed: { staff?: StaffMemberRow[]; error?: string } | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
        return parsed as { staff: StaffMemberRow[] };
      })
      .then((d) => setList(d.staff ?? []))
      .catch((e: Error) => setError(`Failed to load users: ${e.message}`));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!isPrincipal) {
    return (
      <div className="section-block">
        <h3>Not Authorized</h3>
        <p className="note">Only the Principal can manage users.</p>
      </div>
    );
  }

  async function deactivate(staffId: string) {
    await fetch(`/api/admin/staff/${staffId}/deactivate`, { method: "POST" });
    load();
  }

  async function deleteUser(user: StaffMemberRow) {
    if (!window.confirm(`Permanently delete ${user.email}? This can't be undone.`)) return;
    await fetch(`/api/admin/staff/${user.id}`, { method: "DELETE" });
    load();
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAdding(true);
    try {
      await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, roles: [...newRoles] }),
      });
      setNewEmail("");
      setNewRoles(new Set());
      load();
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Users</div>
        <h1>All Users</h1>
        <p>Principal-only. Everyone with access to this admin platform, and what they&apos;re allowed to do.</p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="section-block">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(list ?? []).map((s) => (
              <tr key={s.id}>
                <td>
                  {s.name}
                  {!s.active && <span className="error-text"> (deactivated)</span>}
                </td>
                <td>{s.email}</td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {s.roles.length === 0 && <span className="note">no roles</span>}
                    {s.roles.map((r) => (
                      <span key={r.staffRoleId} className="role-chip" style={{ cursor: "default" }}>
                        {r.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="stat-link" onClick={() => setEditingUser(s)}>Edit Roles</button>
                  {" · "}
                  {!!s.active && (
                    <>
                      <button className="stat-link" onClick={() => deactivate(s.id)}>Deactivate</button>
                      {" · "}
                    </>
                  )}
                  <button className="stat-link" style={{ color: "var(--leg)" }} onClick={() => deleteUser(s)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-block">
        <h3>Add User</h3>
        <p className="note">
          Just their Gmail address, and whichever roles they should start with — submitting sends them an invite
          email. They still have to sign in through Cloudflare Access with that exact Google account before
          anything here takes effect.
        </p>
        <form onSubmit={addUser}>
          <input
            type="email"
            placeholder="Gmail address"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            style={{ marginBottom: 12, maxWidth: 320 }}
          />
          <RoleCheckboxes
            selected={newRoles}
            onChange={(role, checked) =>
              setNewRoles((cur) => {
                const next = new Set(cur);
                if (checked) next.add(role);
                else next.delete(role);
                return next;
              })
            }
          />
          <button className="btn-primary" type="submit" disabled={adding} style={{ marginTop: 14 }}>
            {adding ? "Sending Invite…" : "Add User & Send Invite"}
          </button>
        </form>
      </div>

      {editingUser && (
        <EditRolesModal user={editingUser} onClose={() => setEditingUser(null)} onSaved={load} />
      )}
    </>
  );
}

function PlaceholderSection({ sectionKey }: { sectionKey: string }) {
  const label = sectionKey
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Not built yet</div>
        <h1>{label}</h1>
        <p>This screen is on the roadmap in docs/admin-navigation-ia.md but has no implementation yet.</p>
      </div>
      <div className="section-block">
        <div className="empty-row">
          <span className="status-tag status-planned">Planned</span>
          Nothing to show here until this is built.
        </div>
      </div>
    </>
  );
}
