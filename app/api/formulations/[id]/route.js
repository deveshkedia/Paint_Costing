import { NextResponse } from "next/server";
import { getPool, query } from "../../../../lib/db";
import { requireAuth, requireAdmin } from "../../../../lib/apiGuard";
import { computeFormulationCost, snapshotFormulationCost } from "../../../../lib/costing";

export async function GET(request, { params }) {
  const user = requireAuth(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  const formResult = await query(
    `SELECT f.*, p.name AS product_name, p.pack_type
     FROM formulations f JOIN products p ON p.id = f.product_id
     WHERE f.id = $1`,
    [id]
  );
  const formulation = formResult.rows[0];
  if (!formulation) {
    return NextResponse.json({ error: "Formulation not found." }, { status: 404 });
  }

  const linesResult = await query(
    `SELECT fl.id, fl.side, fl.qty_kg, fl.percent, rm.id AS raw_material_id, rm.name AS raw_material_name,
            rm.price_per_kg, rm.density_kg_per_litre
     FROM formulation_lines fl
     JOIN raw_materials rm ON rm.id = fl.raw_material_id
     WHERE fl.formulation_id = $1
     ORDER BY fl.side ASC, rm.name ASC`,
    [id]
  );

  const cost = await computeFormulationCost(id);

  return NextResponse.json({ formulation, lines: linesResult.rows, cost });
}

function resolveQtyAndPercent(line, batchSize) {
  let qtyKg = line.qtyKg !== undefined && line.qtyKg !== null && line.qtyKg !== "" ? Number(line.qtyKg) : null;
  let percent = line.percent !== undefined && line.percent !== null && line.percent !== "" ? Number(line.percent) : null;
  if (qtyKg === null && percent !== null && batchSize) {
    qtyKg = (percent / 100) * batchSize;
  } else if (percent === null && qtyKg !== null && batchSize) {
    percent = (qtyKg / batchSize) * 100;
  }
  return { qtyKg: qtyKg || 0, percent };
}

/**
 * Full update: replaces the formulation's header fields and, if `baseLines`/
 * `hardenerLines`/`componentCLines` are supplied, replaces all
 * formulation_lines too (within a transaction) so editing a recipe is
 * atomic. Records a fresh cost history snapshot after any edit.
 */
export async function PUT(request, { params }) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  const body = await request.json();
  const {
    customerName,
    lossPct,
    batchSizeKg,
    basePackingId,
    hardenerPackingId,
    componentCPackingId,
    mixRatioWeightBase,
    mixRatioWeightHard,
    mixRatioWeightC,
    mixRatioVolBase,
    mixRatioVolHard,
    mixRatioVolC,
    litreDensityKgPerL,
    baseLitreDensityKgPerL,
    hardenerLitreDensityKgPerL,
    componentCLitreDensityKgPerL,
    baseLines,
    hardenerLines,
    componentCLines,
    isActive,
  } = body;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT f.id, f.batch_size_kg, p.pack_type FROM formulations f JOIN products p ON p.id = f.product_id WHERE f.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Formulation not found." }, { status: 404 });
    }
    const packType = existing.rows[0].pack_type;
    const isMultiPack = packType !== "single";
    const isThreePack = packType === "three_pack";
    // Use the newly-provided batch size if given, else fall back to the existing one for line recalculation.
    const effectiveBatchSize = batchSizeKg !== undefined && batchSizeKg !== null && batchSizeKg !== ""
      ? Number(batchSizeKg)
      : existing.rows[0].batch_size_kg ? Number(existing.rows[0].batch_size_kg) : null;

    await client.query(
      `UPDATE formulations
       SET customer_name = COALESCE($1, customer_name),
           loss_pct = COALESCE($2, loss_pct),
           batch_size_kg = COALESCE($3, batch_size_kg),
           base_packing_id = COALESCE($4, base_packing_id),
           hardener_packing_id = COALESCE($5, hardener_packing_id),
           component_c_packing_id = COALESCE($6, component_c_packing_id),
           mix_ratio_weight_base = COALESCE($7, mix_ratio_weight_base),
           mix_ratio_weight_hard = COALESCE($8, mix_ratio_weight_hard),
           mix_ratio_weight_c = COALESCE($9, mix_ratio_weight_c),
           mix_ratio_vol_base = COALESCE($10, mix_ratio_vol_base),
           mix_ratio_vol_hard = COALESCE($11, mix_ratio_vol_hard),
           mix_ratio_vol_c = COALESCE($12, mix_ratio_vol_c),
           litre_density_kg_per_l = COALESCE($13, litre_density_kg_per_l),
           base_litre_density_kg_per_l = COALESCE($14, base_litre_density_kg_per_l),
           hardener_litre_density_kg_per_l = COALESCE($15, hardener_litre_density_kg_per_l),
           component_c_litre_density_kg_per_l = COALESCE($16, component_c_litre_density_kg_per_l),
           is_active = COALESCE($17, is_active),
           updated_at = now()
       WHERE id = $18`,
      [
        customerName,
        lossPct,
        batchSizeKg || null,
        basePackingId,
        hardenerPackingId,
        componentCPackingId,
        mixRatioWeightBase,
        mixRatioWeightHard,
        mixRatioWeightC,
        mixRatioVolBase,
        mixRatioVolHard,
        mixRatioVolC,
        litreDensityKgPerL,
        baseLitreDensityKgPerL,
        hardenerLitreDensityKgPerL,
        componentCLitreDensityKgPerL,
        isActive,
        id,
      ]
    );

    if (Array.isArray(baseLines)) {
      const side = isMultiPack ? "base" : "single";
      await client.query(`DELETE FROM formulation_lines WHERE formulation_id = $1 AND side = $2`, [id, side]);
      for (const line of baseLines) {
        const { qtyKg, percent } = resolveQtyAndPercent(line, effectiveBatchSize);
        await client.query(
          `INSERT INTO formulation_lines (formulation_id, raw_material_id, side, qty_kg, percent) VALUES ($1,$2,$3,$4,$5)`,
          [id, line.rawMaterialId, side, qtyKg, percent]
        );
      }
    }
    if (isMultiPack && Array.isArray(hardenerLines)) {
      await client.query(`DELETE FROM formulation_lines WHERE formulation_id = $1 AND side = 'hardener'`, [id]);
      for (const line of hardenerLines) {
        const { qtyKg, percent } = resolveQtyAndPercent(line, effectiveBatchSize);
        await client.query(
          `INSERT INTO formulation_lines (formulation_id, raw_material_id, side, qty_kg, percent) VALUES ($1,$2,'hardener',$3,$4)`,
          [id, line.rawMaterialId, qtyKg, percent]
        );
      }
    }
    if (isThreePack && Array.isArray(componentCLines)) {
      await client.query(`DELETE FROM formulation_lines WHERE formulation_id = $1 AND side = 'component_c'`, [id]);
      for (const line of componentCLines) {
        const { qtyKg, percent } = resolveQtyAndPercent(line, effectiveBatchSize);
        await client.query(
          `INSERT INTO formulation_lines (formulation_id, raw_material_id, side, qty_kg, percent) VALUES ($1,$2,'component_c',$3,$4)`,
          [id, line.rawMaterialId, qtyKg, percent]
        );
      }
    }

    await client.query("COMMIT");
    const cost = await snapshotFormulationCost(id);
    return NextResponse.json({ ok: true, cost });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update formulation error:", err);
    return NextResponse.json({ error: "Could not update formulation." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request, { params }) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  try {
    const result = await query(`UPDATE formulations SET is_active = false WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Formulation not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete formulation error:", err);
    return NextResponse.json({ error: "Could not delete formulation." }, { status: 500 });
  }
}
