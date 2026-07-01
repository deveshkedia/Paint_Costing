"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedPage from "../../../components/ProtectedPage";
import SearchableSelect from "../../../components/SearchableSelect";
import { Plus, Trash2, Loader2 } from "lucide-react";

function currency(n) {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function emptyLine() {
  return { formulationId: "", quantityKg: "", quantityLitre: "" };
}

export default function NewQuotePage() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [formulationsByProduct, setFormulationsByProduct] = useState({});
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [marginPct, setMarginPct] = useState("18");
  const [gstPct, setGstPct] = useState("18");
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/products");
      const data = await res.json();
      const prods = data.products || [];
      setProducts(prods);
      // Fetch formulations for each product (small catalogues — fine to do in parallel)
      const entries = await Promise.all(
        prods.map(async (p) => {
          const r = await fetch(`/api/products/${p.id}`);
          const d = await r.json();
          return [p.id, d.formulations || []];
        })
      );
      setFormulationsByProduct(Object.fromEntries(entries));
      setLoadingProducts(false);
    }
    load();
  }, []);

  const allFormulations = Object.entries(formulationsByProduct).flatMap(([productId, forms]) => {
    const product = products.find((p) => String(p.id) === String(productId));
    return forms.map((f) => ({ ...f, productName: product?.name, productId }));
  });

  function updateLine(idx, patch) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, emptyLine()]);
  }
  function removeLine(idx) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }

  function formulationFor(id) {
    return allFormulations.find((f) => String(f.id) === String(id));
  }

  function lineEstimate(line) {
    const f = formulationFor(line.formulationId);
    if (!f) return null;
    const qtyKg = parseFloat(line.quantityKg) || 0;
    const qtyLitre = parseFloat(line.quantityLitre) || 0;
    let costBase;
    if (qtyKg > 0) {
      costBase = qtyKg * f.cost.costPerKg;
    } else if (qtyLitre > 0 && f.cost.costPerLitre !== null) {
      costBase = qtyLitre * f.cost.costPerLitre;
    } else {
      return null;
    }
    const margin = parseFloat(marginPct) || 0;
    const gst = parseFloat(gstPct) || 0;
    const withMargin = costBase * (1 + margin / 100);
    const withGst = withMargin * (1 + gst / 100);
    return withGst;
  }

  const grandTotalEstimate = lines.reduce((sum, l) => sum + (lineEstimate(l) || 0), 0);

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      const cleanedLines = lines
        .filter((l) => l.formulationId && (l.quantityKg || l.quantityLitre))
        .map((l) => ({
          formulationId: Number(l.formulationId),
          quantityKg: l.quantityKg ? parseFloat(l.quantityKg) : null,
          quantityLitre: l.quantityLitre ? parseFloat(l.quantityLitre) : null,
        }));
      if (cleanedLines.length === 0) {
        setError("Add at least one line with a formulation and quantity.");
        setSaving(false);
        return;
      }
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || `Quote ${new Date().toLocaleDateString("en-IN")}`,
          clientName,
          marginPct: parseFloat(marginPct),
          gstPct: parseFloat(gstPct),
          lines: cleanedLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/quotes/${data.quoteId}`);
    } catch (err) {
      setError(err.message || "Could not create quote.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage allowedRoles={["admin", "estimator"]}>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: "Georgia, serif" }}>New Quote</h1>

      <div className="bg-white border border-ink/10 rounded-lg p-5 shadow-sm space-y-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink/70 mb-1">Quote name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reliance Tank Lining — July" className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink/70 mb-1">Client name</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Reliance Industries" className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink/70 mb-1">Margin (%)</label>
            <input type="number" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink/70 mb-1">GST (%)</label>
            <input type="number" value={gstPct} onChange={(e) => setGstPct(e.target.value)} className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-bad mb-4">{error}</p>}

      <div className="space-y-3 mb-6">
        {loadingProducts ? (
          <Loader2 className="animate-spin text-rust" />
        ) : (
          lines.map((line, idx) => {
            const f = formulationFor(line.formulationId);
            const estimate = lineEstimate(line);
            return (
              <div key={idx} className="bg-white border border-ink/10 rounded-lg p-4 shadow-sm">
                <div className="flex gap-2 mb-3">
                  <SearchableSelect
                    value={line.formulationId}
                    onChange={(val) => updateLine(idx, { formulationId: val })}
                    options={[
                      { value: "", label: "Select product / formulation…" },
                      ...allFormulations.map((fm) => ({
                        value: String(fm.id),
                        label: `${fm.productName} — ${fm.customer_name}`,
                      })),
                    ]}
                    placeholder="Search formulations…"
                  />
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(idx)} className="text-bad"><Trash2 size={16} /></button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-ink/60 mb-1">Quantity (kg)</label>
                    <input type="number" value={line.quantityKg} onChange={(e) => updateLine(idx, { quantityKg: e.target.value, quantityLitre: "" })} className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
                  </div>
                  <div>
                    <label className="block text-xs text-ink/60 mb-1">Or quantity (litre)</label>
                    <input type="number" value={line.quantityLitre} onChange={(e) => updateLine(idx, { quantityLitre: e.target.value, quantityKg: "" })} className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
                  </div>
                </div>
                {f && (
                  <p className="text-xs text-ink/50 mt-2">
                    Cost: {currency(f.cost.costPerKg)}/kg · {currency(f.cost.costPerLitre)}/litre
                    {estimate !== null && <span className="font-semibold text-ink/70"> · Line total: {currency(estimate)}</span>}
                  </p>
                )}
              </div>
            );
          })
        )}
        <button onClick={addLine} className="w-full flex items-center justify-center gap-2 border border-dashed border-rust/50 text-rust text-sm font-semibold py-3 rounded-lg hover:bg-rust/5">
          <Plus size={16} /> Add another line
        </button>
      </div>

      <div className="bg-teal text-paper rounded-lg p-5 flex items-center justify-between mb-6">
        <span className="text-sm text-paper/60">Estimated grand total</span>
        <span className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>{currency(grandTotalEstimate)}</span>
      </div>

      <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-5 py-3 rounded-md hover:bg-rustdark disabled:opacity-50">
        {saving ? <Loader2 size={15} className="animate-spin" /> : null}
        Save quote
      </button>
    </ProtectedPage>
  );
}
