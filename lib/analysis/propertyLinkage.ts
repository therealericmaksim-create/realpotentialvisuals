// Creates the client -> property -> job chain the schema always wanted
// orders to flow through (orders.job_id was reserved for this from the
// start — "no client/property/job intake flow exists yet"). Called the
// moment an order is confirmed paid, so by the time staff open the admin
// panel the order already has something to run Phase 2 analysis against —
// this function only sets up the linkage, it never spends AI credits.
//
// clients.google_account_id is NOT NULL UNIQUE in the schema, written for
// a real Google-authenticated customer portal that doesn't exist yet —
// there's no real Google account here, so a "guest:<email>" placeholder is
// used. Revisit once real customer accounts exist.

export async function ensurePropertyLinkage(
  db: D1Database,
  orderId: string
): Promise<{ clientId: string; propertyId: string; jobId: string } | null> {
  const order = await db
    .prepare(`SELECT id, job_id, property_address, customer_email FROM orders WHERE id = ?`)
    .bind(orderId)
    .first<{ id: string; job_id: string | null; property_address: string | null; customer_email: string | null }>();

  if (!order) return null;

  // Already linked — idempotent, safe to call more than once per order.
  if (order.job_id) {
    const job = await db
      .prepare(`SELECT client_id, property_id FROM jobs WHERE id = ?`)
      .bind(order.job_id)
      .first<{ client_id: string; property_id: string }>();
    if (job) return { clientId: job.client_id, propertyId: job.property_id, jobId: order.job_id };
  }

  if (!order.property_address || !order.customer_email) return null;

  const now = new Date().toISOString();
  const googleAccountId = `guest:${order.customer_email.toLowerCase()}`;

  let client = await db
    .prepare(`SELECT id FROM clients WHERE google_account_id = ?`)
    .bind(googleAccountId)
    .first<{ id: string }>();

  if (!client) {
    const clientId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO clients (id, google_account_id, email, client_type, created_at)
         VALUES (?, ?, ?, 'consumer', ?)`
      )
      .bind(clientId, googleAccountId, order.customer_email, now)
      .run();
    client = { id: clientId };
  }

  const propertyId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO properties (id, client_id, address, created_at) VALUES (?, ?, ?, ?)`
    )
    .bind(propertyId, client.id, order.property_address, now)
    .run();

  const jobId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO jobs (id, client_id, property_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'intake_pending', ?, ?)`
    )
    .bind(jobId, client.id, propertyId, now, now)
    .run();

  await db.prepare(`UPDATE orders SET job_id = ? WHERE id = ?`).bind(jobId, orderId).run();

  return { clientId: client.id, propertyId, jobId };
}
