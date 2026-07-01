import { NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { requireAuth } from "../../../../../lib/apiGuard";

/**
 * Returns the dated cost history for a formulation — every snapshot taken
 * whenever it was created or edited. Optional ?from=ISO_DATE&to=ISO_DATE.
 */
export async function GET(request, { params }) {
  const user = requireAuth(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const formResult = await query(
    `SELECT f.customer_name, p.name AS product_name FROM formulations f JOIN products p ON p.id = f.product_id WHERE f.id = $1`,
    [id]
  );
  if (formResult.rows.length === 0) {
    return NextResponse.json({ error: "Formulation not found." }, { status: 404 });
  }

  let historyQuery = `SELECT cost_per_kg, cost_per_litre, litre_density_kg_per_l, recorded_at
                       FROM formulation_cost_history WHERE formulation_id = $1`;
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

  return NextResponse.json({
    productName: formResult.rows[0].product_name,
    customerName: formResult.rows[0].customer_name,
    history: historyResult.rows,
  });
}
