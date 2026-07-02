const { query } = require("./db");

/**
 * Computes the live cost of a single formulation from current raw material
 * prices and packing costs. Nothing here is cached — call this fresh every
 * time a cost is needed, so a raw material price change is reflected
 * instantly everywhere.
 *
 * Costing model (matches the factory batch sheet format):
 *
 * SINGLE-PACK:
 *   - Total (cost/kg) = sum of all rows' (percent/100 * price).
 *   - Total with loss = Total * (1 + loss_pct / 100).
 *   - Nett (cost/kg) = Total with loss + packing-per-kg.
 *   - Nett per litre = Nett * litre_density_kg_per_l (manual figure).
 *
 * TWO-PACK / THREE-PACK:
 *   Base, Hardener, and (if three-pack) Component C are supplied in
 *   SEPARATE containers with DIFFERENT densities — they cannot share one
 *   weight-per-litre figure. Each side gets its own manual density
 *   (base_litre_density_kg_per_l, hardener_litre_density_kg_per_l,
 *   component_c_litre_density_kg_per_l), and the sides are blended using
 *   the existing volume mix ratio fields:
 *     - sideCostPerKg   = sum of that side's rows' (percent/100 * price)
 *     - sideCostPerLitre = sideCostPerKg * sideDensity
 *     - volumeShare(side) = mixRatioVol(side) / sum(all sides' mixRatioVol)
 *     - blendedCostPerLitre = sum over sides of volumeShare * sideCostPerLitre
 *     - blendedDensity      = sum over sides of volumeShare * sideDensity
 *     - blendedCostPerKg    = blendedCostPerLitre / blendedDensity
 *   Loss% and packing-per-kg are then applied ONCE to the blended total,
 *   exactly as in the single-pack case, to produce Nett / Nett-per-litre.
 *
 * PACKING CALCULATION:
 *   - Batch size is now in LITRES
 *   - Containers needed = ceil(batch_size_litres / container_size_litres)
 *   - Total packing cost = containers_needed × cost_per_container
 *   - Packing cost per kg = total_packing_cost / total_weight_kg
 *
 * Returns:
 * {
 *   formulationId, productName, customerName, packType, lossPct,
 *   batchSizeLitres,
 *   totalWeightKg, totalVolumeLitre,    // informational, raw-material-derived
 *   litreDensityKgPerL,                  // single-pack only
 *   baseLitreDensityKgPerL, hardenerLitreDensityKgPerL, componentCLitreDensityKgPerL,  // multi-pack
 *   blendedDensity,                      // multi-pack only — the volume-weighted mixed density
 *   volumeShares: { base, hardener, componentC } | null,
 *   total,            // blended cost/kg before loss (or single-pack Total)
 *   totalWithLoss,
 *   packingCostPerBatch, packingCostPerKg,
 *   nett,             // final cost per kg
 *   nettPerLitre,     // final cost per litre, or null
 *   costPerKg, costPerLitre,  // aliases of nett / nettPerLitre, kept for backward compat
 *   breakdown: { base: {...}, hardener: {...} | null, componentC: {...} | null }
 * }
 */
async function computeFormulationCost(formulationId) {
  const formResult = await query(
    `SELECT f.*, p.pack_type, p.name AS product_name
     FROM formulations f
     JOIN products p ON p.id = f.product_id
     WHERE f.id = $1`,
    [formulationId]
  );
  const formulation = formResult.rows[0];
  if (!formulation) {
    throw new Error(`Formulation ${formulationId} not found`);
  }

  const linesResult = await query(
    `SELECT fl.id AS line_id, fl.side, fl.qty_kg, fl.percent, rm.id AS raw_material_id, rm.name AS raw_material_name,
            rm.price_per_kg, rm.density_kg_per_litre
     FROM formulation_lines fl
     JOIN raw_materials rm ON rm.id = fl.raw_material_id
     WHERE fl.formulation_id = $1`,
    [formulationId]
  );

  const lines = linesResult.rows;
  // Batch size is now in litres. If not set, fall back to recipe total weight
  // (sum of all qty_kg) so older formulations still compute correctly.
  const batchSizeLitres = formulation.batch_size_litres ? Number(formulation.batch_size_litres) : null;
  const impliedBatchSizeKg = lines.reduce((sum, l) => sum + Number(l.qty_kg || 0), 0);

  // For percent calculation, we need batchSizeKg. If batch_size_litres exists,
  // we'll compute it later after we know the effective density.
  let batchSizeKg = null;

  const sideTotals = { single: [], base: [], hardener: [], component_c: [] };
  for (const line of lines) {
    sideTotals[line.side].push(line);
  }

  function summarizeSide(sideLines) {
    let weightKg = 0;
    let volumeLitre = 0;
    let costContribution = 0; // sum of (percent/100 * price) — that side's cost per kg
    const items = sideLines.map((l) => {
      const qty = Number(l.qty_kg);
      const price = Number(l.price_per_kg);
      const density = Number(l.density_kg_per_litre) || 1;
      const percent = l.percent !== null && l.percent !== undefined
        ? Number(l.percent)
        : (batchSizeKg ? (qty / batchSizeKg) * 100 : null);
      const lineCostContribution = percent !== null ? (percent / 100) * price : qty * price; // fallback if no batch size set yet
      const lineVolume = qty / density;
      weightKg += qty;
      volumeLitre += lineVolume;
      costContribution += lineCostContribution;
      return {
        lineId: l.line_id,
        rawMaterialId: l.raw_material_id,
        name: l.raw_material_name,
        qtyKg: qty,
        percent,
        pricePerKg: price,
        costPerKgContribution: lineCostContribution,
        costPerLitreContribution: null, // filled in below once each side's density is known
      };
    });
    return { items, weightKg, volumeLitre, costContribution };
  }

  // Helper to calculate batch size in kg from litres using density
  function getBatchSizeKg(batchSizeLitres, density) {
    if (!batchSizeLitres || !density || density <= 0) return null;
    return batchSizeLitres * density;
  }

  const packType = formulation.pack_type; // 'single' | 'two_pack' | 'three_pack'
  const isMultiPack = packType !== "single";
  const isThreePack = packType === "three_pack";

  const baseSummary = summarizeSide(isMultiPack ? sideTotals.base : sideTotals.single);
  const hardenerSummary = isMultiPack ? summarizeSide(sideTotals.hardener) : null;
  const componentCSummary = isThreePack ? summarizeSide(sideTotals.component_c) : null;

  const totalWeightKg =
    baseSummary.weightKg + (hardenerSummary ? hardenerSummary.weightKg : 0) + (componentCSummary ? componentCSummary.weightKg : 0);
  const totalVolumeLitre =
    baseSummary.volumeLitre + (hardenerSummary ? hardenerSummary.volumeLitre : 0) + (componentCSummary ? componentCSummary.volumeLitre : 0);

  const lossPct = Number(formulation.loss_pct) || 0;

  let total; // blended (or single-pack) cost/kg before loss
  let blendedDensity = null;
  let volumeShares = null;
  const litreDensityKgPerL = formulation.litre_density_kg_per_l ? Number(formulation.litre_density_kg_per_l) : null;
  const baseLitreDensityKgPerL = formulation.base_litre_density_kg_per_l ? Number(formulation.base_litre_density_kg_per_l) : null;
  const hardenerLitreDensityKgPerL = formulation.hardener_litre_density_kg_per_l ? Number(formulation.hardener_litre_density_kg_per_l) : null;
  const componentCLitreDensityKgPerL = formulation.component_c_litre_density_kg_per_l ? Number(formulation.component_c_litre_density_kg_per_l) : null;

  // Calculate batchSizeKg from batchSizeLitres using effective density
  if (batchSizeLitres) {
    if (!isMultiPack && litreDensityKgPerL) {
      batchSizeKg = getBatchSizeKg(batchSizeLitres, litreDensityKgPerL);
    }
  }

  if (!isMultiPack) {
    total = baseSummary.costContribution;
  } else {
    const volBase = Number(formulation.mix_ratio_vol_base) || 0;
    const volHard = Number(formulation.mix_ratio_vol_hard) || 0;
    const volC = isThreePack ? Number(formulation.mix_ratio_vol_c) || 0 : 0;
    const volSum = volBase + volHard + volC;

    if (volSum > 0 && baseLitreDensityKgPerL && hardenerLitreDensityKgPerL && (!isThreePack || componentCLitreDensityKgPerL)) {
      const baseShare = volBase / volSum;
      const hardenerShare = volHard / volSum;
      const componentCShare = isThreePack ? volC / volSum : 0;
      volumeShares = { base: baseShare, hardener: hardenerShare, componentC: isThreePack ? componentCShare : null };

      const baseCostPerLitre = baseSummary.costContribution * baseLitreDensityKgPerL;
      const hardenerCostPerLitre = hardenerSummary.costContribution * hardenerLitreDensityKgPerL;
      const componentCCostPerLitre = isThreePack ? componentCSummary.costContribution * componentCLitreDensityKgPerL : 0;

      const blendedCostPerLitre =
        baseShare * baseCostPerLitre + hardenerShare * hardenerCostPerLitre + componentCShare * componentCCostPerLitre;
      blendedDensity =
        baseShare * baseLitreDensityKgPerL + hardenerShare * hardenerLitreDensityKgPerL + componentCShare * (componentCLitreDensityKgPerL || 0);

      total = blendedDensity > 0 ? blendedCostPerLitre / blendedDensity : 0;
    } else {
      // Not enough info to blend yet (missing volume ratio or a side's density) —
      // fall back to a simple weight-based sum so a cost still shows, but it
      // won't be litre-accurate until ratio + all densities are filled in.
      total = baseSummary.costContribution + (hardenerSummary?.costContribution || 0) + (componentCSummary?.costContribution || 0);
    }
  }

  const totalWithLoss = total * (1 + lossPct / 100);

  // Packing cost calculation: containers needed = ceil(batch_size_litres / container_size_litres)
  let packingCostPerBatch = 0;
  const packingIds = [
    formulation.base_packing_id,
    formulation.hardener_packing_id,
    formulation.component_c_packing_id,
  ].filter(Boolean);

  if (packingIds.length > 0 && batchSizeLitres && batchSizeLitres > 0) {
    const packResult = await query(
      `SELECT id, name, cost, pack_role, container_size_litres FROM packing_materials WHERE id = ANY($1::int[])`,
      [packingIds]
    );

    if (!isMultiPack) {
      // Single-pack: calculate containers needed based on batch volume
      for (const p of packResult.rows) {
        if (p.id === formulation.base_packing_id) {
          const containerSize = Number(p.container_size_litres) || 1;
          const cost = Number(p.cost);
          const containersNeeded = Math.ceil(batchSizeLitres / containerSize);
          packingCostPerBatch += containersNeeded * cost;
        }
      }
    } else if (isMultiPack && blendedDensity > 0 && volumeShares) {
      // Multi-pack: calculate containers for each side based on volume share
      const volBase = Number(formulation.mix_ratio_vol_base) || 0;
      const volHard = Number(formulation.mix_ratio_vol_hard) || 0;
      const volC = isThreePack ? Number(formulation.mix_ratio_vol_c) || 0 : 0;
      const volSum = volBase + volHard + volC;

      if (volSum > 0) {
        // Each side's volume based on mix ratio
        const baseVolume = (volBase / volSum) * batchSizeLitres;
        const hardenerVolume = (volHard / volSum) * batchSizeLitres;
        const componentCVolume = isThreePack ? (volC / volSum) * batchSizeLitres : 0;

        for (const p of packResult.rows) {
          const containerSize = Number(p.container_size_litres) || 1;
          const cost = Number(p.cost);

          if (p.id === formulation.base_packing_id) {
            const containersNeeded = Math.ceil(baseVolume / containerSize);
            packingCostPerBatch += containersNeeded * cost;
          } else if (p.id === formulation.hardener_packing_id) {
            const containersNeeded = Math.ceil(hardenerVolume / containerSize);
            packingCostPerBatch += containersNeeded * cost;
          } else if (p.id === formulation.component_c_packing_id && isThreePack) {
            const containersNeeded = Math.ceil(componentCVolume / containerSize);
            packingCostPerBatch += containersNeeded * cost;
          }
        }
      }
    }
  }

  // Convert total packing cost to per-kg using total weight
  const packingCostPerKg = totalWeightKg && totalWeightKg > 0 ? packingCostPerBatch / totalWeightKg : 0;

  const nett = totalWithLoss + packingCostPerKg;

  const effectiveDensity = isMultiPack ? blendedDensity : litreDensityKgPerL;
  const nettPerLitre = effectiveDensity ? nett * effectiveDensity : null;

  // Fill in per-row litre contribution using each side's OWN density (for display
  // parity with the batch sheet) — not the blended density, since each row's
  // litre cost is meaningful within its own container, before blending.
  function applyLitre(summary, sideDensity) {
    if (!summary) return summary;
    summary.items = summary.items.map((it) => ({
      ...it,
      costPerLitreContribution: sideDensity ? it.costPerKgContribution * sideDensity : null,
    }));
    return summary;
  }
  applyLitre(baseSummary, isMultiPack ? baseLitreDensityKgPerL : litreDensityKgPerL);
  applyLitre(hardenerSummary, hardenerLitreDensityKgPerL);
  applyLitre(componentCSummary, componentCLitreDensityKgPerL);

  return {
    formulationId,
    productName: formulation.product_name,
    customerName: formulation.customer_name,
    packType,
    lossPct,
    batchSizeLitres,
    totalWeightKg,
    totalVolumeLitre,
    litreDensityKgPerL,
    baseLitreDensityKgPerL,
    hardenerLitreDensityKgPerL,
    componentCLitreDensityKgPerL,
    blendedDensity,
    volumeShares,
    total,
    totalWithLoss,
    packingCostPerBatch,
    packingCostPerKg,
    nett,
    nettPerLitre,
    // Backward-compatible aliases used by quotes/UI elsewhere in the app.
    materialCost: total,
    materialCostWithLoss: totalWithLoss,
    packingCost: packingCostPerKg,
    totalBatchCost: nett,
    costPerKg: nett,
    costPerLitre: nettPerLitre,
    mixRatioWeight: formulation.mix_ratio_weight_base && formulation.mix_ratio_weight_hard
      ? [formulation.mix_ratio_weight_base, formulation.mix_ratio_weight_hard, formulation.mix_ratio_weight_c]
          .filter((v) => v !== null && v !== undefined)
          .join(":")
      : null,
    mixRatioVolume: formulation.mix_ratio_vol_base && formulation.mix_ratio_vol_hard
      ? [formulation.mix_ratio_vol_base, formulation.mix_ratio_vol_hard, formulation.mix_ratio_vol_c]
          .filter((v) => v !== null && v !== undefined)
          .join(":")
      : null,
    breakdown: {
      base: baseSummary,
      hardener: hardenerSummary,
      componentC: componentCSummary,
    },
  };
}

/**
 * Records a snapshot of a formulation's current computed cost into
 * formulation_cost_history. Called on formulation create/edit (not on
 * every raw material price tick).
 */
async function snapshotFormulationCost(formulationId) {
  const cost = await computeFormulationCost(formulationId);
  await query(
    `INSERT INTO formulation_cost_history (formulation_id, cost_per_kg, cost_per_litre, litre_density_kg_per_l)
     VALUES ($1, $2, $3, $4)`,
    [formulationId, cost.nett, cost.nettPerLitre, cost.blendedDensity || cost.litreDensityKgPerL]
  );
  return cost;
}

module.exports = { computeFormulationCost, snapshotFormulationCost };
