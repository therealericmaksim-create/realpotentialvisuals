// Daily-intake-cap reservation (Automation Routing Sheet Phase 1, step 6):
// "Reserve -> confirm as one atomic operation, so concurrent orders can't
// oversell the day." A single UPSERT does both in one D1 round-trip — no
// separate read-then-write, so there's no window for two concurrent
// requests to both see room and both take the last slot.

const DEFAULT_DAILY_CAP = 5;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

export function getDailyIntakeCap(env: { DAILY_INTAKE_CAP?: string }): number {
  const parsed = Number(env.DAILY_INTAKE_CAP);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_CAP;
}

export type ReservationResult =
  | { reserved: true; position: number; cap: number }
  | { reserved: false; cap: number };

// Attempts to claim the next slot for today. Returns reserved:false without
// writing anything if today's cap is already met.
export async function reserveDailyIntakeSlot(
  db: D1Database,
  env: { DAILY_INTAKE_CAP?: string }
): Promise<ReservationResult> {
  const cap = getDailyIntakeCap(env);
  const date = todayUtc();

  const row = await db
    .prepare(
      `INSERT INTO daily_intake (intake_date, reserved_count) VALUES (?, 1)
       ON CONFLICT(intake_date) DO UPDATE SET reserved_count = reserved_count + 1
       WHERE daily_intake.reserved_count < ?
       RETURNING reserved_count`
    )
    .bind(date, cap)
    .first<{ reserved_count: number }>();

  if (!row) {
    return { reserved: false, cap };
  }
  return { reserved: true, position: row.reserved_count, cap };
}
