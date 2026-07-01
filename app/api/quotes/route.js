import { NextResponse } from "next/server";
import { getPool, query } from "../../../lib/db";
import { requireAuth, rejectRmManager } from "../../../lib/apiGuard";
import { computeFormulationCost } from "../../../lib/costing";

export async function GET(request) {
  const user = rejectRmManager(request);
  if (user instanceof NextResponse) return user;

  // Admins see all quotes; estimators see their own.
  const isAdmin = user.role === "admin";
  const result = await query(
    `SELECT q.id, q.name, q.client_name, q.margin_pct, q.gst_pct, q.grand_total, q.created_at,
            u.name AS created_by_name
     FROM quotes q
     LEFT JOIN users u ON u.id = q.created_by
     ${isAdmin ? "" : "WHERE q.created_by = $1"}
     ORDER BY q.created_at DESC`,
    isAdmin ? [] : [user.id]
  );
  return NextResponse.json({ quotes: result.rows });
}

/**
 * Creates a quote with line items. Each line references a formulation and
 * an ordered quantity (kg OR litre). Cost is computed fresh at quote time
 * and snapshotted into quote_lines so historical quotes don't silently
 * change if raw material prices move later.
 *
 * Body:
 * {
 *   name, clientName, marginPct, gstPct,
 *   lines: [{ formulationId, quantityKg?, quantityLitre? }, ...]
 * }
 */
export async function POST(request) {
  const user = requireAuth(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const { name, clientName, marginPct, gstPct, lines } = body;

  if (!name || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "Quote name and at least one line item are required." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const margin = marginPct ?? 18;
    const gst = gstPct ?? 18;

    let grandTotal = 0;
    const computedLines = [];

    for (const line of lines) {
      const cost = await computeFormulationCost(line.formulationId);
      const qtyKg = line.quantityKg || 0;
      const qtyLitre = line.quantityLitre || 0;

      // Cost base: prefer kg if given, else convert litre using this formulation's cost/litre.
      let costBase;
      if (qtyKg > 0) {
        costBase = qtyKg * cost.costPerKg;
      } else if (qtyLitre > 0) {
        if (cost.costPerLitre === null) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: `"${cost.productName} — ${cost.customerName}" has no weight-per-litre set yet, so it can't be quoted by litre. Quote by kg instead, or set the weight-per-litre value on that formulation first.` },
            { status: 400 }
          );
        }
        costBase = qtyLitre * cost.costPerLitre;
      } else {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Each quote line needs a quantity in kg or litres." }, { status: 400 });
      }

      const withMargin = costBase * (1 + margin / 100);
      const withGst = withMargin * (1 + gst / 100);
      grandTotal += withGst;

      computedLines.push({
        formulationId: line.formulationId,
        productName: cost.productName,
        customerSpec: cost.customerName,
        quantityKg: qtyKg || null,
        quantityLitre: qtyLitre || null,
        costPerKgSnap: cost.costPerKg,
        costPerLitreSnap: cost.costPerLitre,
        lineTotal: withGst,
      });
    }

    const quoteResult = await client.query(
      `INSERT INTO quotes (name, client_name, created_by, margin_pct, gst_pct, grand_total)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [name.trim(), clientName || null, user.id, margin, gst, grandTotal]
    );
    const quoteId = quoteResult.rows[0].id;

    for (const cl of computedLines) {
      await client.query(
        `INSERT INTO quote_lines
          (quote_id, formulation_id, product_name, customer_spec, quantity_kg, quantity_litre,
           cost_per_kg_snap, cost_per_litre_snap, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          quoteId,
          cl.formulationId,
          cl.productName,
          cl.customerSpec,
          cl.quantityKg,
          cl.quantityLitre,
          cl.costPerKgSnap,
          cl.costPerLitreSnap,
          cl.lineTotal,
        ]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ quoteId, grandTotal }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create quote error:", err);
    return NextResponse.json({ error: "Could not create quote." }, { status: 500 });
  } finally {
    client.release();
  }
}
