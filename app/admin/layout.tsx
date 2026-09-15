import { getCurrentStaff } from "@/lib/currentStaff";

// The real authorization gate for everything under /admin. Cloudflare
// Access (in front of this Worker) only proves "a real, Google-verified
// human is making this request" — it has no concept of this app's own
// staff/roles. This layout is what actually decides whether that person
// is staff at all; individual API routes additionally check for a
// specific role (principal) on top of this baseline where needed.
//
// Fails closed on every branch: no verified identity, or a verified
// identity that isn't an active staff row, both render the same "not
// authorized" shell instead of the page underneath.
//
// The actual admin UI (header/sidebar/content) lives entirely in
// app/admin/AdminApp.tsx as a single client-rendered page — this layout
// only decides whether that component gets to render at all.

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getCurrentStaff();

  if (!staff) {
    return (
      <div
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: 640,
          margin: "60px auto",
          padding: "0 20px",
          color: "#e5e5e5",
          background: "#111",
          minHeight: "100vh",
        }}
      >
        <h1>Access Pending or Not Authorized</h1>
        <p>
          Either Cloudflare Access rejected this request, or your Google
          account isn&apos;t on the staff list yet. Contact the Principal
          to be added.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
