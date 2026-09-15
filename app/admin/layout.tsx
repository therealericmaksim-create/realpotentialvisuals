import Link from "next/link";
import { getCurrentStaff } from "@/lib/currentStaff";

// The real authorization gate for everything under /admin. Cloudflare
// Access (in front of this Worker) only proves "a real, Google-verified
// human is making this request" — it has no concept of this app's own
// staff/roles. This layout is what actually decides whether that person
// is staff at all; individual pages (e.g. app/admin/staff) additionally
// check for a specific role on top of this baseline.
//
// Fails closed on every branch: no verified identity, or a verified
// identity that isn't an active staff row, both render the same "not
// authorized" shell instead of the page underneath.

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getCurrentStaff();

  if (!staff) {
    return (
      <AdminShell>
        <h1>Access Pending or Not Authorized</h1>
        <p>
          Either Cloudflare Access rejected this request, or your Google
          account isn&apos;t on the staff list yet. Contact the Principal
          to be added.
        </p>
      </AdminShell>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#e5e5e5" }}>
      <div
        style={{
          borderBottom: "1px solid #333",
          padding: "12px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
        }}
      >
        <Link
          href="/"
          style={{ color: "#e5e5e5", textDecoration: "none", fontWeight: 600 }}
        >
          RealPotential Admin
        </Link>
        <span style={{ color: "#999" }}>
          {staff.name} — {staff.roles.join(", ") || "no role"}
        </span>
      </div>
      {children}
    </div>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 640,
        margin: "60px auto",
        padding: "0 20px",
        color: "#e5e5e5",
        background: "#111",
      }}
    >
      {children}
    </div>
  );
}
