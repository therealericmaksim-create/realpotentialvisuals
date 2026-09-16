// Centralizes every "system variable" this app lets staff manage without
// a deploy: API keys plus a couple of operational knobs. Backed by the
// `config` table (key/value — already existed in the canonical schema,
// unused until now). Design: a DB row OVERRIDES the Worker's own env
// var/secret, which stays as the DEFAULT. Nothing breaks on day one —
// every value keeps resolving exactly as it does today — and a principal
// can override any one of them from the admin's System Variables page at
// any time, with no deploy, no redeploy, no waiting on Cloudflare Workers
// Build.
//
// Deliberately NOT included here: CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD.
// Those gate the admin login itself. If a bad value ever got written to
// the DB for either, every admin login — including the one needed to
// undo it — would break, with no way back in except editing D1 directly
// outside the app. They stay as Worker secrets only, never DB-overridable.

export const CONFIG_KEYS = [
  "OPENAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "DAILY_INTAKE_CAP",
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

export const CONFIG_LABELS: Record<ConfigKey, string> = {
  OPENAI_API_KEY: "OpenAI API Key",
  STRIPE_SECRET_KEY: "Stripe Secret Key",
  STRIPE_PUBLISHABLE_KEY: "Stripe Publishable Key",
  STRIPE_WEBHOOK_SECRET: "Stripe Webhook Secret",
  RESEND_API_KEY: "Resend API Key",
  GOOGLE_MAPS_API_KEY: "Google Maps API Key",
  DAILY_INTAKE_CAP: "Daily Intake Cap",
};

export const CONFIG_SECRET: Record<ConfigKey, boolean> = {
  OPENAI_API_KEY: true,
  STRIPE_SECRET_KEY: true,
  STRIPE_PUBLISHABLE_KEY: false, // meant to be public, ships to the browser
  STRIPE_WEBHOOK_SECRET: true,
  RESEND_API_KEY: true,
  GOOGLE_MAPS_API_KEY: false, // public by design, protected by HTTP-referrer restriction instead
  DAILY_INTAKE_CAP: false,
};

export async function getConfigValue(
  db: D1Database,
  key: ConfigKey,
  envDefault: string | undefined
): Promise<string | undefined> {
  const row = await db
    .prepare(`SELECT value FROM config WHERE key = ?`)
    .bind(key)
    .first<{ value: string }>();
  return row?.value || envDefault;
}

// Every write here also appends to the pre-existing, previously-unused
// `events` audit table (entity_type = 'config') with the value being
// replaced. The `config` row itself only ever holds the CURRENT value —
// this is what makes an old key recoverable: query events directly in D1
// (`SELECT * FROM events WHERE entity_type = 'config' AND entity_id = ?
// ORDER BY created_at DESC`), no admin UI involved, so a bad rotation can
// always be reverted by hand even if the UI itself is what's broken.
async function logConfigEvent(
  db: D1Database,
  key: ConfigKey,
  oldValue: string | null,
  newValue: string | null,
  updatedByStaffId: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO events (id, entity_type, entity_id, event_type, actor_type, actor_id, payload, created_at)
       VALUES (?, 'config', ?, 'config_updated', 'staff', ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      key,
      updatedByStaffId,
      JSON.stringify({ old_value: oldValue, new_value: newValue }),
      new Date().toISOString()
    )
    .run();
}

export async function setConfigValue(
  db: D1Database,
  key: ConfigKey,
  value: string,
  updatedByStaffId: string
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.prepare(`SELECT value FROM config WHERE key = ?`).bind(key).first<{ value: string }>();

  await db
    .prepare(
      `INSERT INTO config (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    )
    .bind(key, value, updatedByStaffId, now)
    .run();

  await logConfigEvent(db, key, existing?.value ?? null, value, updatedByStaffId);
}

// Reverts a key to its Worker env default by removing the DB override.
// Logs the same way as setConfigValue, so "what was the override before
// it got cleared" is answerable from the events table too.
export async function clearConfigValue(
  db: D1Database,
  key: ConfigKey,
  updatedByStaffId: string
): Promise<void> {
  const existing = await db.prepare(`SELECT value FROM config WHERE key = ?`).bind(key).first<{ value: string }>();
  if (!existing) return;

  await db.prepare(`DELETE FROM config WHERE key = ?`).bind(key).run();
  await logConfigEvent(db, key, existing.value, null, updatedByStaffId);
}
