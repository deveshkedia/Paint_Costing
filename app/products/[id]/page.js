"use client";
import { useEffect, useState } from "react";
import ProtectedPage from "../../../components/ProtectedPage";
import PriceTimelineChart from "../../../components/PriceTimelineChart";
import ImageExtractUpload from "../../../components/ImageExtractUpload";
import SearchableSelect from "../../../components/SearchableSelect";
import { useAuth } from "../../../lib/AuthContext";
import { exportCostingToPDF } from "../../../lib/exportUtils";
import { Plus, Trash2, Loader2, ChevronDown, ChevronUp, History, X, Calculator, Download } from "lucide-react";

function currency(n) {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function num(n, digits = 2) {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return Number(n).toFixed(digits);
}
function formatDate(d) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function round(n) {
  return Math.round(n * 1000) / 1000;
}

function emptyLine() {
  return { rawMaterialId: "", qtyKg: "", percent: "" };
}

const SIDE_LABEL = { single: "Recipe", base: "Base", hardener: "Hardener", component_c: "Component C" };

const EMPTY_DRAFT = {
  customerName: "",
  lossPct: "0",
  batchSizeLitres: "",
  basePackingId: "",
  hardenerPackingId: "",
  componentCPackingId: "",
  mixRatioWeightBase: "",
  mixRatioWeightHard: "",
  mixRatioWeightC: "",
  mixRatioVolBase: "",
  mixRatioVolHard: "",
  mixRatioVolC: "",
  litreDensityKgPerL: "",
  baseLitreDensityKgPerL: "",
  hardenerLitreDensityKgPerL: "",
  componentCLitreDensityKgPerL: "",
  baseLines: [emptyLine()],
  hardenerLines: [emptyLine()],
  componentCLines: [emptyLine()],
};

export default function ProductDetailPage({ params }) {
  const { id } = params;
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [product, setProduct] = useState(null);
  const [formulations, setFormulations] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [packingMaterials, setPackingMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [draft, setDraft] = useState(EMPTY_DRAFT);

  async function load() {
    setLoading(true);
    try {
      const [productRes, materialsRes, packingRes] = await Promise.all([
        fetch(`/api/products/${id}`),
        fetch("/api/raw-materials"),
        fetch("/api/packing-materials"),
      ]);
      const productData = await productRes.json();
      if (!productRes.ok) throw new Error(productData.error);
      setProduct(productData.product);
      setFormulations(productData.formulations);
      const materialsData = await materialsRes.json();
      setRawMaterials(materialsData.rawMaterials || []);
      const packingData = await packingRes.json();
      setPackingMaterials(packingData.packingMaterials || []);
    } catch (err) {
      setError(err.message || "Could not load product.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  const packType = product?.pack_type;
  const isMultiPack = packType !== "single";
  const isThreePack = packType === "three_pack";
  const batchSizeNum = parseFloat(draft.batchSizeLitres) || 0;

  function rawMaterialPrice(rawMaterialId) {
    const rm = rawMaterials.find((r) => String(r.id) === String(rawMaterialId));
    return rm ? Number(rm.price_per_kg) : null;
  }

  function updateLineQty(key, idx, qtyKg) {
    setDraft((d) => ({
      ...d,
      [key]: d[key].map((l, i) => {
        if (i !== idx) return l;
        const percent = batchSizeNum > 0 && qtyKg !== "" ? ((parseFloat(qtyKg) || 0) / batchSizeNum) * 100 : l.percent;
        return { ...l, qtyKg, percent: batchSizeNum > 0 && qtyKg !== "" ? String(round(percent)) : l.percent };
      }),
    }));
  }
  function updateLinePercent(key, idx, percent) {
    setDraft((d) => ({
      ...d,
      [key]: d[key].map((l, i) => {
        if (i !== idx) return l;
        const qtyKg = batchSizeNum > 0 && percent !== "" ? ((parseFloat(percent) || 0) / 100) * batchSizeNum : l.qtyKg;
        return { ...l, percent, qtyKg: batchSizeNum > 0 && percent !== "" ? String(round(qtyKg)) : l.qtyKg };
      }),
    }));
  }
  function updateLineMaterial(key, idx, rawMaterialId) {
    setDraft((d) => ({ ...d, [key]: d[key].map((l, i) => (i === idx ? { ...l, rawMaterialId } : l)) }));
  }
  function addLine(key) {
    setDraft((d) => ({ ...d, [key]: [...d[key], emptyLine()] }));
  }
  function removeLine(key, idx) {
    setDraft((d) => ({ ...d, [key]: d[key].filter((_, i) => i !== idx) }));
  }

  function handleBatchSizeChange(value) {
    const newBatchSize = parseFloat(value) || 0;
    setDraft((d) => {
      function recalc(lines) {
        return lines.map((l) => {
          if (!l.qtyKg) return l;
          const percent = newBatchSize > 0 ? ((parseFloat(l.qtyKg) || 0) / newBatchSize) * 100 : l.percent;
          return { ...l, percent: newBatchSize > 0 ? String(round(percent)) : l.percent };
        });
      }
      return {
        ...d,
        batchSizeLitres: value,
        baseLines: recalc(d.baseLines),
        hardenerLines: recalc(d.hardenerLines),
        componentCLines: recalc(d.componentCLines),
      };
    });
  }

  // Live preview: each side's own cost/kg + cost/litre, blended via volume ratio for multi-pack.
  function previewCost() {
    function sumSide(lines) {
      let costContribution = 0;
      for (const l of lines) {
        if (!l.rawMaterialId) continue;
        const price = rawMaterialPrice(l.rawMaterialId);
        if (price === null) continue;
        const percent = l.percent !== "" ? parseFloat(l.percent) || 0 : (batchSizeNum > 0 ? ((parseFloat(l.qtyKg) || 0) / batchSizeNum) * 100 : 0);
        costContribution += (percent / 100) * price;
      }
      return costContribution;
    }

    const baseCostPerKg = sumSide(draft.baseLines);
    let total;
    let blendedDensity = null;

    if (!isMultiPack) {
      total = baseCostPerKg;
    } else {
      const hardenerCostPerKg = sumSide(draft.hardenerLines);
      const componentCCostPerKg = isThreePack ? sumSide(draft.componentCLines) : 0;
      const baseDensity = parseFloat(draft.baseLitreDensityKgPerL) || 0;
      const hardenerDensity = parseFloat(draft.hardenerLitreDensityKgPerL) || 0;
      const componentCDensity = isThreePack ? parseFloat(draft.componentCLitreDensityKgPerL) || 0 : 0;
      const volBase = parseFloat(draft.mixRatioVolBase) || 0;
      const volHard = parseFloat(draft.mixRatioVolHard) || 0;
      const volC = isThreePack ? parseFloat(draft.mixRatioVolC) || 0 : 0;
      const volSum = volBase + volHard + volC;

      if (volSum > 0 && baseDensity > 0 && hardenerDensity > 0 && (!isThreePack || componentCDensity > 0)) {
        const baseShare = volBase / volSum;
        const hardenerShare = volHard / volSum;
        const componentCShare = isThreePack ? volC / volSum : 0;
        const blendedCostPerLitre =
          baseShare * (baseCostPerKg * baseDensity) + hardenerShare * (hardenerCostPerKg * hardenerDensity) + componentCShare * (componentCCostPerKg * componentCDensity);
        blendedDensity = baseShare * baseDensity + hardenerShare * hardenerDensity + componentCShare * componentCDensity;
        total = blendedDensity > 0 ? blendedCostPerLitre / blendedDensity : 0;
      } else {
        total = baseCostPerKg + hardenerCostPerKg + componentCCostPerKg;
      }
    }

    const loss = parseFloat(draft.lossPct) || 0;
    const totalWithLoss = total * (1 + loss / 100);

    // Packing cost: containers_needed = ceil(batch_size_litres / container_size), then divide by total weight
    let packingCostBatch = 0;
    let totalWeightKg = 0;
    for (const l of draft.baseLines) {
      if (l.qtyKg) totalWeightKg += parseFloat(l.qtyKg) || 0;
    }
    for (const l of draft.hardenerLines) {
      if (l.qtyKg) totalWeightKg += parseFloat(l.qtyKg) || 0;
    }
    for (const l of draft.componentCLines) {
      if (l.qtyKg) totalWeightKg += parseFloat(l.qtyKg) || 0;
    }

    if (isMultiPack) {
      // Multi-pack: each side's volume based on mix ratio
      if (batchSizeNum > 0) {
        const volBase = parseFloat(draft.mixRatioVolBase) || 0;
        const volHard = parseFloat(draft.mixRatioVolHard) || 0;
        const volC = isThreePack ? parseFloat(draft.mixRatioVolC) || 0 : 0;
        const volSum = volBase + volHard + volC;

        if (volSum > 0) {
          const baseVolume = (volBase / volSum) * batchSizeNum;
          const hardenerVolume = (volHard / volSum) * batchSizeNum;
          const componentCVolume = isThreePack ? (volC / volSum) * batchSizeNum : 0;

          if (draft.basePackingId) {
            const p = packingMaterials.find((pm) => String(pm.id) === String(draft.basePackingId));
            if (p) {
              const containerSize = Number(p.container_size_litres) || 1;
              const containersNeeded = Math.ceil(baseVolume / containerSize);
              packingCostBatch += containersNeeded * Number(p.cost);
            }
          }
          if (draft.hardenerPackingId) {
            const p = packingMaterials.find((pm) => String(pm.id) === String(draft.hardenerPackingId));
            if (p) {
              const containerSize = Number(p.container_size_litres) || 1;
              const containersNeeded = Math.ceil(hardenerVolume / containerSize);
              packingCostBatch += containersNeeded * Number(p.cost);
            }
          }
          if (isThreePack && draft.componentCPackingId) {
            const p = packingMaterials.find((pm) => String(pm.id) === String(draft.componentCPackingId));
            if (p) {
              const containerSize = Number(p.container_size_litres) || 1;
              const containersNeeded = Math.ceil(componentCVolume / containerSize);
              packingCostBatch += containersNeeded * Number(p.cost);
            }
          }
        }
      }
    } else {
      // Single-pack: containers_needed = ceil(batch_size_litres / container_size)
      if (batchSizeNum > 0 && draft.basePackingId) {
        const p = packingMaterials.find((pm) => String(pm.id) === String(draft.basePackingId));
        if (p) {
          const containerSize = Number(p.container_size_litres) || 1;
          const containersNeeded = Math.ceil(batchSizeNum / containerSize);
          packingCostBatch = containersNeeded * Number(p.cost);
        }
      }
    }

    const packingPerKg = totalWeightKg > 0 ? packingCostBatch / totalWeightKg : 0;

    const nett = totalWithLoss + packingPerKg;

    const effectiveDensity = isMultiPack ? blendedDensity : parseFloat(draft.litreDensityKgPerL) || 0;
    const nettPerLitre = effectiveDensity > 0 ? nett * effectiveDensity : null;

    return { total, nett, nettPerLitre, blendedDensity };
  }

  function applyExtractedData(extracted) {
    setDraft((d) => ({
      ...d,
      customerName: extracted.customerName || d.customerName,
      batchSizeLitres: extracted.batchSizeLitres ? String(extracted.batchSizeLitres) : d.batchSizeLitres,
      litreDensityKgPerL: !isMultiPack && extracted.litreDensityKgPerL ? String(extracted.litreDensityKgPerL) : d.litreDensityKgPerL,
      baseLitreDensityKgPerL: isMultiPack && extracted.litreDensityKgPerL ? String(extracted.litreDensityKgPerL) : d.baseLitreDensityKgPerL,
      baseLines: extracted.rows.map((r) => {
        const bs = extracted.batchSizeLitres || batchSizeNum;
        const qtyKg = bs > 0 ? round((r.percent / 100) * bs) : "";
        return { rawMaterialId: String(r.rawMaterialId), percent: String(r.percent), qtyKg: qtyKg !== "" ? String(qtyKg) : "" };
      }),
    }));
  }

  async function handleCreateFormulation() {
    setSaving(true);
    setError("");
    try {
      const clean = (lines) =>
        lines
          .filter((l) => l.rawMaterialId && (l.qtyKg || l.percent))
          .map((l) => ({
            rawMaterialId: Number(l.rawMaterialId),
            qtyKg: l.qtyKg ? parseFloat(l.qtyKg) : null,
            percent: l.percent ? parseFloat(l.percent) : null,
          }));

      const res = await fetch("/api/formulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: Number(id),
          customerName: draft.customerName,
          lossPct: parseFloat(draft.lossPct) || 0,
          batchSizeLitres: draft.batchSizeLitres ? parseFloat(draft.batchSizeLitres) : null,
          basePackingId: draft.basePackingId ? Number(draft.basePackingId) : null,
          hardenerPackingId: draft.hardenerPackingId ? Number(draft.hardenerPackingId) : null,
          componentCPackingId: draft.componentCPackingId ? Number(draft.componentCPackingId) : null,
          mixRatioWeightBase: draft.mixRatioWeightBase ? parseFloat(draft.mixRatioWeightBase) : null,
          mixRatioWeightHard: draft.mixRatioWeightHard ? parseFloat(draft.mixRatioWeightHard) : null,
          mixRatioWeightC: draft.mixRatioWeightC ? parseFloat(draft.mixRatioWeightC) : null,
          mixRatioVolBase: draft.mixRatioVolBase ? parseFloat(draft.mixRatioVolBase) : null,
          mixRatioVolHard: draft.mixRatioVolHard ? parseFloat(draft.mixRatioVolHard) : null,
          mixRatioVolC: draft.mixRatioVolC ? parseFloat(draft.mixRatioVolC) : null,
          litreDensityKgPerL: draft.litreDensityKgPerL ? parseFloat(draft.litreDensityKgPerL) : null,
          baseLitreDensityKgPerL: draft.baseLitreDensityKgPerL ? parseFloat(draft.baseLitreDensityKgPerL) : null,
          hardenerLitreDensityKgPerL: draft.hardenerLitreDensityKgPerL ? parseFloat(draft.hardenerLitreDensityKgPerL) : null,
          componentCLitreDensityKgPerL: draft.componentCLitreDensityKgPerL ? parseFloat(draft.componentCLitreDensityKgPerL) : null,
          baseLines: clean(draft.baseLines),
          hardenerLines: clean(draft.hardenerLines),
          componentCLines: clean(draft.componentCLines),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowAddForm(false);
      setDraft(EMPTY_DRAFT);
      load();
    } catch (err) {
      setError(err.message || "Could not create formulation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteFormulation(fid) {
    if (!confirm("Remove this formulation?")) return;
    await fetch(`/api/formulations/${fid}`, { method: "DELETE" });
    load();
  }

  async function handleUpdateField(fid, field, value) {
    try {
      await fetch(`/api/formulations/${fid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: parseFloat(value) || null }),
      });
      load();
    } catch {
      setError("Could not update that field.");
    }
  }

  async function openHistory(f) {
    setHistoryFor(f);
    setHistoryLoading(true);
    setHistoryData(null);
    try {
      const res = await fetch(`/api/formulations/${f.id}/history`);
      const data = await res.json();
      setHistoryData(data);
    } catch {
      setHistoryData({ history: [] });
    } finally {
      setHistoryLoading(false);
    }
  }

  const basePacking = packingMaterials.filter((p) => p.pack_role === "single" || p.pack_role === "base");
  const hardenerPacking = packingMaterials.filter((p) => p.pack_role === "hardener");
  const componentCPacking = packingMaterials.filter((p) => p.pack_role === "component_c");

  if (loading) {
    return (
      <ProtectedPage allowedRoles={["admin", "estimator"]}>
        <Loader2 className="animate-spin text-rust" />
      </ProtectedPage>
    );
  }

  if (!product) {
    return (
      <ProtectedPage allowedRoles={["admin", "estimator"]}>
        <p className="text-sm text-bad">{error || "Product not found."}</p>
      </ProtectedPage>
    );
  }

  const preview = showAddForm ? previewCost() : null;

  function DensityField({ label, value, onChange }) {
    return (
      <div>
        <label className="block text-xs font-semibold text-ink/70 mb-1">{label}</label>
        <input
          type="number"
          step="0.01"
          placeholder="e.g. 0.98"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-white"
        />
      </div>
    );
  }

  return (
    <ProtectedPage>
      <div className="mb-6">
        <span className="text-xs uppercase tracking-wide text-rust font-semibold">{product.category}</span>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>{product.name}</h1>
        <p className="text-sm text-ink/60">
          {packType === "three_pack" ? "Three-pack (base + hardener + component C)" : packType === "two_pack" ? "Two-pack (base + hardener)" : "Single-pack"}
        </p>
      </div>

      {error && <p className="text-sm text-bad mb-4">{error}</p>}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/60">Formulations</h2>
        {isAdmin && (
          <button onClick={() => setShowAddForm((s) => !s)} className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-3 py-2 rounded-md hover:bg-rustdark">
            <Plus size={15} /> New formulation
          </button>
        )}
      </div>

      {showAddForm && isAdmin && (
        <div className="bg-white border border-ink/10 rounded-lg p-5 mb-6 shadow-sm space-y-4">
          <ImageExtractUpload rawMaterials={rawMaterials} onConfirm={applyExtractedData} />

          <div>
            <label className="block text-xs font-semibold text-ink/70 mb-1">Customer / spec name</label>
            <input
              placeholder="e.g. L&T Spec, Indian Railways, Standard"
              value={draft.customerName}
              onChange={(e) => setDraft((d) => ({ ...d, customerName: e.target.value }))}
              className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink/70 mb-1">Batch size (litres)</label>
              <input
                type="number"
                placeholder="e.g. 10"
                value={draft.batchSizeLitres}
                onChange={(e) => handleBatchSizeChange(e.target.value)}
                className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink/70 mb-1">Loss (%)</label>
              <input type="number" value={draft.lossPct} onChange={(e) => setDraft((d) => ({ ...d, lossPct: e.target.value }))} className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink/70 mb-1">{isMultiPack ? "Base packing" : "Packing"}</label>
              <SearchableSelect
                value={draft.basePackingId}
                onChange={(val) => setDraft((d) => ({ ...d, basePackingId: val }))}
                options={[
                  { value: "", label: "None" },
                  ...basePacking.map((p) => ({
                    value: String(p.id),
                    label: `${p.name} (${currency(p.cost)})`,
                  })),
                ]}
                placeholder="Search packing materials…"
              />
            </div>
            {isMultiPack && (
              <div>
                <label className="block text-xs font-semibold text-ink/70 mb-1">Hardener packing</label>
                <SearchableSelect
                  value={draft.hardenerPackingId}
                  onChange={(val) => setDraft((d) => ({ ...d, hardenerPackingId: val }))}
                  options={[
                    { value: "", label: "None" },
                    ...hardenerPacking.map((p) => ({
                      value: String(p.id),
                      label: `${p.name} (${currency(p.cost)})`,
                    })),
                  ]}
                  placeholder="Search packing materials…"
                />
              </div>
            )}
            {isThreePack && (
              <div>
                <label className="block text-xs font-semibold text-ink/70 mb-1">Component C packing</label>
                <SearchableSelect
                  value={draft.componentCPackingId}
                  onChange={(val) => setDraft((d) => ({ ...d, componentCPackingId: val }))}
                  options={[
                    { value: "", label: "None" },
                    ...componentCPacking.map((p) => ({
                      value: String(p.id),
                      label: `${p.name} (${currency(p.cost)})`,
                    })),
                  ]}
                  placeholder="Search packing materials…"
                />
              </div>
            )}
          </div>
          <p className="text-xs text-ink/50 -mt-2">
            Packing cost: containers needed = ceil(batch size / container size). Total cost divided by batch weight for the "Nett" per-kg add-on.
          </p>

          {!draft.batchSizeLitres && (
            <p className="text-xs text-ochre bg-ochretint border border-ochre/30 rounded-md px-3 py-2">
              Set a batch size above to enable automatic percent ↔ kg conversion on the rows below.
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-ink/70 mb-2">{isMultiPack ? "Base — raw materials" : "Raw materials"}</label>
            <div className="grid grid-cols-[1fr_90px_90px_auto] gap-2 text-xs text-ink/50 mb-1 px-1">
              <span>Material</span><span>Kg</span><span>%</span><span></span>
            </div>
            <div className="space-y-2">
              {draft.baseLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_90px_90px_auto] gap-2">
                  <SearchableSelect
                    value={line.rawMaterialId}
                    onChange={(val) => updateLineMaterial("baseLines", idx, val)}
                    options={[
                      { value: "", label: "Select raw material…" },
                      ...rawMaterials.map((rm) => ({
                        value: String(rm.id),
                        label: `${rm.name} (${currency(rm.price_per_kg)}/kg)`,
                      })),
                    ]}
                    placeholder="Search materials…"
                  />
                  <input type="number" placeholder="kg" value={line.qtyKg} onChange={(e) => updateLineQty("baseLines", idx, e.target.value)} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
                  <input type="number" placeholder="%" value={line.percent} onChange={(e) => updateLinePercent("baseLines", idx, e.target.value)} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
                  {draft.baseLines.length > 1 && (
                    <button onClick={() => removeLine("baseLines", idx)} className="text-bad"><Trash2 size={16} /></button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => addLine("baseLines")} className="mt-2 text-xs text-rust font-semibold flex items-center gap-1"><Plus size={13} /> Add raw material</button>
          </div>

          {isMultiPack && (
            <div>
              <label className="block text-xs font-semibold text-ink/70 mb-2">Hardener — raw materials</label>
              <div className="grid grid-cols-[1fr_90px_90px_auto] gap-2 text-xs text-ink/50 mb-1 px-1">
                <span>Material</span><span>Kg</span><span>%</span><span></span>
              </div>
              <div className="space-y-2">
                {draft.hardenerLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_90px_90px_auto] gap-2">
                    <SearchableSelect
                      value={line.rawMaterialId}
                      onChange={(val) => updateLineMaterial("hardenerLines", idx, val)}
                      options={[
                        { value: "", label: "Select raw material…" },
                        ...rawMaterials.map((rm) => ({
                          value: String(rm.id),
                          label: `${rm.name} (${currency(rm.price_per_kg)}/kg)`,
                        })),
                      ]}
                      placeholder="Search materials…"
                    />
                    <input type="number" placeholder="kg" value={line.qtyKg} onChange={(e) => updateLineQty("hardenerLines", idx, e.target.value)} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
                    <input type="number" placeholder="%" value={line.percent} onChange={(e) => updateLinePercent("hardenerLines", idx, e.target.value)} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
                    {draft.hardenerLines.length > 1 && (
                      <button onClick={() => removeLine("hardenerLines", idx)} className="text-bad"><Trash2 size={16} /></button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => addLine("hardenerLines")} className="mt-2 text-xs text-rust font-semibold flex items-center gap-1"><Plus size={13} /> Add raw material</button>
            </div>
          )}

          {isThreePack && (
            <div>
              <label className="block text-xs font-semibold text-ink/70 mb-2">Component C — raw materials</label>
              <div className="grid grid-cols-[1fr_90px_90px_auto] gap-2 text-xs text-ink/50 mb-1 px-1">
                <span>Material</span><span>Kg</span><span>%</span><span></span>
              </div>
              <div className="space-y-2">
                {draft.componentCLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_90px_90px_auto] gap-2">
                    <SearchableSelect
                      value={line.rawMaterialId}
                      onChange={(val) => updateLineMaterial("componentCLines", idx, val)}
                      options={[
                        { value: "", label: "Select raw material…" },
                        ...rawMaterials.map((rm) => ({
                          value: String(rm.id),
                          label: `${rm.name} (${currency(rm.price_per_kg)}/kg)`,
                        })),
                      ]}
                      placeholder="Search materials…"
                    />
                    <input type="number" placeholder="kg" value={line.qtyKg} onChange={(e) => updateLineQty("componentCLines", idx, e.target.value)} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
                    <input type="number" placeholder="%" value={line.percent} onChange={(e) => updateLinePercent("componentCLines", idx, e.target.value)} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
                    {draft.componentCLines.length > 1 && (
                      <button onClick={() => removeLine("componentCLines", idx)} className="text-bad"><Trash2 size={16} /></button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => addLine("componentCLines")} className="mt-2 text-xs text-rust font-semibold flex items-center gap-1"><Plus size={13} /> Add raw material</button>
            </div>
          )}

          {isMultiPack && (
            <div className="bg-tealtint border border-teal/20 rounded-md p-3">
              <p className="text-xs font-semibold text-teal mb-1">Volume mix ratio</p>
              <p className="text-xs text-ink/50 mb-2">
                Base and Hardener are supplied in separate containers with different densities. Enter the volume ratio
                you supply them in (e.g. 4:1) and each side's own weight-per-litre — the app blends them to get the
                final mixed cost.
              </p>
              <div className={`grid grid-cols-2 ${isThreePack ? "sm:grid-cols-3" : ""} gap-3 mb-3`}>
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Volume ratio — base</label>
                  <input type="number" placeholder="e.g. 4" value={draft.mixRatioVolBase} onChange={(e) => setDraft((d) => ({ ...d, mixRatioVolBase: e.target.value }))} className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Volume ratio — hardener</label>
                  <input type="number" placeholder="e.g. 1" value={draft.mixRatioVolHard} onChange={(e) => setDraft((d) => ({ ...d, mixRatioVolHard: e.target.value }))} className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-white" />
                </div>
                {isThreePack && (
                  <div>
                    <label className="block text-xs font-semibold text-ink/70 mb-1">Volume ratio — component C</label>
                    <input type="number" placeholder="e.g. 1" value={draft.mixRatioVolC} onChange={(e) => setDraft((d) => ({ ...d, mixRatioVolC: e.target.value }))} className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-white" />
                  </div>
                )}
              </div>
              <div className={`grid grid-cols-2 ${isThreePack ? "sm:grid-cols-3" : ""} gap-3`}>
                <DensityField label="Base weight/litre (kg/L)" value={draft.baseLitreDensityKgPerL} onChange={(v) => setDraft((d) => ({ ...d, baseLitreDensityKgPerL: v }))} />
                <DensityField label="Hardener weight/litre (kg/L)" value={draft.hardenerLitreDensityKgPerL} onChange={(v) => setDraft((d) => ({ ...d, hardenerLitreDensityKgPerL: v }))} />
                {isThreePack && (
                  <DensityField label="Component C weight/litre (kg/L)" value={draft.componentCLitreDensityKgPerL} onChange={(v) => setDraft((d) => ({ ...d, componentCLitreDensityKgPerL: v }))} />
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Weight ratio — base (optional, display only)</label>
                  <input type="number" placeholder="e.g. 4" value={draft.mixRatioWeightBase} onChange={(e) => setDraft((d) => ({ ...d, mixRatioWeightBase: e.target.value }))} className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Weight ratio — hardener (optional)</label>
                  <input type="number" placeholder="e.g. 1" value={draft.mixRatioWeightHard} onChange={(e) => setDraft((d) => ({ ...d, mixRatioWeightHard: e.target.value }))} className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-white" />
                </div>
                {isThreePack && (
                  <div>
                    <label className="block text-xs font-semibold text-ink/70 mb-1">Weight ratio — component C (optional)</label>
                    <input type="number" placeholder="e.g. 1" value={draft.mixRatioWeightC} onChange={(e) => setDraft((d) => ({ ...d, mixRatioWeightC: e.target.value }))} className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-white" />
                  </div>
                )}
              </div>
            </div>
          )}

          {!isMultiPack && (
            <div className="bg-tealtint border border-teal/20 rounded-md p-3">
              <label className="block text-xs font-semibold text-teal mb-1">Weight per litre (kg/L) — entered by technical team</label>
              <p className="text-xs text-ink/50 mb-2">Cost/kg is computed from the recipe above. Enter the actual measured weight-per-litre to get cost/litre.</p>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 0.98"
                value={draft.litreDensityKgPerL}
                onChange={(e) => setDraft((d) => ({ ...d, litreDensityKgPerL: e.target.value }))}
                className="w-full sm:w-48 border border-ink/20 rounded-md px-3 py-2 text-sm bg-white"
              />
            </div>
          )}

          {preview && (
            <div className="bg-rusttint border border-rust/20 rounded-md p-3 flex items-center gap-4 flex-wrap">
              <Calculator size={16} className="text-rust" />
              <div>
                <span className="text-xs text-ink/50">Total (cost/kg, before loss)</span>
                <p className="font-semibold">{currency(preview.total)}</p>
              </div>
              <div>
                <span className="text-xs text-ink/50">Nett (cost/kg, live preview)</span>
                <p className="font-semibold">{currency(preview.nett)}</p>
              </div>
              <div>
                <span className="text-xs text-ink/50">Nett / litre (live preview)</span>
                <p className="font-semibold">{preview.nettPerLitre !== null ? currency(preview.nettPerLitre) : "Enter weight/litre above"}</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-ink/10">
            <button onClick={handleCreateFormulation} disabled={saving || !draft.customerName} className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-4 py-2 rounded-md disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create formulation
            </button>
            <button onClick={() => setShowAddForm(false)} className="text-sm text-ink/60 px-4 py-2">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {formulations.map((f) => {
          const expanded = expandedId === f.id;
          const fIsMulti = product.pack_type !== "single";
          const fIsThree = product.pack_type === "three_pack";
          return (
            <div key={f.id} className="bg-white border border-ink/10 rounded-lg shadow-sm overflow-hidden">
              <button onClick={() => setExpandedId(expanded ? null : f.id)} className="w-full flex items-center justify-between px-4 sm:px-5 py-4">
                <div className="text-left">
                  <p className="font-semibold">{product.name} — {f.customer_name}</p>
                  <p className="text-xs text-ink/50">
                    Loss {f.loss_pct}%{f.batch_size_litres ? ` · Batch ${f.batch_size_litres} kg` : ""}
                    {" · Created "}{formatDate(f.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-ink/50">Nett / kg</p>
                    <p className="font-semibold text-sm">{currency(f.cost.nett)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink/50">Nett / litre</p>
                    <p className="font-semibold text-sm">{f.cost.nettPerLitre !== null ? currency(f.cost.nettPerLitre) : "—"}</p>
                  </div>
                  {expanded ? <ChevronUp size={16} className="text-ink/40" /> : <ChevronDown size={16} className="text-ink/40" />}
                </div>
              </button>

              {expanded && (
                <div className="border-t border-ink/10 px-4 sm:px-5 py-4 bg-[#FCFBF8]">
                  {/* Batch size box, editable inline */}
                  <div className="bg-tealtint border border-teal/20 rounded-md p-3 mb-3 flex items-center gap-3 flex-wrap">
                    <label className="text-xs font-semibold text-teal">Batch size (litres):</label>
                    {isAdmin ? (
                      <input
                        type="number"
                        defaultValue={f.batch_size_litres || ""}
                        placeholder="e.g. 10"
                        onBlur={(e) => {
                          if (e.target.value !== String(f.batch_size_litres || "")) handleUpdateField(f.id, "batchSizeLitres", e.target.value);
                        }}
                        className="w-32 border border-teal/30 rounded-md px-2 py-1.5 text-sm bg-white"
                      />
                    ) : (
                      <span className="text-sm font-medium">{f.batch_size_litres || "Not set"}</span>
                    )}
                    <span className="text-xs text-ink/50">Total volume this recipe makes — anchors % ↔ kg.</span>
                  </div>

                  {/* Density box(es), editable inline — per-side for multi-pack, single for single-pack */}
                  {!fIsMulti ? (
                    <div className="bg-tealtint border border-teal/20 rounded-md p-3 mb-4 flex items-center gap-3 flex-wrap">
                      <label className="text-xs font-semibold text-teal">Weight per litre (kg/L):</label>
                      {isAdmin ? (
                        <input
                          type="number" step="0.01"
                          defaultValue={f.litre_density_kg_per_l || ""}
                          placeholder="e.g. 0.98"
                          onBlur={(e) => { if (e.target.value !== String(f.litre_density_kg_per_l || "")) handleUpdateField(f.id, "litreDensityKgPerL", e.target.value); }}
                          className="w-32 border border-teal/30 rounded-md px-2 py-1.5 text-sm bg-white"
                        />
                      ) : (
                        <span className="text-sm font-medium">{f.litre_density_kg_per_l || "Not set"}</span>
                      )}
                      <span className="text-xs text-ink/50">→ Nett/litre = Nett/kg × this value</span>
                    </div>
                  ) : (
                    <div className="bg-tealtint border border-teal/20 rounded-md p-3 mb-4">
                      <p className="text-xs font-semibold text-teal mb-2">Weight per litre — each side has its own (kg/L):</p>
                      <div className={`grid grid-cols-2 ${fIsThree ? "sm:grid-cols-3" : ""} gap-3`}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-ink/60 w-16">Base</span>
                          {isAdmin ? (
                            <input type="number" step="0.01" defaultValue={f.base_litre_density_kg_per_l || ""} placeholder="e.g. 1.2"
                              onBlur={(e) => { if (e.target.value !== String(f.base_litre_density_kg_per_l || "")) handleUpdateField(f.id, "baseLitreDensityKgPerL", e.target.value); }}
                              className="w-24 border border-teal/30 rounded-md px-2 py-1.5 text-sm bg-white" />
                          ) : (
                            <span className="text-sm font-medium">{f.base_litre_density_kg_per_l || "Not set"}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-ink/60 w-16">Hardener</span>
                          {isAdmin ? (
                            <input type="number" step="0.01" defaultValue={f.hardener_litre_density_kg_per_l || ""} placeholder="e.g. 0.9"
                              onBlur={(e) => { if (e.target.value !== String(f.hardener_litre_density_kg_per_l || "")) handleUpdateField(f.id, "hardenerLitreDensityKgPerL", e.target.value); }}
                              className="w-24 border border-teal/30 rounded-md px-2 py-1.5 text-sm bg-white" />
                          ) : (
                            <span className="text-sm font-medium">{f.hardener_litre_density_kg_per_l || "Not set"}</span>
                          )}
                        </div>
                        {fIsThree && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-ink/60 w-16">Comp. C</span>
                            {isAdmin ? (
                              <input type="number" step="0.01" defaultValue={f.component_c_litre_density_kg_per_l || ""} placeholder="e.g. 1.0"
                                onBlur={(e) => { if (e.target.value !== String(f.component_c_litre_density_kg_per_l || "")) handleUpdateField(f.id, "componentCLitreDensityKgPerL", e.target.value); }}
                                className="w-24 border border-teal/30 rounded-md px-2 py-1.5 text-sm bg-white" />
                            ) : (
                              <span className="text-sm font-medium">{f.component_c_litre_density_kg_per_l || "Not set"}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-ink/50 mt-2">
                        Blended via volume ratio {f.mix_ratio_vol_base || "?"}:{f.mix_ratio_vol_hard || "?"}{fIsThree ? `:${f.mix_ratio_vol_c || "?"}` : ""}
                        {f.cost.blendedDensity ? ` → mixed weight/litre ${num(f.cost.blendedDensity, 3)}` : " — set ratio + all densities to enable blending"}
                      </p>
                    </div>
                  )}

                  {/* Batch-sheet style table */}
                  <p className="font-semibold text-sm mb-2">{product.name} — {f.customer_name} — {formatDate(f.created_at)}</p>
                  {["base", "hardener", "component_c"].map((side) => {
                    const summary = side === "base" ? f.cost.breakdown.base : side === "hardener" ? f.cost.breakdown.hardener : f.cost.breakdown.componentC;
                    if (!summary) return null;
                    const sideDensity = side === "base" ? (fIsMulti ? f.cost.baseLitreDensityKgPerL : f.cost.litreDensityKgPerL) : side === "hardener" ? f.cost.hardenerLitreDensityKgPerL : f.cost.componentCLitreDensityKgPerL;
                    return (
                      <div key={side} className="mb-3">
                        {fIsMulti && <p className="text-xs font-semibold uppercase tracking-wide text-ink/50 mb-1">{SIDE_LABEL[side]}{sideDensity ? ` (${sideDensity} kg/L)` : ""}</p>}
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-ink/50 border-b border-ink/10">
                              <th className="text-left py-1">Raw Material</th>
                              <th className="text-right py-1">Percent</th>
                              <th className="text-right py-1">Rate</th>
                              <th className="text-right py-1">Cost/Kg</th>
                              <th className="text-right py-1">Cost/Ltr</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.items.map((item) => (
                              <tr key={item.rawMaterialId} className="border-b border-ink/5">
                                <td className="py-1">{item.name}</td>
                                <td className="py-1 text-right">{num(item.percent)}</td>
                                <td className="py-1 text-right">{num(item.pricePerKg)}</td>
                                <td className="py-1 text-right font-medium">{num(item.costPerKgContribution)}</td>
                                <td className="py-1 text-right">{item.costPerLitreContribution !== null ? num(item.costPerLitreContribution) : "—"}</td>
                              </tr>
                            ))}
                            <tr className="border-t-2 border-ink/20 font-semibold">
                              <td className="py-1.5">&gt;&gt;</td>
                              <td className="py-1.5 text-right">{num(summary.items.reduce((s, i) => s + (i.percent || 0), 0))}</td>
                              <td></td>
                              <td className="py-1.5 text-right">{num(summary.costContribution)}</td>
                              <td className="py-1.5 text-right">{sideDensity ? num(summary.costContribution * sideDensity) : "—"}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })}

                  <table className="w-full text-sm mb-3">
                    <tbody>
                      <tr className="border-t-2 border-ink/30 font-semibold">
                        <td className="py-1.5">{fIsMulti ? "Blended Total >>" : "Total >>"}</td>
                        <td className="py-1.5 text-right" colSpan={2}></td>
                        <td className="py-1.5 text-right">{num(f.cost.total)}</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                      {f.loss_pct > 0 && (
                        <tr className="text-ink/60">
                          <td className="py-1">With loss ({f.loss_pct}%)</td>
                          <td colSpan={2}></td>
                          <td className="py-1 text-right">{num(f.cost.totalWithLoss)}</td>
                          <td className="py-1 text-right">—</td>
                        </tr>
                      )}
                      <tr className="text-ink/60">
                        <td className="py-1">Packing (per kg)</td>
                        <td colSpan={2}></td>
                        <td className="py-1 text-right">{num(f.cost.packingCostPerKg)}</td>
                        <td className="py-1 text-right">—</td>
                      </tr>
                      <tr className="border-t-2 border-ink font-bold text-base">
                        <td className="py-2">Nett</td>
                        <td colSpan={2}></td>
                        <td className="py-2 text-right">{currency(f.cost.nett)}</td>
                        <td className="py-2 text-right">{f.cost.nettPerLitre !== null ? currency(f.cost.nettPerLitre) : "—"}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="flex items-center justify-between pt-2 border-t border-ink/10 flex-wrap gap-2">
                    <p className="text-xs text-ink/50">Batch weight: {f.cost.totalWeightKg.toFixed(1)} kg (from recipe lines)</p>
                    <div className="flex items-center gap-3">
                      <button onClick={() => openHistory(f)} className="text-xs text-teal flex items-center gap-1 font-medium">
                        <History size={13} /> Cost history
                      </button>
                      <button onClick={() => exportCostingToPDF(f.cost, `costing_${f.customer_name.replace(/\s+/g, '_')}`)} className="text-xs text-ink/60 flex items-center gap-1 hover:text-ink">
                        <Download size={13} /> Export PDF
                      </button>
                      {isAdmin && (
                        <button onClick={() => handleDeleteFormulation(f.id)} className="text-xs text-bad flex items-center gap-1">
                          <Trash2 size={13} /> Remove formulation
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {formulations.length === 0 && !showAddForm && (
          <p className="text-sm text-ink/50 text-center py-8">No formulations yet for this product.</p>
        )}
      </div>

      {historyFor && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50" onClick={() => setHistoryFor(null)}>
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{historyFor.customer_name} — cost history</h3>
              <button onClick={() => setHistoryFor(null)} className="text-ink/50 hover:text-ink"><X size={18} /></button>
            </div>
            {historyLoading ? (
              <Loader2 className="animate-spin text-rust" />
            ) : historyData?.history?.length > 0 ? (
              <>
                <PriceTimelineChart
                  points={historyData.history.map((h, i) => ({ date: h.recorded_at, value: Number(h.cost_per_kg), isCurrent: i === historyData.history.length - 1 }))}
                />
                <p className="text-xs text-ink/50 text-center mt-1 mb-3">Nett cost per kg over time</p>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-ink/50 uppercase text-left">
                        <th className="py-1">Date</th>
                        <th className="py-1 text-right">Nett/kg</th>
                        <th className="py-1 text-right">Nett/litre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.history.slice().reverse().map((h, i) => (
                        <tr key={i} className="border-t border-ink/5">
                          <td className="py-1.5">{formatDate(h.recorded_at)}</td>
                          <td className="py-1.5 text-right font-medium">{currency(h.cost_per_kg)}</td>
                          <td className="py-1.5 text-right">{h.cost_per_litre ? currency(h.cost_per_litre) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-ink/50 text-center py-8">No cost history recorded yet.</p>
            )}
          </div>
        </div>
      )}
    </ProtectedPage>
  );
}
