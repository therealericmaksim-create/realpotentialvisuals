import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

// Style search for curators. The 133-style dropdown is organised by
// family, which only helps if you already know which family you want —
// it cannot answer "which styles suit a brick house", and that is exactly
// the question that comes up when a customer asks for something the
// building cannot physically take.
//
// So this searches the STYLE'S OWN DESCRIPTION and its typical materials,
// not just its name. A search for "brick" finds the styles whose catalog
// description or material palette actually involves brick, which is the
// useful answer.

type StyleHit = {
  id: string;
  name: string;
  family: string;
  description: string | null;
  materials: string | null;
  matched_on: string;
};

export async function GET(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ styles: [], note: "Type at least two characters." });
  }

  const { env } = getCloudflareContext();
  const like = `%${q.toLowerCase()}%`;

  // matched_on tells the curator WHY a style came back — a hit in the
  // material palette means something different from a hit in the prose.
  const rows = await env.DB.prepare(
    `SELECT s.id, s.name, s.family, s.description,
            (SELECT GROUP_CONCAT(m.name, ', ')
             FROM style_materials_typical smt JOIN materials m ON m.id = smt.material_id
             WHERE smt.style_id = s.id) AS materials,
            CASE
              WHEN LOWER(s.name) LIKE ?1 THEN 'name'
              WHEN LOWER(s.family) LIKE ?1 THEN 'family'
              WHEN EXISTS (
                SELECT 1 FROM style_materials_typical smt2
                JOIN materials m2 ON m2.id = smt2.material_id
                WHERE smt2.style_id = s.id AND LOWER(m2.name) LIKE ?1
              ) THEN 'materials'
              ELSE 'description'
            END AS matched_on
     FROM styles s
     WHERE s.active = 1
       AND (
         LOWER(s.name) LIKE ?1
         OR LOWER(s.family) LIKE ?1
         OR LOWER(COALESCE(s.description,'')) LIKE ?1
         OR EXISTS (
           SELECT 1 FROM style_materials_typical smt3
           JOIN materials m3 ON m3.id = smt3.material_id
           WHERE smt3.style_id = s.id AND LOWER(m3.name) LIKE ?1
         )
       )
     ORDER BY
       CASE
         WHEN LOWER(s.name) LIKE ?1 THEN 0
         WHEN EXISTS (
           SELECT 1 FROM style_materials_typical smt4
           JOIN materials m4 ON m4.id = smt4.material_id
           WHERE smt4.style_id = s.id AND LOWER(m4.name) LIKE ?1
         ) THEN 1
         ELSE 2
       END,
       s.name
     LIMIT 40`
  )
    .bind(like)
    .all<StyleHit>();

  return NextResponse.json({ styles: rows.results ?? [] });
}
