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
import { orderStatusLabel } from "@/lib/orderDisplay";
import { stageLabel, ORDER_ITEM_STAGES } from "@/lib/orderStage";
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
  awaitingProduction: number;
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
  { key: "production", label: "Production", color: "var(--ops)", priority: 2, badge: "awaitingProduction", children: [
    // The production workspace, like the curation and QC ones, is reached
    // only by clicking a queue row — no nav entry of its own.
    { key: "production-queue", label: "Production Queue", status: "built" },
    { key: "production-worksheet", label: "Daily Worksheet", status: "planned" },
    { key: "production-prompts", label: "Prompt History", status: "planned" },
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

  function openProductionJob(id: string) {
    setSelectedJobId(id);
    setSection("production-detail");
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
              onDecided={loadDashboard}
            />
          )}
          {section === "production-queue" && (
            <ProductionQueueSection key={navToken} onOpenJob={openProductionJob} />
          )}
          {section === "production-detail" && selectedJobId && (
            <ProductionWorkspaceSection
              key={navToken}
              jobId={selectedJobId}
              onBack={() => goTo("production-queue")}
              onRendered={loadDashboard}
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
            "production-queue",
            "production-detail",
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
      sub: "A curator still has to pick the style",
      tone: (dashboard?.awaitingCuration ?? 0) > 0 ? "warn" : "",
      go: "curation-queue",
    },
    {
      label: "Awaiting QC",
      value: dashboard?.awaitingQc ?? "—",
      sub: "Curation done, instructions need checking",
      tone: "",
      go: "qc-queue",
    },
    {
      label: "In Production",
      value: dashboard?.awaitingProduction ?? "—",
      sub: "QC approved, images need generating",
      tone: (dashboard?.awaitingProduction ?? 0) > 0 ? "warn" : "",
      go: "production-queue",
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

// One row per render. Stages live on order_items, so an order-level row
// could only show a rolled-up status that hides the real state — an order
// with one render in production and another back with the curator would
// read as a single misleading value. Rows belonging to the same order are
// grouped: the order id, photo and delete control appear once, on the
// first row of the group.
type OrderRenderRow = {
  order_id: string;
  order_status: string;
  property_address: string | null;
  customer_email: string | null;
  job_id: string | null;
  created_at: string;
  curbappeal_photo_key: string | null;
  item_id: string | null;
  tier: string | null;
  stage: string | null;
  style_name: string | null;
  custom_text: string | null;
  qc_denied_reason: string | null;
  qc_denied_style: string | null;
};

function renderDescription(r: OrderRenderRow): string {
  if (!r.item_id) return "No renders on this order";
  const tier = TIER_LABELS[r.tier as keyof typeof TIER_LABELS] ?? r.tier ?? "—";
  if (r.tier === "premium") {
    const req = (r.custom_text ?? "").trim();
    const short = req.length > 60 ? `${req.slice(0, 60)}…` : req;
    return `${tier} — ${r.style_name || short || "custom request"}`;
  }
  return `${tier} — ${r.style_name || "style not yet assigned"}`;
}

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
  const [renders, setRenders] = useState<OrderRenderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [stageFilter, setStageFilter] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/orders")
      .then(async (r) => {
        const text = await r.text();
        let parsed: { renders?: OrderRenderRow[]; error?: string } | null = null;
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
        return parsed as { renders: OrderRenderRow[] };
      })
      .then((d) => setRenders(d.renders ?? []))
      .catch((e: Error) => setError(`Failed to load orders: ${e.message}`));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Deleting is still an ORDER-level action — it removes the order and
  // every render on it. A per-render delete would be a different feature
  // with money attached (the customer paid for that line item), so this
  // control says "order" explicitly rather than sitting ambiguously on a
  // render row.
  async function deleteOrder(r: OrderRenderRow) {
    const label = r.property_address || r.customer_email || r.order_id;
    if (
      !window.confirm(
        `Permanently delete the ENTIRE order for "${label}", including every render on it? This can't be undone.`
      )
    )
      return;
    setDeletingId(r.order_id);
    try {
      await fetch(`/api/admin/orders/${r.order_id}`, { method: "DELETE" });
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
  const filtered = renders
    ? renders.filter((r) => {
        if (stageFilter && r.stage !== stageFilter) return false;
        if (!q) return true;
        return (
          r.order_id.toLowerCase().includes(q) ||
          (r.property_address ?? "").toLowerCase().includes(q) ||
          (r.customer_email ?? "").toLowerCase().includes(q) ||
          (r.style_name ?? "").toLowerCase().includes(q) ||
          (r.custom_text ?? "").toLowerCase().includes(q) ||
          stageLabel(r.stage ?? "").toLowerCase().includes(q)
        );
      })
    : renders;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Orders</div>
        <h1>All Orders</h1>
        <p>Every render ordered, newest order first. Renders on the same order are grouped together.</p>
      </div>
      <div className="section-block">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Filter by address, email, style, stage, or order id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 420, flex: 1 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)" }}>
            Show only:
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
              <option value="">All stages</option>
              {ORDER_ITEM_STAGES.map((st) => (
                <option key={st} value={st}>{stageLabel(st)}</option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        {!renders && !error && <p className="loading">Loading…</p>}
        {filtered && filtered.length === 0 && (
          <p className="loading">{q || stageFilter ? "No renders match that filter." : "No orders yet."}</p>
        )}
        {filtered && filtered.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th>Order</th>
                <th>Render</th>
                <th>Status</th>
                <th>Address</th>
                <th>Customer</th>
                {isPrincipal && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                // Group start is computed against the FILTERED list, so the
                // order id and delete control stay visible even when a
                // filter hides the order's other renders.
                const isGroupStart = i === 0 || filtered[i - 1].order_id !== r.order_id;
                return (
                  <tr
                    key={r.item_id ?? r.order_id}
                    className={`clickable${isGroupStart ? " order-group-start" : ""}`}
                    onClick={() => onOpenOrder(r.order_id)}
                  >
                    <td>
                      {isGroupStart &&
                        (r.curbappeal_photo_key ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="order-thumb"
                            src={`/api/admin/media/${r.curbappeal_photo_key}`}
                            alt=""
                          />
                        ) : (
                          <div className="order-thumb order-thumb-empty" />
                        ))}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {isGroupStart ? r.order_id : ""}
                    </td>
                    <td>
                      {renderDescription(r)}
                      {r.qc_denied_reason && (
                        <div className="qc-denied">
                          QC sent back{r.qc_denied_style ? ` (${r.qc_denied_style})` : ""}: {r.qc_denied_reason}
                        </div>
                      )}
                    </td>
                    <td>
                      {r.stage ? <span className="pill">{stageLabel(r.stage)}</span> : <span className="note">—</span>}
                    </td>
                    <td>{isGroupStart ? r.property_address ?? "—" : ""}</td>
                    <td>{isGroupStart ? r.customer_email ?? "—" : ""}</td>
                    {isPrincipal && (
                      <td style={{ whiteSpace: "nowrap" }}>
                        {isGroupStart && (
                          <button
                            className="stat-link"
                            style={{ color: "var(--leg)" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteOrder(r);
                            }}
                            disabled={deletingId === r.order_id}
                          >
                            {deletingId === r.order_id ? "Deleting…" : "Delete order"}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

type OrderRenderItem = {
  tier: string;
  stage: string;
  style_name: string | null;
  custom_text: string | null;
  qc_denied_reason: string | null;
  qc_denied_style: string | null;
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
  // Stages live per render now, so "can this be pushed" is about how many
  // renders are still sitting at 'new' — not about the order's rolled-up
  // status, which says nothing about any individual render.
  const pushableCount = renderItems.filter(
    (item) => (item.tier === "curated" || item.tier === "premium") && item.stage === "new"
  ).length;

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to Orders</button>
      <div className="page-head">
        <div className="eyebrow" style={{ fontFamily: "monospace" }}>Order {order.id}</div>
        <h1>{order.property_address}</h1>
        <p>{order.customer_email ?? "no email"} — status: {orderStatusLabel(order.status)} — ${total} — placed {new Date(order.created_at).toLocaleString()}</p>
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
                <th>Stage</th>
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
                      <span className="pill">{stageLabel(item.stage)}</span>
                      {item.qc_denied_reason && (
                        <div className="note" style={{ marginTop: 4 }}>
                          QC denied{item.qc_denied_style ? ` ${item.qc_denied_style}` : ""}: {item.qc_denied_reason}
                        </div>
                      )}
                    </td>
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
          {pushableCount > 0 && (
            <button className="cfg-remove" onClick={pushToCurator} disabled={pushing}>
              {pushing ? "Pushing…" : `Push ${pushableCount} to Curator`}
            </button>
          )}
          {pushableCount === 0 && (
            <span className="note">
              Every curated/premium render on this order is already moving through the pipeline — see the
              stage on each below.
            </span>
          )}
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
  stage: string;
  style_id: string | null;
  style_name: string;
  custom_text: string | null;
  qc_denied_reason: string | null;
  qc_denied_style: string | null;
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
  // Everything this endpoint returns is at stage 'awaiting_curation', so
  // there is no assigned/unassigned split to make here any more.
  const unassigned = slots;

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
      let parsed: { error?: string; advancedToQc?: number } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
      setSentToQc((parsed?.advancedToQc ?? 0) > 0);
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
        <p>
          {unassigned.length} render{unassigned.length === 1 ? "" : "s"} waiting on a style
          {slots.some((s) => s.qc_denied_reason) ? ", including some QC sent back" : ""}.
        </p>
      </div>

      {sentToQc && (
        <p className="note">
          Saved — each render you styled has moved to <strong>Quality Control</strong> on its own. Any render
          still listed below is still waiting on you.
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
              {s.qc_denied_reason && (
                <span className="qc-denied">
                  Sent back by QC
                  {s.qc_denied_style ? ` — ${s.qc_denied_style} was rejected` : ""}: {s.qc_denied_reason}
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
  onDecided,
}: {
  jobId: string;
  onBack: () => void;
  onDecided: () => void;
}) {
  const [data, setData] = useState<QcWorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Prompt text is editable: the builder's output is a starting point the
  // reviewer is expected to tighten, and whatever they approve is what
  // gets recorded as the instruction production actually worked from.
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [denyReason, setDenyReason] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

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

  if (error && !data) return <p className="error-text">{error}</p>;
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

  // One render at a time, deliberately: approving and denying are
  // per-render decisions now, and a bulk control would quietly push
  // through renders the reviewer never actually looked at.
  async function decide(p: BuiltPrompt, action: "approve" | "deny") {
    setBusyId(p.orderItemId);
    setError(null);
    setLastResult(null);
    try {
      const r = await fetch(`/api/admin/qc/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          orderItemIds: [p.orderItemId],
          reason: action === "deny" ? denyReason[p.orderItemId] ?? "" : undefined,
          prompts:
            action === "approve"
              ? [
                  {
                    orderItemId: p.orderItemId,
                    assembledPrompt: promptText(p),
                    negativePrompt: p.negativePrompt,
                  },
                ]
              : undefined,
        }),
      });
      const text = await r.text();
      let parsed: { error?: string } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
      }
      if (!r.ok) throw new Error(parsed?.error ?? `HTTP ${r.status}`);
      setLastResult(
        action === "approve"
          ? `${p.styleName} approved — sent to production.`
          : `${p.styleName} denied — back with the curator.`
      );
      load();
      onDecided();
    } catch (e) {
      setError(`Could not ${action} that render: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to QC Queue</button>
      <div className="page-head">
        <div className="eyebrow">Quality Control</div>
        <h1>{job.propertyAddress}</h1>
        <p>{prompts.length} render{prompts.length === 1 ? "" : "s"} awaiting review.</p>
      </div>

      {error && <p className="error-text">{error}</p>}
      {lastResult && <p className="note">{lastResult}</p>}

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

      {prompts.length === 0 && (
        <div className="section-block">
          <p className="note">
            Nothing on this job is awaiting QC any more — every render has been decided. Head back to the queue.
          </p>
        </div>
      )}

      {prompts.map((p, i) => {
        const slot = slots.find((s) => s.id === p.orderItemId);
        return (
          <div className="section-block" key={p.orderItemId}>
            <h3>
              Render #{i + 1} — {p.styleName}{" "}
              <span className="note">({p.tier === "premium" ? "Premium" : "Curated"})</span>
            </h3>
            {slot?.tier === "premium" && slot.custom_text && (
              <p className="note" style={{ whiteSpace: "pre-wrap" }}>
                Customer&apos;s request: {slot.custom_text}
              </p>
            )}
            {slot && <p className="note">{slotLabel(slot)}</p>}

            <textarea
              className="prompt-box"
              value={promptText(p)}
              onChange={(e) => setEdited((cur) => ({ ...cur, [p.orderItemId]: e.target.value }))}
              rows={16}
            />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
              <button type="button" className="stat-link" onClick={() => copyPrompt(p)}>
                {copiedId === p.orderItemId ? "Copied" : "Copy prompt"}
              </button>
              <span className="note">Template {p.templateVersion}</span>
            </div>

            <div className="qc-decide">
              <button
                type="button"
                className="btn-primary"
                onClick={() => decide(p, "approve")}
                disabled={busyId !== null}
              >
                {busyId === p.orderItemId ? "Working…" : "Approve → Production"}
              </button>
              <input
                type="text"
                placeholder="Reason to send back to the curator…"
                value={denyReason[p.orderItemId] ?? ""}
                onChange={(e) => setDenyReason((cur) => ({ ...cur, [p.orderItemId]: e.target.value }))}
              />
              <button
                type="button"
                className="cfg-remove"
                onClick={() => decide(p, "deny")}
                disabled={busyId !== null || !(denyReason[p.orderItemId] ?? "").trim()}
              >
                Deny → Curation
              </button>
            </div>
            <div className="note" style={{ marginTop: 4 }}>
              Denying clears the style and puts this one render back in the Curation Queue with your reason
              attached. Everything else on this order carries on untouched.
            </div>
          </div>
        );
      })}
    </>
  );
}

type ProductionQueueRow = {
  job_id: string;
  property_address: string;
  curbappeal_photo_key: string | null;
  render_count: number;
  rendered_count: number;
  oldest_order_at: string;
};

function ProductionQueueSection({ onOpenJob }: { onOpenJob: (jobId: string) => void }) {
  const [jobs, setJobs] = useState<ProductionQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/production")
      .then(async (r) => {
        const text = await r.text();
        let parsed: { jobs?: ProductionQueueRow[]; error?: string } | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
        return parsed as { jobs: ProductionQueueRow[] };
      })
      .then((d) => setJobs(d.jobs ?? []))
      .catch((e: Error) => setError(`Failed to load production queue: ${e.message}`));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Production</div>
        <h1>Production Queue</h1>
        <p>QC-approved orders whose images still need generating. Oldest first.</p>
      </div>

      {error && <p className="error-text">{error}</p>}
      {!jobs && !error && <p className="loading">Loading…</p>}
      {jobs && jobs.length === 0 && <p className="loading">Nothing waiting on production right now.</p>}

      {jobs && jobs.length > 0 && (
        <div className="section-block">
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th>Address</th>
                <th>Rendered</th>
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
                  <td>
                    {j.rendered_count} / {j.render_count}
                  </td>
                  <td>{new Date(j.oldest_order_at).toLocaleString()}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenJob(j.job_id);
                      }}
                    >
                      Open
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

type ProductionPrompt = BuiltPrompt & {
  promptGenerationId: string | null;
  source: "qc_approved" | "rebuilt";
};

type RenderRow = {
  id: string;
  style_id: string;
  storage_key: string | null;
  delivered_key: string | null;
  iteration_number: number;
  qc_status: string;
  selected: number;
  created_at: string;
  style_name: string;
};

type ProductionWorkspaceData = {
  job: { id: string; propertyAddress: string; curbappealPhotoKey: string | null };
  slots: CurationSlot[];
  prompts: ProductionPrompt[];
  renders: RenderRow[];
  analysis: AnalysisSummary;
  topMatches: TopMatch[];
  curationRanks: CurationRank[];
  regulatory: RegulatorySummary;
  neighborhood: NeighborhoodSummary;
};

function ProductionWorkspaceSection({
  jobId,
  onBack,
  onRendered,
}: {
  jobId: string;
  onBack: () => void;
  onRendered: () => void;
}) {
  const [data, setData] = useState<ProductionWorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [renderingId, setRenderingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/admin/production/${jobId}`)
      .then(async (r) => {
        const text = await r.text();
        let parsed: (ProductionWorkspaceData & { error?: string }) | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${parsed?.error ?? "unknown error"}`);
        return parsed as ProductionWorkspaceData;
      })
      .then((d) => setData(d))
      .catch((e: Error) => setError(`Failed to load production workspace: ${e.message}`));
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !data) return <p className="error-text">{error}</p>;
  if (!data) return <p className="loading">Loading…</p>;

  const { job, prompts, renders, analysis, topMatches, curationRanks, regulatory, neighborhood } = data;

  function promptText(p: ProductionPrompt): string {
    return edited[p.orderItemId] ?? p.assembledPrompt;
  }

  async function renderSlot(p: ProductionPrompt) {
    setRenderingId(p.orderItemId);
    setError(null);
    try {
      const r = await fetch(`/api/admin/production/${jobId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId: p.orderItemId, prompt: promptText(p) }),
      });
      const text = await r.text();
      let parsed: { error?: string } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${r.status} — non-JSON response: ${text.slice(0, 200)}`);
      }
      if (!r.ok) throw new Error(parsed?.error ?? `HTTP ${r.status}`);
      load();
      onRendered();
    } catch (e) {
      setError(`Render failed: ${(e as Error).message}`);
    } finally {
      setRenderingId(null);
    }
  }

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to Production Queue</button>
      <div className="page-head">
        <div className="eyebrow">Production</div>
        <h1>{job.propertyAddress}</h1>
        <p>
          {renders.length} image{renders.length === 1 ? "" : "s"} generated across {prompts.length} ordered
          render{prompts.length === 1 ? "" : "s"}.
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

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

      <PropertyContextBlocks
        analysis={analysis}
        regulatory={regulatory}
        neighborhood={neighborhood}
        topMatches={topMatches}
        curationRanks={curationRanks}
      />

      <div className="section-block">
        <h3>Renders</h3>
        {prompts.length === 0 && <p className="note">No render on this job has a style assigned.</p>}

        {prompts.map((p, i) => {
          const mine = renders.filter((r) => r.style_id === p.styleId);
          return (
            <div key={p.orderItemId} style={{ marginTop: 22 }}>
              <strong>
                Render #{i + 1} — {p.styleName}{" "}
                <span className="note">({p.tier === "premium" ? "Premium" : "Curated"})</span>
              </strong>
              <div className="note" style={{ marginTop: 2 }}>
                {p.source === "qc_approved"
                  ? "Using the instruction QC approved."
                  : "No QC-approved instruction found for this style — rebuilt from the catalog."}
              </div>

              <textarea
                className="prompt-box"
                value={promptText(p)}
                onChange={(e) => setEdited((cur) => ({ ...cur, [p.orderItemId]: e.target.value }))}
                rows={12}
              />

              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => renderSlot(p)}
                  disabled={renderingId !== null}
                >
                  {renderingId === p.orderItemId
                    ? "Rendering… (up to a minute)"
                    : mine.length > 0
                      ? "Render Again"
                      : "Render with AI"}
                </button>
                <span className="note">
                  {mine.length} image{mine.length === 1 ? "" : "s"} so far
                </span>
              </div>

              {mine.length > 0 && (
                <div className="render-grid">
                  {mine.map((r) => (
                    <figure key={r.id} className="render-out">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/admin/media/${r.delivered_key ?? r.storage_key}`}
                        alt={`${r.style_name} render, iteration ${r.iteration_number}`}
                      />
                      <figcaption>
                        v{r.iteration_number} — {r.qc_status}
                        {r.selected ? " — selected" : ""}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
