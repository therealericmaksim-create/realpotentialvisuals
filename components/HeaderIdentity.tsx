"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CustomerIdentity = { name: string | null; email: string | null };

// Sits in the site header on every page, to the right of Order Now.
// Renders nothing at all when signed out (or while the check is still in
// flight) so the header doesn't flash a placeholder for the many visitors
// who never sign in.
export default function HeaderIdentity() {
  const [identity, setIdentity] = useState<CustomerIdentity | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json() as Promise<{ identity: CustomerIdentity | null }>)
      .then((data) => setIdentity(data.identity))
      .catch(() => setIdentity(null));
  }, []);

  if (!identity) return null;

  return (
    <span className="nav-identity">
      {/* The name doubles as the way into order history — otherwise /orders
          has no entry point anywhere in the site. */}
      <Link href="/orders" className="nav-identity-name">
        {identity.name || identity.email}
      </Link>
      {" - "}
      <button
        type="button"
        className="nav-logout"
        onClick={() =>
          fetch("/api/auth/logout", { method: "POST" }).then(() => {
            // Full reload rather than local state: signing out has to take
            // /start back to its sign-in gate, and that page reads the
            // session on mount.
            window.location.reload();
          })
        }
      >
        LOGOUT
      </button>
    </span>
  );
}
