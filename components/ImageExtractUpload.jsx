"use client";
import { useState, useRef } from "react";
import { Upload, Loader2, X, Check } from "lucide-react";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Lets the user upload/photograph a batch sheet image, sends it to the
 * extraction API, and surfaces an editable review table of extracted rows
 * before handing the confirmed data back via onConfirm. Nothing is saved
 * automatically — raw materials are never auto-created.
 */
export default function ImageExtractUpload({ rawMaterials, onConfirm }) {
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { productName, customerName, batchSizeKg, litreDensityKgPerL, rows }
  const [reviewRows, setReviewRows] = useState([]);
  const fileInputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setExtracting(true);
    setResult(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/formulations/extract-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: file.type || "image/jpeg" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setReviewRows(
        data.rows.map((r) => ({
          extractedName: r.extractedName,
          percent: r.percent ?? "",
          rate: r.rate ?? r.matchedPricePerKg ?? "",
          rawMaterialId: r.matchedRawMaterialId ? String(r.matchedRawMaterialId) : "",
        }))
      );
    } catch (err) {
      setError(err.message || "Could not read the image. Please try again.");
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function updateRow(idx, patch) {
    setReviewRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRow(idx) {
    setReviewRows((rows) => rows.filter((_, i) => i !== idx));
  }

  function handleConfirm() {
    const validRows = reviewRows.filter((r) => r.rawMaterialId && r.percent !== "");
    onConfirm({
      productName: result.productName,
      customerName: result.customerName,
      batchSizeKg: result.batchSizeKg,
      litreDensityKgPerL: result.litreDensityKgPerL,
      rows: validRows.map((r) => ({ rawMaterialId: Number(r.rawMaterialId), percent: parseFloat(r.percent) })),
    });
    setResult(null);
    setReviewRows([]);
  }

  return (
    <div className="bg-tealtint border border-teal/20 rounded-lg p-4 mb-4">
      {!result && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold text-teal flex items-center gap-2"><Upload size={15} /> Upload a batch sheet photo</p>
              <p className="text-xs text-ink/50 mt-0.5">Upload a photo or screenshot of a formulation sheet — we'll read the raw materials, percentages, and rates for you to review.</p>
            </div>
            <label className="flex items-center gap-2 bg-teal text-white text-xs font-semibold px-3 py-2 rounded-md hover:opacity-90 cursor-pointer whitespace-nowrap">
              {extracting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {extracting ? "Reading…" : "Choose image"}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} disabled={extracting} className="hidden" />
            </label>
          </div>
          {error && <p className="text-xs text-bad mt-2">{error}</p>}
        </>
      )}

      {result && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-teal">Review extracted rows before adding them</p>
            <button onClick={() => { setResult(null); setReviewRows([]); }} className="text-ink/40 hover:text-ink/70"><X size={16} /></button>
          </div>

          {(result.productName || result.customerName || result.batchSizeKg || result.litreDensityKgPerL) && (
            <p className="text-xs text-ink/60 mb-3">
              Also detected: {[
                result.productName && `Product "${result.productName}"`,
                result.customerName && `Customer "${result.customerName}"`,
                result.batchSizeKg && `Batch size ${result.batchSizeKg} kg`,
                result.litreDensityKgPerL && `Weight/litre ${result.litreDensityKgPerL}`,
              ].filter(Boolean).join(" · ")}
            </p>
          )}

          <div className="space-y-2 max-h-80 overflow-y-auto mb-3">
            {reviewRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_90px_90px_auto] gap-2 bg-white rounded-md p-2 border border-ink/10">
                <div className="text-xs text-ink/50 flex items-center">"{row.extractedName}"</div>
                <select
                  value={row.rawMaterialId}
                  onChange={(e) => updateRow(idx, { rawMaterialId: e.target.value })}
                  className={`border rounded-md px-2 py-1.5 text-sm ${row.rawMaterialId ? "border-good/40 bg-goodtint" : "border-bad/40 bg-badtint"}`}
                >
                  <option value="">Not matched — select…</option>
                  {rawMaterials.map((rm) => (
                    <option key={rm.id} value={rm.id}>{rm.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="%"
                  value={row.percent}
                  onChange={(e) => updateRow(idx, { percent: e.target.value })}
                  className="border border-ink/20 rounded-md px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  placeholder="Rate"
                  value={row.rate}
                  disabled
                  title="Rate comes from the matched raw material's current price"
                  className="border border-ink/10 rounded-md px-2 py-1.5 text-sm bg-ink/5 text-ink/50"
                />
                <button onClick={() => removeRow(idx)} className="text-bad text-xs px-1">✕</button>
              </div>
            ))}
            {reviewRows.length === 0 && <p className="text-xs text-ink/50 text-center py-4">No rows extracted. Try a clearer image.</p>}
          </div>

          <button
            onClick={handleConfirm}
            disabled={reviewRows.filter((r) => r.rawMaterialId && r.percent !== "").length === 0}
            className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-4 py-2 rounded-md disabled:opacity-50"
          >
            <Check size={14} /> Add these rows to the formulation
          </button>
          <p className="text-xs text-ink/50 mt-2">
            Rows highlighted red weren't matched to an existing raw material — add that material on the Raw Materials page first, then re-select it here, or remove the row.
          </p>
        </div>
      )}
    </div>
  );
}
