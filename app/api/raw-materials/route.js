import { NextResponse } from "next/server";
import { getPool, query } from "../../../lib/db";
import { requireAuth, requireAdmin, requireRmManagerOrAdmin } from "../../../lib/apiGuard";

// All authenticated users (admin + estimator) can VIEW raw materials,
// since estimators need to see what drives formulation cost.
// Only admins can create/edit/delete (enforced in this route and [id]/route.js).

export async function GET(request) {
  const user = requireAuth(request);
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  const result = search
    ? await query(
        `SELECT id, name, price_per_kg, density_kg_per_litre, supplier, notes, is_active, updated_at
         FROM raw_materials
         WHERE name ILIKE $1 AND is_active = true
         ORDER BY name ASC`,
        [`%${search}%`]
      )
    : await query(
        `SELECT id, name, price_per_kg, density_kg_per_litre, supplier, notes, is_active, updated_at
         FROM raw_materials
         WHERE is_active = true
         ORDER BY name ASC`
      );
  return NextResponse.json({ rawMaterials: result.rows });
}

/**
 * Creates one raw material, OR many at once for bulk entry.
 * Body shape for single: { name, pricePerKg, densityKgPerLitre, supplier, notes }
 * Body shape for bulk:   { items: [ { name, pricePerKg, ... }, ... ] }
 * Each created material also gets its first price_history row written.
 * Accessible by admin and rm_manager roles.
 */
export async function POST(request) {
  const user = requireRmManagerOrAdmin(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const items = Array.isArray(body.items) ? body.items : [body];

  if (items.length === 0) {
    return NextResponse.json({ error: "No raw materials provided." }, { status: 400 });
  }
  for (const item of items) {
    if (!item.name || item.pricePerKg === undefined || item.pricePerKg === null || item.pricePerKg === "") {
      return NextResponse.json({ error: "Each raw material needs a name and price per kg." }, { status: 400 });
    }
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = [];
    const errors = [];

    for (const item of items) {
      try {
        const result = await client.query(
          `INSERT INTO raw_materials (name, price_per_kg, density_kg_per_litre, supplier, notes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, price_per_kg, density_kg_per_litre, supplier, notes, is_active, updated_at`,
          [item.name.trim(), item.pricePerKg, item.densityKgPerLitre || 1.0, item.supplier || null, item.notes || null]
        );
        const rm = result.rows[0];
        await client.query(
          `INSERT INTO raw_material_price_history (raw_material_id, price_per_kg) VALUES ($1, $2)`,
          [rm.id, rm.price_per_kg]
        );
        created.push(rm);
      } catch (err) {
        if (err.code === "23505") {
          errors.push(`"${item.name}" already exists — skipped.`);
        } else {
          throw err;
        }
      }
    }

    await client.query("COMMIT");

    if (created.length === 0) {
      return NextResponse.json({ error: errors.join(" ") || "Could not create raw material(s)." }, { status: 409 });
    }
    return NextResponse.json({ rawMaterial: created[0], created, errors }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create raw material error:", err);
    return NextResponse.json({ error: "Could not create raw material(s)." }, { status: 500 });
  } finally {
    client.release();
  }
}
