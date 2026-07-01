import { NextResponse } from "next/server";
import { getPool, query } from "../../../../lib/db";
import { requireRmManagerOrAdmin } from "../../../../lib/apiGuard";

export async function PUT(request, { params }) {
  const user = requireRmManagerOrAdmin(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  const pool = getPool();
  const client = await pool.connect();
  try {
    const { name, pricePerKg, densityKgPerLitre, supplier, notes, isActive } = await request.json();

    await client.query("BEGIN");

    // If the price is actually changing, archive the OLD value first.
    if (pricePerKg !== undefined && pricePerKg !== null) {
      const existing = await client.query(`SELECT price_per_kg FROM raw_materials WHERE id = $1`, [id]);
      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Raw material not found." }, { status: 404 });
      }
      const oldPrice = Number(existing.rows[0].price_per_kg);
      if (oldPrice !== Number(pricePerKg)) {
        await client.query(
          `INSERT INTO raw_material_price_history (raw_material_id, price_per_kg) VALUES ($1, $2)`,
          [id, oldPrice]
        );
      }
    }

    const result = await client.query(
      `UPDATE raw_materials
       SET name = COALESCE($1, name),
           price_per_kg = COALESCE($2, price_per_kg),
           density_kg_per_litre = COALESCE($3, density_kg_per_litre),
           supplier = COALESCE($4, supplier),
           notes = COALESCE($5, notes),
           is_active = COALESCE($6, is_active),
           updated_at = now()
       WHERE id = $7
       RETURNING id, name, price_per_kg, density_kg_per_litre, supplier, notes, is_active, updated_at`,
      [name, pricePerKg, densityKgPerLitre, supplier, notes, isActive, id]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Raw material not found." }, { status: 404 });
    }

    await client.query("COMMIT");
    return NextResponse.json({ rawMaterial: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update raw material error:", err);
    return NextResponse.json({ error: "Could not update raw material." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request, { params }) {
  const user = requireRmManagerOrAdmin(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  try {
    // Soft-delete to avoid breaking formulation_lines that reference this material.
    const result = await query(
      `UPDATE raw_materials SET is_active = false, updated_at = now() WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Raw material not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete raw material error:", err);
    return NextResponse.json({ error: "Could not delete raw material." }, { status: 500 });
  }
}
