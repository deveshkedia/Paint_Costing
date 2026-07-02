import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import { requireAdmin } from "../../../lib/apiGuard";
import { snapshotFormulationCost } from "../../../lib/costing";

/**
 * Creates a formulation for a product, with its raw material lines, in a
 * single transaction. Body shape:
 * {
 *   productId, customerName, lossPct, batchSizeLitres,
 *   basePackingId, hardenerPackingId, componentCPackingId,
 *   mixRatioWeightBase, mixRatioWeightHard, mixRatioWeightC,
 *   mixRatioVolBase, mixRatioVolHard, mixRatioVolC,
 *   litreDensityKgPerL,   // manual, entered by technical team
 *   baseLines: [{ rawMaterialId, qtyKg, percent }, ...],        // 'single' side uses this array too
 *   hardenerLines: [{ rawMaterialId, qtyKg, percent }, ...],    // omit/empty for single-pack
 *   componentCLines: [{ rawMaterialId, qtyKg, percent }, ...]   // only for three-pack
 * }
 * Each line needs at least one of qtyKg/percent — the other is derived
 * server-side from batchSizeLitres if missing, as a safety net (the UI keeps
 * both in sync live, but this guards direct API use too).
 */
export async function POST(request) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const {
    productId,
    customerName,
    lossPct,
    batchSizeLitres,
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
  } = body;

  if (!productId || !customerName || !Array.isArray(baseLines) || baseLines.length === 0) {
    return NextResponse.json(
      { error: "Product, customer/spec name, and at least one raw material line are required." },
      { status: 400 }
    );
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

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const productResult = await client.query("SELECT pack_type FROM products WHERE id = $1", [productId]);
    const product = productResult.rows[0];
    if (!product) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const packType = product.pack_type;
    const isMultiPack = packType !== "single";
    const isThreePack = packType === "three_pack";

    if (isMultiPack && (!Array.isArray(hardenerLines) || hardenerLines.length === 0)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "This product needs hardener raw material lines too." },
        { status: 400 }
      );
    }
    if (isThreePack && (!Array.isArray(componentCLines) || componentCLines.length === 0)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "This is a three-pack product — Component C raw material lines are required too." },
        { status: 400 }
      );
    }

    const formResult = await client.query(
      `INSERT INTO formulations
        (product_id, customer_name, loss_pct, batch_size_litres, base_packing_id, hardener_packing_id, component_c_packing_id,
         mix_ratio_weight_base, mix_ratio_weight_hard, mix_ratio_weight_c,
         mix_ratio_vol_base, mix_ratio_vol_hard, mix_ratio_vol_c, litre_density_kg_per_l,
         base_litre_density_kg_per_l, hardener_litre_density_kg_per_l, component_c_litre_density_kg_per_l)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        productId,
        customerName.trim(),
        lossPct || 0,
        batchSizeLitres || null,
        basePackingId || null,
        isMultiPack ? hardenerPackingId || null : null,
        isThreePack ? componentCPackingId || null : null,
        mixRatioWeightBase || null,
        mixRatioWeightHard || null,
        isThreePack ? mixRatioWeightC || null : null,
        mixRatioVolBase || null,
        mixRatioVolHard || null,
        isThreePack ? mixRatioVolC || null : null,
        isMultiPack ? null : litreDensityKgPerL || null,
        isMultiPack ? baseLitreDensityKgPerL || null : null,
        isMultiPack ? hardenerLitreDensityKgPerL || null : null,
        isThreePack ? componentCLitreDensityKgPerL || null : null,
      ]
    );
    const formulationId = formResult.rows[0].id;
    const batchSize = batchSizeLitres ? Number(batchSizeLitres) : null;

    const side = isMultiPack ? "base" : "single";
    for (const line of baseLines) {
      const { qtyKg, percent } = resolveQtyAndPercent(line, batchSize);
      await client.query(
        `INSERT INTO formulation_lines (formulation_id, raw_material_id, side, qty_kg, percent)
         VALUES ($1, $2, $3, $4, $5)`,
        [formulationId, line.rawMaterialId, side, qtyKg, percent]
      );
    }
    if (isMultiPack) {
      for (const line of hardenerLines) {
        const { qtyKg, percent } = resolveQtyAndPercent(line, batchSize);
        await client.query(
          `INSERT INTO formulation_lines (formulation_id, raw_material_id, side, qty_kg, percent)
           VALUES ($1, $2, 'hardener', $3, $4)`,
          [formulationId, line.rawMaterialId, qtyKg, percent]
        );
      }
    }
    if (isThreePack) {
      for (const line of componentCLines) {
        const { qtyKg, percent } = resolveQtyAndPercent(line, batchSize);
        await client.query(
          `INSERT INTO formulation_lines (formulation_id, raw_material_id, side, qty_kg, percent)
           VALUES ($1, $2, 'component_c', $3, $4)`,
          [formulationId, line.rawMaterialId, qtyKg, percent]
        );
      }
    }

    await client.query("COMMIT");

    const cost = await snapshotFormulationCost(formulationId);
    return NextResponse.json({ formulationId, cost }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create formulation error:", err);
    return NextResponse.json({ error: "Could not create formulation." }, { status: 500 });
  } finally {
    client.release();
  }
}
