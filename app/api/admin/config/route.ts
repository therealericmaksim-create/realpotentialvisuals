import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { hasRole } from "@/lib/staffAuth";
import {
  CONFIG_KEYS,
  CONFIG_LABELS,
  CONFIG_SECRET,
  CONFIG_NUMERIC,
  CONFIG_HARDCODED_DEFAULT,
  setConfigValue,
  clearConfigValue,
  type ConfigKey,
} from "@/lib/systemConfig";

// System Variables page — principal-only. Every value here already has a
// working default (a Worker env var/secret); a row in the `config` table
// simply overrides that default, so staff can rotate a key with no
// deploy. See lib/systemConfig.ts for the full design rationale and why
// CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD are deliberately excluded.

async function requirePrincipal() {
  const staff = await getCurrentStaff();
  if (!staff || !hasRole(staff, "principal")) return null;
  return staff;
}

export async function GET() {
  const staff = await requirePrincipal();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { env } = getCloudflareContext();
  const db = env.DB;

  const rows = await db.prepare(`SELECT key, value, updated_at FROM config`).all<{
    key: string;
    value: string;
    updated_at: string;
  }>();
  const dbRows = new Map((rows.results ?? []).map((r) => [r.key, r]));

  const variables = CONFIG_KEYS.map((key) => {
    const dbRow = dbRows.get(key);
    // Pricing keys (and any other future key with no env var backing)
    // fall back to a hardcoded default instead of a Worker env var.
    const envDefault: string | undefined = CONFIG_HARDCODED_DEFAULT[key] ?? (env as unknown as Record<string, string | undefined>)[key];
    return {
      key,
      label: CONFIG_LABELS[key],
      secret: CONFIG_SECRET[key],
      numeric: CONFIG_NUMERIC[key],
      value: dbRow?.value ?? envDefault ?? "",
      source: dbRow ? ("db" as const) : envDefault ? ("env" as const) : ("unset" as const),
      updatedAt: dbRow?.updated_at ?? null,
    };
  });

  return NextResponse.json({ variables });
}

type ConfigUpdateBody = { updates?: Partial<Record<ConfigKey, string>> };

export async function PUT(req: NextRequest) {
  const staff = await requirePrincipal();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = (await req.json()) as ConfigUpdateBody;
  const updates = body.updates ?? {};

  const { env } = getCloudflareContext();
  const db = env.DB;

  for (const [key, value] of Object.entries(updates)) {
    if (!(CONFIG_KEYS as readonly string[]).includes(key)) continue;
    const configKey = key as ConfigKey;
    const trimmed = (value ?? "").trim();
    if (trimmed) {
      await setConfigValue(db, configKey, trimmed, staff.id);
    } else {
      // Empty value means "revert to the Worker env default" rather than
      // storing an empty override that would shadow a working env var.
      await clearConfigValue(db, configKey, staff.id);
    }
  }

  return NextResponse.json({ ok: true });
}
