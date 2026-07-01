import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { requireAuth, requireAdmin, rejectRmManager } from "../../../../lib/apiGuard";
import { computeFormulationCost } from "../../../../lib/costing";

export async function GET(request, { params }) {
  const user = rejectRmManager(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  const productResult = await query(
    `SELECT id, name, category, pack_type, notes, is_active, created_at FROM products WHERE id = $1`,
    [id]
  );
  const product = productResult.rows[0];
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const formulationsResult = await query(
    `SELECT id, customer_name, loss_pct, batch_size_kg, base_packing_id, hardener_packing_id, component_c_packing_id,
            mix_ratio_weight_base, mix_ratio_weight_hard, mix_ratio_weight_c,
            mix_ratio_vol_base, mix_ratio_vol_hard, mix_ratio_vol_c,
            litre_density_kg_per_l, base_litre_density_kg_per_l, hardener_litre_density_kg_per_l, component_c_litre_density_kg_per_l,
            is_active, created_at, updated_at
     FROM formulations
     WHERE product_id = $1 AND is_active = true
     ORDER BY customer_name ASC`,
    [id]
  );

  const formulationsWithCost = await Promise.all(
    formulationsResult.rows.map(async (f) => {
      const cost = await computeFormulationCost(f.id);
      return { ...f, cost };
    })
  );

  return NextResponse.json({ product, formulations: formulationsWithCost });
}

export async function PUT(request, { params }) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  try {
    const { name, category, notes, isActive } = await request.json();
    const result = await query(
      `UPDATE products
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           notes = COALESCE($3, notes),
           is_active = COALESCE($4, is_active)
       WHERE id = $5
       RETURNING id, name, category, pack_type, notes, is_active, created_at`,
      [name, category, notes, isActive, id]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    return NextResponse.json({ product: result.rows[0] });
  } catch (err) {
    console.error("Update product error:", err);
    return NextResponse.json({ error: "Could not update product." }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  try {
    const result = await query(
      `UPDATE products SET is_active = false WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete product error:", err);
    return NextResponse.json({ error: "Could not delete product." }, { status: 500 });
  }
}
