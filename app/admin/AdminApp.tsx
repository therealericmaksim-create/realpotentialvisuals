"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  RENDER_PRICE,
  TIER_LABELS,
  TIER_DESCRIPTIONS,
  EXTRA_LABELS,
  EXTRA_PRICE as DEFAULT_EXTRA_PRICE,
  LOGO_PRICE as DEFAULT_LOGO_PRICE,
  STRUCTURAL_BREAKDOWN_PRICE as DEFAULT_STRUCTURAL_BREAKDOWN_PRICE,
  SEASON_OPTIONS,
  HOLIDAY_OPTIONS,
  STRUCTURAL_BREAKDOWN_LABEL,
  type RenderTier,
} from "@/lib/pricing";
import { STYLE_FAMILIES } from "@/lib/styles";
import AddressAutocomplete from "@/components/AddressAutocomplete";
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
    { key: "orders-manual", label: "Manual Order", status: "built" },
  ]},
  { key: "curation", label: "Curation", color: "var(--ops)", priority: 1, badge: "awaitingCuration", children: [
    // No separate nav entry for the Job Curation Workspace — same pattern
    // as Orders: it's a detail view reached only by clicking a job in
    // this queue, never a standalone destination.
    { key: "curation-queue", label: "Curation Queue", status: "built" },
  ]},
  { key: "production", label: "Production", color: "var(--ops)", priority: 2, children: [
    { key: "production-worksheet", label: "Daily Worksheet", status: "planned" },
    { key: "production-materials", label: "Material Selections", status: "planned" },
    { key: "production-prompts", label: "Prompt History", status: "planned" },
    { key: "production-renders", label: "Render Iterations", status: "planned" },
  ]},
  { key: "qc", label: "Quality Control", color: "var(--exec)", priority: 3, badge: "awaitingQc", children: [
    // Like the Curation Queue, the QC workspace has no nav entry of its
    // own — it's reached by "Check Now" on a queue row, never directly.
    { key: "qc-queue", label: "QC Queue", status: "built" },
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
    { key: "settings-disclosure", label: "Disclosure Copy Version", status: "planned" },
    { key: "settings-variables", label: "System Variables", status: "built" },
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
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [identity, setIdentity] = useState<IdentityProfile["identity"]>(null);
  const [staffMenuOpen, setStaffMenuOpen] = useState(false);
  const staffBadgeRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  // Bumped on every nav action (goTo/openOrder/openJob) and used as a React
  // `key` on whichever section is currently mounted — forces a full
  // unmount/remount (and therefore a fresh data load) every time a menu
  // item is selected, even re-selecting the one already showing, instead
  // of relying on section-value-changed as a proxy for "the admin should
  // refetch," which silently didn't hold for the Dashboard (its data lives
  // in this parent, fetched once on the app's own mount, so revisiting it
  // kept showing whatever numbers were current the first time the whole
  // admin was opened).
  const [navToken, setNavToken] = useState(0);

  const loadDashboard = useCallback(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json() as Promise<DashboardData>)
      .then((d) => setDashboard(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (section === "dashboard") loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, navToken]);

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

  // Closes the staff dropdown on any click outside it — the menu itself
  // stops propagation so clicking "Log out" doesn't immediately re-close it.
  useEffect(() => {
    if (!staffMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (staffBadgeRef.current && !staffBadgeRef.current.contains(e.target as Node)) {
        setStaffMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [staffMenuOpen]);

  function toggleGroup(key: string) {
    setOpenGroup((cur) => (cur === key ? null : key));
  }

  function goTo(childKey: string) {
    setSection(childKey);
    setSelectedOrderId(null);
    setSelectedJobId(null);
    setNavToken((t) => t + 1);
  }

  function openOrder(id: string) {
    setSelectedOrderId(id);
    setSection("order-detail");
    setNavToken((t) => t + 1);
  }

  function openJob(id: string) {
    setSelectedJobId(id);
    setSection("curation-workspace");
    setNavToken((t) => t + 1);
  }

  function openQcJob(id: string) {
    setSelectedJobId(id);
    setSection("qc-detail");
    setNavToken((t) => t + 1);
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
            <div
              className="staff-badge"
              ref={staffBadgeRef}
              onClick={() => setStaffMenuOpen((o) => !o)}
              role="button"
              tabIndex={0}
            >
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
              {staffMenuOpen && (
                <div className="staff-menu" onClick={(e) => e.stopPropagation()}>
                  <a className="staff-menu-item" href="/cdn-cgi/access/logout">
                    Log out
                  </a>
                </div>
              )}
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
          {section === "dashboard" && <DashboardSection key={navToken} dashboard={dashboard} onNavigate={goTo} />}
          {section === "orders-list" && (
            <OrdersListSection
              key={navToken}
              onOpenOrder={openOrder}
              initialQuery={orderSearch}
              onQueryConsumed={() => setOrderSearch("")}
              isPrincipal={staff.isPrincipal}
            />
          )}
          {section === "order-detail" && selectedOrderId && (
            <OrderDetailSection key={navToken} orderId={selectedOrderId} onBack={() => goTo("orders-list")} onRan={loadDashboard} />
          )}
          {section === "users-all" && <UsersSection key={navToken} isPrincipal={staff.isPrincipal} />}
          {section === "settings-variables" && <SystemVariablesSection key={navToken} isPrincipal={staff.isPrincipal} />}
          {section === "orders-manual" && (
            <ManualOrderSection
              key={navToken}
              onCreated={(orderId) => {
                openOrder(orderId);
                loadDashboard();
              }}
            />
          )}
          {section === "curation-queue" && <CurationQueueSection key={navToken} onOpenJob={openJob} />}
          {section === "curation-workspace" && selectedJobId && (
            <JobCurationWorkspaceSection
              key={navToken}
              jobId={selectedJobId}
              onBack={() => goTo("curation-queue")}
              onSaved={loadDashboard}
            />
          )}
          {section === "qc-queue" && <QcQueueSection key={navToken} onOpenJob={openQcJob} />}
          {section === "qc-detail" && selectedJobId && (
            <QcWorkspaceSection
              key={navToken}
              jobId={selectedJobId}
              onBack={() => goTo("qc-queue")}
              onApproved={loadDashboard}
            />
          )}
          {![
            "dashboard",
            "orders-list",
            "order-detail",
            "users-all",
            "settings-variables",
            "orders-manual",
            "curation-queue",
            "curation-workspace",
            "qc-queue",
            "qc-detail",
          ].includes(section) && <PlaceholderSection sectionKey={section} />}
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
      sub: "Cap set in Settings · System Variables",
      tone: "",
      go: "settings-variables",
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
  curbappeal_photo_key: string | null;
};

// Mirrors the orders.status CHECK constraint exactly (realpotential-schema.sql)
// — kept here so the filter never drifts from what the column actually allows.
const ORDER_STATUSES = [
  "started", "verified", "queued", "placed", "analyzing", "in_curation",
  "awaiting_selection", "in_progress", "in_qc", "complete", "cancelled",
  "refunded", "error",
];

function OrdersListSection({
  onOpenOrder,
  initialQuery,
  onQueryConsumed,
  isPrincipal,
}: {
  onOpenOrder: (id: string) => void;
  initialQuery: string;
  onQueryConsumed: () => void;
  isPrincipal: boolean;
}) {
  const [orders, setOrders] = useState<OrderListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
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

  useEffect(() => {
    load();
  }, [load]);

  async function deleteOrder(o: OrderListRow) {
    const label = o.property_address || o.customer_email || o.id;
    if (!window.confirm(`Permanently delete the order for "${label}"? This can't be undone.`)) return;
    setDeletingId(o.id);
    try {
      await fetch(`/api/admin/orders/${o.id}`, { method: "DELETE" });
      load();
    } finally {
      setDeletingId(null);
    }
  }

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
  const filtered = orders
    ? orders.filter((o) => {
        if (statusFilter && o.status !== statusFilter) return false;
        if (!q) return true;
        return (
          o.id.toLowerCase().includes(q) ||
          (o.property_address ?? "").toLowerCase().includes(q) ||
          (o.customer_email ?? "").toLowerCase().includes(q) ||
          o.status.toLowerCase().includes(q)
        );
      })
    : orders;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Orders</div>
        <h1>All Orders</h1>
        <p>Every order placed, most recent first.</p>
      </div>
      <div className="section-block">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Filter by address, email, status, or order id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 420, flex: 1 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)" }}>
            Show only:
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        {!orders && !error && <p className="loading">Loading…</p>}
        {filtered && filtered.length === 0 && (
          <p className="loading">{q || statusFilter ? "No orders match that filter." : "No orders yet."}</p>
        )}
        {filtered && filtered.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th>Order</th>
                <th>Status</th>
                <th>Address</th>
                <th>Customer</th>
                <th>Ready for analysis?</th>
                {isPrincipal && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => onOpenOrder(o.id)}>
                  <td>
                    {o.curbappeal_photo_key ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="order-thumb"
                        src={`/api/admin/media/${o.curbappeal_photo_key}`}
                        alt=""
                      />
                    ) : (
                      <div className="order-thumb order-thumb-empty" />
                    )}
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{o.id}</td>
                  <td><span className="pill">{o.status}</span></td>
                  <td>{o.property_address ?? "—"}</td>
                  <td>{o.customer_email ?? "—"}</td>
                  <td>{o.job_id ? "yes" : "no"}</td>
                  {isPrincipal && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="stat-link"
                        style={{ color: "var(--leg)" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteOrder(o);
                        }}
                        disabled={deletingId === o.id}
                      >
                        {deletingId === o.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  )}
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
  curationRanks: { rank: number; style_name: string; reasoning: string }[];
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
  const [pushing, setPushing] = useState(false);
  const [showFullRegulatory, setShowFullRegulatory] = useState(false);

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

  async function pushToCurator() {
    setPushing(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/orders/${orderId}/push-to-curator`, { method: "POST" });
      const text = await r.text();
      let parsed: { error?: string } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
      load();
      onRan();
    } catch (e) {
      setError(`Failed to push to curator: ${(e as Error).message}`);
    } finally {
      setPushing(false);
    }
  }

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="loading">Loading…</p>;

  const { order, renderItems, analysis, consensus, topMatches, curationRanks, regulatory, neighborhood } = data;
  const total = (order.total_amount_cents / 100).toFixed(2);
  // Curated and premium both need a curator to assign a style; only
  // self_directed arrives with one already picked by the customer.
  const hasUnassignedCuration = renderItems.some(
    (item) => (item.tier === "curated" || item.tier === "premium") && !item.style_name
  );

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to Orders</button>
      <div className="page-head">
        <div className="eyebrow" style={{ fontFamily: "monospace" }}>Order {order.id}</div>
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
                      {item.tier === "premium" ? (
                        <>
                          {item.custom_text || "—"}
                          <span className="note"> — {item.style_name || "style not yet assigned"}</span>
                        </>
                      ) : (
                        item.style_name || (item.tier === "curated" ? "not yet assigned" : "—")
                      )}
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
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn-primary" onClick={runAnalysis} disabled={running}>
            {running ? "Running…" : analysis ? "Re-run Analysis" : "Run Analysis"}
          </button>
          {(order.status === "placed" || order.status === "analyzing") && hasUnassignedCuration && (
            <button className="cfg-remove" onClick={pushToCurator} disabled={pushing}>
              {pushing ? "Pushing…" : "Push to Curator"}
            </button>
          )}
          {(order.status === "placed" || order.status === "analyzing") && !hasUnassignedCuration && (
            <span className="note">No curated or premium renders on this order — nothing to push to curation.</span>
          )}
          {order.status === "in_curation" && <span className="pill">pushed to curator</span>}
        </div>
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

          {regulatory && (
            <>
              <h3 style={{ marginTop: 16 }}>Regulatory</h3>
              <p className="note">
                Zoning: {regulatory.zoning_district ?? "unknown"} — Historic overlay:{" "}
                {regulatory.historic_overlay === null ? "unknown" : regulatory.historic_overlay ? "yes" : "no"} — Flood zone: {regulatory.flood_zone ?? "unknown"}
              </p>
              <button
                type="button"
                className="stat-link"
                onClick={() => setShowFullRegulatory((v) => !v)}
              >
                {showFullRegulatory ? "Hide" : "Show"} full research &amp; sources
              </button>
              {showFullRegulatory && (
                <p className="note" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                  {regulatory.summary}
                </p>
              )}
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

          {topMatches.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Top matches</h3>
              {curationRanks.length > 0 ? (
                <>
                  <p className="note">
                    AI-ranked starting point for curation — algorithm score/tier shown alongside each pick.
                  </p>
                  {curationRanks.map((r) => {
                    const m = topMatches.find((t) => t.name === r.style_name);
                    return (
                      <div key={r.rank} className="empty-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 2 }}>
                        <strong>
                          {r.rank}. {r.style_name}
                          {m && ` — ${m.combined_score_pct}% (${m.fit_tier})`}
                        </strong>
                        <span className="note">{r.reasoning}</span>
                      </div>
                    );
                  })}
                </>
              ) : (
                topMatches.map((m, i) => (
                  <div key={i} className="empty-row">{m.name} — {m.combined_score_pct}% ({m.fit_tier})</div>
                ))
              )}
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

type ConfigVarRow = {
  key: string;
  label: string;
  secret: boolean;
  numeric: boolean;
  value: string;
  source: "db" | "env" | "unset";
  updatedAt: string | null;
};

function SystemVariablesSection({ isPrincipal }: { isPrincipal: boolean }) {
  const [rows, setRows] = useState<ConfigVarRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/config")
      .then(async (r) => {
        const text = await r.text();
        let parsed: { variables?: ConfigVarRow[]; error?: string } | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
        return parsed as { variables: ConfigVarRow[] };
      })
      .then((d) => {
        setRows(d.variables ?? []);
        setEdited(Object.fromEntries((d.variables ?? []).map((v) => [v.key, v.value])));
      })
      .catch((e: Error) => setError(`Failed to load system variables: ${e.message}`));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!isPrincipal) {
    return (
      <div className="section-block">
        <h3>Not Authorized</h3>
        <p className="note">Only the Principal can view or change system variables.</p>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: edited }),
      });
      const text = await r.text();
      let parsed: { error?: string } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
      setSavedAt(Date.now());
      load();
    } catch (e) {
      setError(`Failed to save system variables: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Settings</div>
        <h1>System Variables</h1>
        <p>
          Principal-only. Every field here already works from a Worker-level default — saving a value here overrides
          that default immediately, with no deploy. Clear a field and save to revert to the default.
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="section-block">
        <table className="data">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Value</th>
              <th>Source</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td style={{ minWidth: 320 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type={row.numeric ? "number" : row.secret && !revealed[row.key] ? "password" : "text"}
                      step={row.numeric ? "0.01" : undefined}
                      value={edited[row.key] ?? ""}
                      placeholder="(unset)"
                      onChange={(e) =>
                        setEdited((cur) => ({ ...cur, [row.key]: e.target.value }))
                      }
                      style={{ flex: 1 }}
                    />
                    {row.secret && (
                      <button
                        type="button"
                        className="cfg-remove"
                        onClick={() =>
                          setRevealed((cur) => ({ ...cur, [row.key]: !cur[row.key] }))
                        }
                      >
                        {revealed[row.key] ? "Hide" : "Show"}
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <span className="role-chip" style={{ cursor: "default" }}>
                    {row.source === "db" ? "override" : row.source === "env" ? "default" : "unset"}
                  </span>
                </td>
                <td className="note">
                  {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn-primary" type="button" onClick={save} disabled={saving || !rows}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {savedAt && !saving && <span className="note">Saved.</span>}
        </div>
      </div>
    </>
  );
}

type ExtraKey = "night" | "seasonal" | "holiday";
const EXTRA_KEYS: ExtraKey[] = ["night", "seasonal", "holiday"];
const RENDER_TIERS: RenderTier[] = ["self_directed", "curated", "premium"];
const MAX_RENDERS_PER_TIER = 6;

type ManualRenderItem = {
  id: string;
  tier: RenderTier;
  styleName: string;
  customText: string;
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

// Staff-facing replica of the public /start intake form, styled with
// admin.css instead of the public site's cfg-* classes. Skips the Gate
// 0/1 AI photo check (staff already look at the photo while entering the
// order — see /api/admin/photo-upload) and skips Stripe entirely: this
// saves straight to a 'placed' order, ready for "Run Analysis".
type PricingConfig = {
  renderPrice: Record<RenderTier, number>;
  extraPrice: number;
  logoPrice: number;
  structuralBreakdownPrice: number;
};

const DEFAULT_PRICING: PricingConfig = {
  renderPrice: RENDER_PRICE,
  extraPrice: DEFAULT_EXTRA_PRICE,
  logoPrice: DEFAULT_LOGO_PRICE,
  structuralBreakdownPrice: DEFAULT_STRUCTURAL_BREAKDOWN_PRICE,
};

function ManualOrderSection({ onCreated }: { onCreated: (orderId: string) => void }) {
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config/pricing")
      .then((res) => res.json() as Promise<PricingConfig>)
      .then((data) => {
        if (!cancelled) setPricing(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const [customerEmail, setCustomerEmail] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [hoaAnswer, setHoaAnswer] = useState("");
  const [historicDistrictAnswer, setHistoricDistrictAnswer] = useState("");
  const [logoSelected, setLogoSelected] = useState(false);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [renderItems, setRenderItems] = useState<ManualRenderItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addRenderRow(tier: RenderTier) {
    const countForTier = renderItems.filter((r) => r.tier === tier).length;
    if (countForTier >= MAX_RENDERS_PER_TIER) return;
    setRenderItems((cur) => [
      ...cur,
      {
        id: crypto.randomUUID(),
        tier,
        styleName: "",
        customText: "",
        extras: emptyExtras(),
        seasonChoice: "",
        holidayChoice: "",
        breakdown: false,
      },
    ]);
  }

  function removeRenderRow(id: string) {
    setRenderItems((cur) => cur.filter((r) => r.id !== id));
  }

  function updateRow(id: string, patch: Partial<ManualRenderItem>) {
    setRenderItems((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function uploadPhoto(file: File) {
    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      const r = await fetch("/api/admin/photo-upload", { method: "POST", body: form });
      const text = await r.text();
      let parsed: { valid?: boolean; key?: string; reason?: string; error?: string } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
      if (!parsed?.valid) throw new Error(parsed?.reason ?? "Photo rejected");
      setPhotoKey(parsed.key ?? null);
    } catch (e) {
      setPhotoKey(null);
      setPhotoError(`Failed to upload photo: ${(e as Error).message}`);
    } finally {
      setPhotoUploading(false);
    }
  }

  const total = renderItems.reduce((sum, item) => {
    let itemTotal = pricing.renderPrice[item.tier];
    if (item.extras.night || item.extras.seasonal || item.extras.holiday) {
      itemTotal +=
        (item.extras.night ? pricing.extraPrice : 0) +
        (item.extras.seasonal ? pricing.extraPrice : 0) +
        (item.extras.holiday ? pricing.extraPrice : 0);
    }
    if (item.breakdown) itemTotal += pricing.structuralBreakdownPrice;
    return sum + itemTotal;
  }, 0) + (logoSelected ? pricing.logoPrice : 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerEmail.trim() || !propertyAddress.trim() || renderItems.length === 0) {
      setError("Customer email, property address, and at least one render are required.");
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/orders/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail,
          curbappealPhotoKey: photoKey,
          propertyAddress,
          hoaAnswer,
          historicDistrictAnswer,
          logoSelected,
          renderItems: renderItems.map((item) => ({
            tier: item.tier,
            styleName: item.styleName,
            customText: item.customText,
            night: item.extras.night,
            seasonal: item.extras.seasonal,
            seasonChoice: item.seasonChoice,
            holiday: item.extras.holiday,
            holidayChoice: item.holidayChoice,
            breakdown: item.breakdown,
          })),
        }),
      });
      const text = await r.text();
      let parsed: { orderId?: string; error?: string } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
      if (!parsed?.orderId) throw new Error("No orderId returned");
      onCreated(parsed.orderId);
    } catch (e) {
      setError(`Failed to create order: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Orders</div>
        <h1>Manual Order</h1>
        <p>
          Enter an order on a customer&apos;s behalf — phone or email intake. Skips the AI photo gate and Stripe
          entirely; the order is saved as placed and ready for &quot;Run Analysis&quot; immediately.
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <form onSubmit={submit}>
        <div className="section-block">
          <h3>Customer & Property</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <input
              type="email"
              placeholder="Customer email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              required
            />
            <AddressAutocomplete value={propertyAddress} onChange={setPropertyAddress} />
            <select value={hoaAnswer} onChange={(e) => setHoaAnswer(e.target.value)}>
              <option value="">Is this property in an HOA?…</option>
              <option value="yes">Yes, it&apos;s in an HOA</option>
              <option value="no">No HOA</option>
              <option value="not_sure">Not sure</option>
            </select>
            <select value={historicDistrictAnswer} onChange={(e) => setHistoricDistrictAnswer(e.target.value)}>
              <option value="">Is this in a historic district?…</option>
              <option value="yes">Yes, it&apos;s in a historic district</option>
              <option value="no">Not in a historic district</option>
              <option value="not_sure">Not sure</option>
            </select>
          </div>
        </div>

        <div className="section-block">
          <h3>Home Photo & Logo</h3>
          <p className="note">Format/size validated the same as the public form — the AI structure check is skipped here.</p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadPhoto(file);
            }}
          />
          {photoUploading && <p className="note">Uploading…</p>}
          {photoError && <p className="error-text">{photoError}</p>}
          {photoKey && <p className="note">Uploaded: {photoKey}</p>}
          <label className="role-checkbox" style={{ marginTop: 12 }}>
            <input
              type="checkbox"
              checked={logoSelected}
              onChange={(e) => setLogoSelected(e.target.checked)}
            />
            Customer provided a logo to add ({money(pricing.logoPrice)})
          </label>
        </div>

        {RENDER_TIERS.map((tier) => {
          const rows = renderItems.filter((r) => r.tier === tier);
          return (
            <div className="section-block" key={tier}>
              <h3>
                {TIER_LABELS[tier]} — {money(pricing.renderPrice[tier])} / render
              </h3>
              <p className="note">{TIER_DESCRIPTIONS[tier]}</p>

              {rows.map((row, i) => (
                <div key={row.id} className="empty-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{TIER_LABELS[tier]} render #{i + 1}</strong>
                    <button type="button" className="cfg-remove" onClick={() => removeRenderRow(row.id)}>
                      Remove
                    </button>
                  </div>

                  {tier === "self_directed" && (
                    <select value={row.styleName} onChange={(e) => updateRow(row.id, { styleName: e.target.value })}>
                      <option value="">Select a style…</option>
                      {STYLE_FAMILIES.map((fam) => (
                        <optgroup key={fam.family} label={fam.family}>
                          {fam.styles.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}

                  {tier === "premium" && (
                    <textarea
                      placeholder="Describe exactly what the customer wants…"
                      value={row.customText}
                      onChange={(e) => updateRow(row.id, { customText: e.target.value })}
                      rows={3}
                      style={{ width: "100%", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "7px 10px", fontFamily: "inherit", fontSize: 13 }}
                    />
                  )}

                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {EXTRA_KEYS.map((key) => (
                      <label key={key} className="role-checkbox">
                        <input
                          type="checkbox"
                          checked={row.extras[key]}
                          onChange={(e) =>
                            updateRow(row.id, { extras: { ...row.extras, [key]: e.target.checked } })
                          }
                        />
                        {EXTRA_LABELS[key]} ({money(pricing.extraPrice)})
                      </label>
                    ))}
                    <label className="role-checkbox">
                      <input
                        type="checkbox"
                        checked={row.breakdown}
                        onChange={(e) => updateRow(row.id, { breakdown: e.target.checked })}
                      />
                      {STRUCTURAL_BREAKDOWN_LABEL} ({money(pricing.structuralBreakdownPrice)})
                    </label>
                  </div>

                  {row.extras.seasonal && (
                    <select value={row.seasonChoice} onChange={(e) => updateRow(row.id, { seasonChoice: e.target.value })}>
                      <option value="">Which season?…</option>
                      {SEASON_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  )}
                  {row.extras.holiday && (
                    <select value={row.holidayChoice} onChange={(e) => updateRow(row.id, { holidayChoice: e.target.value })}>
                      <option value="">Which holiday?…</option>
                      {HOLIDAY_OPTIONS.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}

              <button
                type="button"
                className="cfg-remove"
                style={{ marginTop: 10 }}
                onClick={() => addRenderRow(tier)}
                disabled={rows.length >= MAX_RENDERS_PER_TIER}
              >
                + Add {TIER_LABELS[tier]} render {rows.length >= MAX_RENDERS_PER_TIER ? "(max 6)" : ""}
              </button>
            </div>
          );
        })}

        <div className="section-block" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <strong>Total: {money(total)}</strong>
            <p className="note" style={{ margin: "4px 0 0" }}>No payment is collected here — this records what was agreed with the customer.</p>
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Order"}
          </button>
        </div>
      </form>
    </>
  );
}

type CurationQueueRow = {
  job_id: string;
  property_address: string;
  curbappeal_photo_key: string | null;
  unassigned_count: number;
  oldest_order_at: string;
};

function CurationQueueSection({ onOpenJob }: { onOpenJob: (jobId: string) => void }) {
  const [jobs, setJobs] = useState<CurationQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/curation")
      .then(async (r) => {
        const text = await r.text();
        let parsed: { jobs?: CurationQueueRow[]; error?: string } | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
        return parsed as { jobs: CurationQueueRow[] };
      })
      .then((d) => setJobs(d.jobs ?? []))
      .catch((e: Error) => setError(`Failed to load curation queue: ${e.message}`));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Curation</div>
        <h1>Curation Queue</h1>
        <p>Jobs with at least one curated or premium render still waiting on a style. Oldest first.</p>
      </div>

      {error && <p className="error-text">{error}</p>}
      {!jobs && !error && <p className="loading">Loading…</p>}
      {jobs && jobs.length === 0 && <p className="loading">Nothing waiting on curation right now.</p>}

      {jobs && jobs.length > 0 && (
        <div className="section-block">
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th>Address</th>
                <th>Unassigned renders</th>
                <th>Waiting since</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.job_id} className="clickable" onClick={() => onOpenJob(j.job_id)}>
                  <td>
                    {j.curbappeal_photo_key ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="order-thumb" src={`/api/admin/media/${j.curbappeal_photo_key}`} alt="" />
                    ) : (
                      <div className="order-thumb order-thumb-empty" />
                    )}
                  </td>
                  <td>{j.property_address}</td>
                  <td>{j.unassigned_count}</td>
                  <td>{new Date(j.oldest_order_at).toLocaleString()}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenJob(j.job_id);
                      }}
                    >
                      Curate Now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

type CurationSlot = {
  id: string;
  order_id: string;
  tier: string;
  style_id: string | null;
  style_name: string;
  custom_text: string | null;
  night: number;
  seasonal: number;
  season_choice: string | null;
  holiday: number;
  holiday_choice: string | null;
  breakdown: number;
};

type CurationWorkspaceData = {
  job: { id: string; propertyAddress: string; curbappealPhotoKey: string | null };
  slots: CurationSlot[];
  analysis: AnalysisSummary;
  topMatches: TopMatch[];
  curationRanks: CurationRank[];
  regulatory: RegulatorySummary;
  neighborhood: NeighborhoodSummary;
};

type AnalysisSummary = { house_type: string; roof_form: string; massing_envelope: string } | null;
type RegulatorySummary = {
  zoning_district: string | null;
  historic_overlay: number | null;
  flood_zone: string | null;
  summary: string;
} | null;
type NeighborhoodSummary = { style_read: string; homes_visible: number; street_view_key: string | null } | null;
type TopMatch = { name: string; combined_score_pct: number; fit_tier: string };
type CurationRank = { rank: number; style_name: string; reasoning: string };

// The evidence panel: structure, regulatory, neighborhood read and the
// ranked style shortlist. Shared verbatim by the curation workspace and
// the QC workspace on purpose — QC's whole job is re-checking the curator's
// call, which is only meaningful against exactly the same evidence the
// curator had in front of them.
function PropertyContextBlocks({
  analysis,
  regulatory,
  neighborhood,
  topMatches,
  curationRanks,
}: {
  analysis: AnalysisSummary;
  regulatory: RegulatorySummary;
  neighborhood: NeighborhoodSummary;
  topMatches: TopMatch[];
  curationRanks: CurationRank[];
}) {
  const [showFullRegulatory, setShowFullRegulatory] = useState(false);
  if (!analysis) return null;

  return (
    <div className="section-block">
      <h3>Structure</h3>
      <p className="note">{analysis.house_type} — {analysis.roof_form} roof — {analysis.massing_envelope}</p>

      {regulatory && (
        <>
          <h3 style={{ marginTop: 16 }}>Regulatory</h3>
          <p className="note">
            Zoning: {regulatory.zoning_district ?? "unknown"} — Historic overlay:{" "}
            {regulatory.historic_overlay === null ? "unknown" : regulatory.historic_overlay ? "yes" : "no"} — Flood zone: {regulatory.flood_zone ?? "unknown"}
          </p>
          <button type="button" className="stat-link" onClick={() => setShowFullRegulatory((v) => !v)}>
            {showFullRegulatory ? "Hide" : "Show"} full research &amp; sources
          </button>
          {showFullRegulatory && (
            <p className="note" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{regulatory.summary}</p>
          )}
        </>
      )}

      {neighborhood && (
        <>
          <h3 style={{ marginTop: 16 }}>Neighborhood read</h3>
          <p className="note">{neighborhood.style_read}</p>
        </>
      )}

      {topMatches.length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>Top matches</h3>
          {curationRanks.length > 0 ? (
            <>
              <p className="note">AI-ranked starting point for curation.</p>
              {curationRanks.map((r) => {
                const m = topMatches.find((t) => t.name === r.style_name);
                return (
                  <div key={r.rank} className="empty-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 2 }}>
                    <strong>
                      {r.rank}. {r.style_name}
                      {m && ` — ${m.combined_score_pct}% (${m.fit_tier})`}
                    </strong>
                    <span className="note">{r.reasoning}</span>
                  </div>
                );
              })}
            </>
          ) : (
            topMatches.map((m, i) => (
              <div key={i} className="empty-row">{m.name} — {m.combined_score_pct}% ({m.fit_tier})</div>
            ))
          )}
        </>
      )}
    </div>
  );
}

function slotLabel(slot: CurationSlot): string {
  const extras: string[] = [];
  if (slot.night) extras.push("Night View");
  if (slot.seasonal) extras.push(`Seasonal (${slot.season_choice ?? "—"})`);
  if (slot.holiday) extras.push(`Holiday (${slot.holiday_choice ?? "—"})`);
  if (slot.breakdown) extras.push("Structural Breakdown");
  return extras.length > 0 ? extras.join(", ") : "no extras";
}

function JobCurationWorkspaceSection({
  jobId,
  onBack,
  onSaved,
}: {
  jobId: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<CurationWorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sentToQc, setSentToQc] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/admin/curation/${jobId}`)
      .then(async (r) => {
        const text = await r.text();
        let parsed: (CurationWorkspaceData & { error?: string }) | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
        return parsed as CurationWorkspaceData;
      })
      .then((d) => setData(d))
      .catch((e: Error) => setError(`Failed to load curation workspace: ${e.message}`));
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="loading">Loading…</p>;

  const { job, slots, analysis, topMatches, curationRanks, regulatory, neighborhood } = data;
  const unassigned = slots.filter((s) => !s.style_id);
  const assignedAlready = slots.filter((s) => s.style_id);

  // Candidate options: AI-ranked first (already narrowed + reasoned),
  // then any other algorithm top match not already covered, then an
  // escape hatch into the full 133-style catalog for anything outside
  // the shortlist.
  const rankedNames = new Set(curationRanks.map((r) => r.style_name));
  const otherMatches = topMatches.filter((m) => !rankedNames.has(m.name));

  function setAssignment(slotId: string, styleName: string) {
    setAssignments((cur) => ({ ...cur, [slotId]: styleName }));
  }

  async function save() {
    const toSubmit = unassigned
      .map((s) => ({ orderItemId: s.id, styleName: assignments[s.id] }))
      .filter((a) => a.styleName);
    if (toSubmit.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/curation/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: toSubmit }),
      });
      const text = await r.text();
      let parsed: { error?: string; advancedOrders?: string[] } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
      setSentToQc((parsed?.advancedOrders ?? []).length > 0);
      setAssignments({});
      load();
      onSaved();
    } catch (e) {
      setError(`Failed to save assignments: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to Curation Queue</button>
      <div className="page-head">
        <div className="eyebrow">Curation</div>
        <h1>{job.propertyAddress}</h1>
        <p>{unassigned.length} render{unassigned.length === 1 ? "" : "s"} waiting on a style.</p>
      </div>

      {sentToQc && (
        <p className="note">
          Every render on this order now has a style — the order has moved to <strong>Quality Control</strong> and
          is waiting in the QC Queue.
        </p>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {job.curbappealPhotoKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="detail-photo" src={`/api/admin/media/${job.curbappealPhotoKey}`} alt="Uploaded property photo" />
        )}
        {neighborhood?.street_view_key && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="detail-photo"
            src={`/api/admin/media/${neighborhood.street_view_key}`}
            alt="Street View of the surrounding block"
          />
        )}
      </div>

      {!analysis && (
        <p className="note">
          No analysis has been run on this order yet — you can still assign styles from the full catalog below, or
          run analysis first (from the order&apos;s own page) for a ranked shortlist with reasoning.
        </p>
      )}

      <PropertyContextBlocks
        analysis={analysis}
        regulatory={regulatory}
        neighborhood={neighborhood}
        topMatches={topMatches}
        curationRanks={curationRanks}
      />

      {assignedAlready.length > 0 && (
        <div className="section-block">
          <h3>Already assigned</h3>
          {assignedAlready.map((s) => (
            <div key={s.id} className="empty-row">
              {s.style_name} <span className="note">— {slotLabel(s)}</span>
            </div>
          ))}
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="section-block">
          <h3>Assign styles</h3>
          {unassigned.map((s, i) => (
            <div key={s.id} className="empty-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              <strong>
                {s.tier === "premium" ? "Premium" : "Curated"} render #{i + 1}{" "}
                <span className="note">— {slotLabel(s)}</span>
              </strong>
              {s.tier === "premium" && (
                <span className="note" style={{ whiteSpace: "pre-wrap" }}>
                  Customer&apos;s request: {s.custom_text || "(none provided)"}
                </span>
              )}
              <select value={assignments[s.id] ?? ""} onChange={(e) => setAssignment(s.id, e.target.value)}>
                <option value="">Select a style…</option>
                {curationRanks.length > 0 && (
                  <optgroup label="AI-ranked candidates">
                    {curationRanks.map((r) => (
                      <option key={r.style_name} value={r.style_name}>
                        {r.rank}. {r.style_name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherMatches.length > 0 && (
                  <optgroup label="Other top matches">
                    {otherMatches.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} — {m.combined_score_pct}%
                      </option>
                    ))}
                  </optgroup>
                )}
                {STYLE_FAMILIES.map((fam) => (
                  <optgroup key={fam.family} label={fam.family}>
                    {fam.styles.map((styleName) => (
                      <option key={styleName} value={styleName}>{styleName}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          ))}
          <button className="btn-primary" type="button" onClick={save} disabled={saving} style={{ marginTop: 10 }}>
            {saving ? "Saving…" : "Save Assignments"}
          </button>
        </div>
      )}
    </>
  );
}

type QcQueueRow = {
  job_id: string;
  property_address: string;
  curbappeal_photo_key: string | null;
  render_count: number;
  oldest_order_at: string;
};

function QcQueueSection({ onOpenJob }: { onOpenJob: (jobId: string) => void }) {
  const [jobs, setJobs] = useState<QcQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/qc")
      .then(async (r) => {
        const text = await r.text();
        let parsed: { jobs?: QcQueueRow[]; error?: string } | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
        return parsed as { jobs: QcQueueRow[] };
      })
      .then((d) => setJobs(d.jobs ?? []))
      .catch((e: Error) => setError(`Failed to load QC queue: ${e.message}`));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Quality Control</div>
        <h1>QC Queue</h1>
        <p>Curated orders waiting to be checked and turned into render instructions. Oldest first.</p>
      </div>

      {error && <p className="error-text">{error}</p>}
      {!jobs && !error && <p className="loading">Loading…</p>}
      {jobs && jobs.length === 0 && <p className="loading">Nothing waiting on QC right now.</p>}

      {jobs && jobs.length > 0 && (
        <div className="section-block">
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th>Address</th>
                <th>Renders</th>
                <th>Waiting since</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.job_id} className="clickable" onClick={() => onOpenJob(j.job_id)}>
                  <td>
                    {j.curbappeal_photo_key ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="order-thumb" src={`/api/admin/media/${j.curbappeal_photo_key}`} alt="" />
                    ) : (
                      <div className="order-thumb order-thumb-empty" />
                    )}
                  </td>
                  <td>{j.property_address}</td>
                  <td>{j.render_count}</td>
                  <td>{new Date(j.oldest_order_at).toLocaleString()}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenJob(j.job_id);
                      }}
                    >
                      Check Now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

type BuiltPrompt = {
  orderItemId: string;
  styleId: string;
  styleName: string;
  tier: string;
  assembledPrompt: string;
  negativePrompt: string;
  templateVersion: string;
};

type QcWorkspaceData = {
  job: { id: string; propertyAddress: string; curbappealPhotoKey: string | null };
  slots: CurationSlot[];
  prompts: BuiltPrompt[];
  analysis: AnalysisSummary;
  topMatches: TopMatch[];
  curationRanks: CurationRank[];
  regulatory: RegulatorySummary;
  neighborhood: NeighborhoodSummary;
};

function QcWorkspaceSection({
  jobId,
  onBack,
  onApproved,
}: {
  jobId: string;
  onBack: () => void;
  onApproved: () => void;
}) {
  const [data, setData] = useState<QcWorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Prompt text is editable: the builder's output is a starting point the
  // reviewer is expected to tighten, and whatever they approve is what
  // gets recorded as the instruction production actually worked from.
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/admin/qc/${jobId}`)
      .then(async (r) => {
        const text = await r.text();
        let parsed: (QcWorkspaceData & { error?: string }) | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
        return parsed as QcWorkspaceData;
      })
      .then((d) => setData(d))
      .catch((e: Error) => setError(`Failed to load QC workspace: ${e.message}`));
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="loading">Loading…</p>;

  const { job, slots, prompts, analysis, topMatches, curationRanks, regulatory, neighborhood } = data;

  function promptText(p: BuiltPrompt): string {
    return edited[p.orderItemId] ?? p.assembledPrompt;
  }

  async function copyPrompt(p: BuiltPrompt) {
    try {
      await navigator.clipboard.writeText(promptText(p));
      setCopiedId(p.orderItemId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      setError(`Could not copy to clipboard: ${(e as Error).message}`);
    }
  }

  async function approve() {
    setApproving(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/qc/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompts: prompts.map((p) => ({
            orderItemId: p.orderItemId,
            assembledPrompt: promptText(p),
            negativePrompt: p.negativePrompt,
          })),
        }),
      });
      const text = await r.text();
      let parsed: { error?: string } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
      setApproved(true);
      onApproved();
    } catch (e) {
      setError(`Failed to approve: ${(e as Error).message}`);
    } finally {
      setApproving(false);
    }
  }

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to QC Queue</button>
      <div className="page-head">
        <div className="eyebrow">Quality Control</div>
        <h1>{job.propertyAddress}</h1>
        <p>{prompts.length} render{prompts.length === 1 ? "" : "s"} to check and instruct.</p>
      </div>

      {approved && (
        <p className="note">
          Approved — prompts recorded and this order has moved to <strong>production</strong>. It has left the QC
          queue.
        </p>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {job.curbappealPhotoKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="detail-photo" src={`/api/admin/media/${job.curbappealPhotoKey}`} alt="Uploaded property photo" />
        )}
        {neighborhood?.street_view_key && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="detail-photo"
            src={`/api/admin/media/${neighborhood.street_view_key}`}
            alt="Street View of the surrounding block"
          />
        )}
      </div>

      {!analysis && (
        <p className="note">
          No analysis was run on this property, so there is no ranked shortlist to check the curator&apos;s choice
          against — the render instructions below fall back to preserving everything structural in the photo.
        </p>
      )}

      <PropertyContextBlocks
        analysis={analysis}
        regulatory={regulatory}
        neighborhood={neighborhood}
        topMatches={topMatches}
        curationRanks={curationRanks}
      />

      <div className="section-block">
        <h3>Curator&apos;s selections</h3>
        {slots.map((s) => (
          <div key={s.id} className="empty-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 2 }}>
            <strong>
              {s.tier === "premium" ? "Premium" : "Curated"} — {s.style_name || "no style assigned"}
            </strong>
            <span className="note">{slotLabel(s)}</span>
            {s.tier === "premium" && s.custom_text && (
              <span className="note" style={{ whiteSpace: "pre-wrap" }}>
                Customer&apos;s request: {s.custom_text}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="section-block">
        <h3>Render instructions</h3>
        <p className="note">
          Generated from the style catalog and this house&apos;s measured structure. Edit anything that needs
          tightening, copy it into the image generator, then approve — the text you approve is what gets recorded
          as the instruction for this render.
        </p>

        {prompts.length === 0 && (
          <p className="note">No render on this job has a style assigned yet, so there is nothing to instruct.</p>
        )}

        {prompts.map((p, i) => (
          <div key={p.orderItemId} style={{ marginTop: 18 }}>
            <strong>
              Render #{i + 1} — {p.styleName}{" "}
              <span className="note">({p.tier === "premium" ? "Premium" : "Curated"})</span>
            </strong>
            <textarea
              className="prompt-box"
              value={promptText(p)}
              onChange={(e) => setEdited((cur) => ({ ...cur, [p.orderItemId]: e.target.value }))}
              rows={18}
            />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
              <button type="button" className="btn-primary" onClick={() => copyPrompt(p)}>
                {copiedId === p.orderItemId ? "Copied" : "Copy prompt"}
              </button>
              <span className="note">Template {p.templateVersion}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="note">Negative prompt (avoid): {p.negativePrompt}</span>
            </div>
          </div>
        ))}
      </div>

      {prompts.length > 0 && !approved && (
        <button className="btn-primary" type="button" onClick={approve} disabled={approving} style={{ marginTop: 16 }}>
          {approving ? "Approving…" : "Approve & Send to Production"}
        </button>
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
