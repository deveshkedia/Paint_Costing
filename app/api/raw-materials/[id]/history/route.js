import { NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { requireAuth } from "../../../../../lib/apiGuard";

/**
 * Returns the full price timeline for a raw material: every archived
 * historical price plus the current live price, in chronological order.
 * Optional ?from=ISO_DATE&to=ISO_DATE to bound the range.
 */
export async function GET(request, { params }) {
  const user = requireAuth(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const currentResult = await query(
    `SELECT name, price_per_kg, updated_at FROM raw_materials WHERE id = $1`,
    [id]
  );
  const current = currentResult.rows[0];
  if (!current) {
    return NextResponse.json({ error: "Raw material not found." }, { status: 404 });
  }

  let historyQuery = `SELECT price_per_kg, recorded_at FROM raw_material_price_history WHERE raw_material_id = $1`;
  const queryParams = [id];
  if (from) {
    queryParams.push(from);
    historyQuery += ` AND recorded_at >= $${queryParams.length}`;
  }
  if (to) {
    queryParams.push(to);
    historyQuery += ` AND recorded_at <= $${queryParams.length}`;
  }
  historyQuery += ` ORDER BY recorded_at ASC`;

  const historyResult = await query(historyQuery, queryParams);

  const timeline = [
    ...historyResult.rows.map((r) => ({ pricePerKg: Number(r.price_per_kg), date: r.recorded_at })),
    { pricePerKg: Number(current.price_per_kg), date: current.updated_at, isCurrent: true },
  ];

  return NextResponse.json({ name: current.name, timeline });
}
