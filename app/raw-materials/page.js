"use client";
import { useEffect, useState } from "react";
import ProtectedPage from "../../components/ProtectedPage";
import PriceTimelineChart from "../../components/PriceTimelineChart";
import { useAuth } from "../../lib/AuthContext";
import { exportToCSV, exportToJSON, exportToPDF } from "../../lib/exportUtils";
import { Plus, Trash2, Pencil, Save, X, Loader2, Sheet, Search, TrendingUp, Rows3, Download } from "lucide-react";

function currency(n) {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function emptyBulkRow() {
  return { name: "", pricePerKg: "", densityKgPerLitre: "1", supplier: "" };
}

export default function RawMaterialsPage() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [bulkRows, setBulkRows] = useState([emptyBulkRow()]);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importDraft, setImportDraft] = useState({ sheetId: "", sheetRange: "RawMaterials!A1:E500" });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [historyFor, setHistoryFor] = useState(null); // { id, name } or null
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isAdmin = user?.role === "admin";
  const canManageRawMaterials = user?.role === "admin" || user?.role === "rm_manager";

  async function load(searchTerm = "") {
    setLoading(true);
    setError("");
    try {
      const url = searchTerm ? `/api/raw-materials?search=${encodeURIComponent(searchTerm)}` : "/api/raw-materials";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMaterials(data.rawMaterials);
    } catch (err) {
      setError("Could not load raw materials.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  function startEdit(m) {
    setEditingId(m.id);
    setEditDraft({ name: m.name, pricePerKg: m.price_per_kg, densityKgPerLitre: m.density_kg_per_litre, supplier: m.supplier || "" });
  }

  async function saveEdit(id) {
    setSaving(true);
    try {
      const res = await fetch(`/api/raw-materials/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name,
          pricePerKg: parseFloat(editDraft.pricePerKg),
          densityKgPerLitre: parseFloat(editDraft.densityKgPerLitre),
          supplier: editDraft.supplier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditingId(null);
      load(search);
    } catch (err) {
      setError(err.message || "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remove this raw material? It will be hidden but kept for any formulations already using it.")) return;
    try {
      const res = await fetch(`/api/raw-materials/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      load(search);
    } catch {
      setError("Could not remove this raw material.");
    }
  }

  function updateBulkRow(idx, patch) {
    setBulkRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addBulkRow() {
    setBulkRows((rows) => [...rows, emptyBulkRow()]);
  }
  function removeBulkRow(idx) {
    setBulkRows((rows) => rows.filter((_, i) => i !== idx));
  }

  async function handleBulkSave() {
    setSaving(true);
    setError("");
    try {
      const items = bulkRows
        .filter((r) => r.name && r.pricePerKg)
        .map((r) => ({
          name: r.name,
          pricePerKg: parseFloat(r.pricePerKg),
          densityKgPerLitre: parseFloat(r.densityKgPerLitre) || 1,
          supplier: r.supplier,
        }));
      if (items.length === 0) {
        setError("Add at least one material with a name and price.");
        setSaving(false);
        return;
      }
      const res = await fetch("/api/raw-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.errors?.length > 0) {
        setError(data.errors.join(" "));
      }
      setBulkRows([emptyBulkRow()]);
      setShowAdd(false);
      load(search);
    } catch (err) {
      setError(err.message || "Could not add raw materials.");
    } finally {
      setSaving(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    setImportResult(null);
    setError("");
    try {
      const res = await fetch("/api/import/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImportResult(data);
      load(search);
    } catch (err) {
      setError(err.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function openHistory(m) {
    setHistoryFor({ id: m.id, name: m.name });
    setHistoryLoading(true);
    setHistoryData(null);
    try {
      const res = await fetch(`/api/raw-materials/${m.id}/history`);
      const data = await res.json();
      setHistoryData(data);
    } catch {
      setHistoryData({ timeline: [] });
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <ProtectedPage>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Raw Materials</h1>
          <p className="text-sm text-ink/60">
            Prices here drive every formulation's cost automatically. {!canManageRawMaterials && "Only admins and RM managers can edit prices."}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => exportToCSV(materials, 'raw_materials')}
            className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5"
          >
            <Download size={15} /> Export CSV
          </button>
          <button
            onClick={() => exportToJSON(materials, 'raw_materials')}
            className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5"
          >
            <Download size={15} /> Export JSON
          </button>
          <button
            onClick={() => exportToPDF(materials.map(m => ({ name: m.name, price_per_kg: currency(m.price_per_kg), density: m.density_kg_per_litre, supplier: m.supplier || '—', updated: new Date(m.updated_at).toLocaleDateString('en-IN') })), 'raw_materials', 'Raw Materials List')}
            className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5"
          >
            <Download size={15} /> Export PDF
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowImport((s) => !s)}
              className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5"
            >
              <Sheet size={15} /> Import from Sheet
            </button>
          )}
          {canManageRawMaterials && (
            <button
              onClick={() => setShowAdd((s) => !s)}
              className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-3 py-2 rounded-md hover:bg-rustdark"
            >
              <Plus size={15} /> Add materials
            </button>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search raw materials by name…"
          className="w-full border border-ink/20 rounded-md pl-9 pr-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-rust/30"
        />
      </div>

      {error && <p className="text-sm text-bad mb-4">{error}</p>}

      {showImport && isAdmin && (
        <div className="bg-white border border-ink/10 rounded-lg p-4 mb-6 shadow-sm">
          <p className="text-sm font-semibold mb-2">Import prices from Google Sheet</p>
          <p className="text-xs text-ink/60 mb-3">
            Sheet must have headers: Name, Price Per Kg, Density (kg/litre), Supplier. Share the sheet (Viewer)
            with your service account email — see README for setup.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input
              placeholder="Sheet ID (from the sheet's URL)"
              value={importDraft.sheetId}
              onChange={(e) => setImportDraft((d) => ({ ...d, sheetId: e.target.value }))}
              className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]"
            />
            <input
              placeholder="Range, e.g. RawMaterials!A1:E500"
              value={importDraft.sheetRange}
              onChange={(e) => setImportDraft((d) => ({ ...d, sheetRange: e.target.value }))}
              className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]"
            />
          </div>
          <button
            onClick={handleImport}
            disabled={importing || !importDraft.sheetId}
            className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-4 py-2 rounded-md disabled:opacity-50"
          >
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Sheet size={14} />}
            Run import
          </button>
          {importResult && (
            <p className="text-xs text-good mt-2">
              Updated {importResult.updated}, created {importResult.created}, skipped {importResult.skipped}.
              {importResult.errors?.length > 0 && ` ${importResult.errors.length} row(s) had issues.`}
            </p>
          )}
        </div>
      )}

      {showAdd && canManageRawMaterials && (
        <div className="bg-white border border-ink/10 rounded-lg p-4 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold flex items-center gap-2"><Rows3 size={15} className="text-rust" /> Add multiple raw materials</p>
          </div>
          <div className="space-y-2">
            {bulkRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_120px_1fr_auto] gap-2">
                <input placeholder="Name" value={row.name} onChange={(e) => updateBulkRow(idx, { name: e.target.value })} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
                <input placeholder="Price/kg (₹)" type="number" value={row.pricePerKg} onChange={(e) => updateBulkRow(idx, { pricePerKg: e.target.value })} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
                <input placeholder="Density (kg/L)" type="number" value={row.densityKgPerLitre} onChange={(e) => updateBulkRow(idx, { densityKgPerLitre: e.target.value })} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
                <input placeholder="Supplier (optional)" value={row.supplier} onChange={(e) => updateBulkRow(idx, { supplier: e.target.value })} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
                {bulkRows.length > 1 && (
                  <button onClick={() => removeBulkRow(idx)} className="text-bad px-2"><Trash2 size={16} /></button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addBulkRow} className="text-xs text-rust font-semibold flex items-center gap-1"><Plus size={13} /> Add row</button>
          </div>
          <button onClick={handleBulkSave} disabled={saving} className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-4 py-2 rounded-md disabled:opacity-50 mt-3">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save all
          </button>
        </div>
      )}

      {loading ? (
        <Loader2 className="animate-spin text-rust" />
      ) : (
        <div className="bg-white border border-ink/10 rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs text-ink/60 uppercase tracking-wide">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Price / kg</th>
                <th className="px-4 py-3">Density (kg/L)</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Last updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id} className="border-b border-ink/5 last:border-0 hover:bg-tealtint/30">
                  {editingId === m.id ? (
                    <>
                      <td className="px-4 py-2"><input value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} className="border border-ink/20 rounded px-2 py-1 text-sm w-full" /></td>
                      <td className="px-4 py-2"><input type="number" value={editDraft.pricePerKg} onChange={(e) => setEditDraft((d) => ({ ...d, pricePerKg: e.target.value }))} className="border border-ink/20 rounded px-2 py-1 text-sm w-24" /></td>
                      <td className="px-4 py-2"><input type="number" value={editDraft.densityKgPerLitre} onChange={(e) => setEditDraft((d) => ({ ...d, densityKgPerLitre: e.target.value }))} className="border border-ink/20 rounded px-2 py-1 text-sm w-20" /></td>
                      <td className="px-4 py-2"><input value={editDraft.supplier} onChange={(e) => setEditDraft((d) => ({ ...d, supplier: e.target.value }))} className="border border-ink/20 rounded px-2 py-1 text-sm w-full" /></td>
                      <td className="px-4 py-2 text-ink/50">—</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(m.id)} disabled={saving} className="text-good"><Save size={15} /></button>
                          <button onClick={() => setEditingId(null)} className="text-ink/50"><X size={15} /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium">{m.name}</td>
                      <td className="px-4 py-3">{currency(m.price_per_kg)}</td>
                      <td className="px-4 py-3">{m.density_kg_per_litre}</td>
                      <td className="px-4 py-3 text-ink/60">{m.supplier || "—"}</td>
                      <td className="px-4 py-3 text-ink/50 text-xs">{new Date(m.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openHistory(m)} className="text-ink/50 hover:text-teal" title="View price history"><TrendingUp size={14} /></button>
                          {canManageRawMaterials && (
                            <>
                              <button onClick={() => startEdit(m)} className="text-ink/50 hover:text-rust"><Pencil size={14} /></button>
                              <button onClick={() => handleDelete(m.id)} className="text-ink/50 hover:text-bad"><Trash2 size={14} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {materials.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-ink/50 text-sm">{search ? "No materials match your search." : "No raw materials yet."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {historyFor && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50" onClick={() => setHistoryFor(null)}>
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{historyFor.name} — price history</h3>
              <button onClick={() => setHistoryFor(null)} className="text-ink/50 hover:text-ink"><X size={18} /></button>
            </div>
            {historyLoading ? (
              <Loader2 className="animate-spin text-rust" />
            ) : historyData?.timeline?.length > 0 ? (
              <>
                <PriceTimelineChart points={historyData.timeline.map((t) => ({ date: t.date, value: t.pricePerKg, isCurrent: t.isCurrent }))} />
                <div className="mt-4 max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-ink/50 uppercase text-left">
                        <th className="py-1">Date</th>
                        <th className="py-1 text-right">Price / kg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.timeline.slice().reverse().map((t, i) => (
                        <tr key={i} className="border-t border-ink/5">
                          <td className="py-1.5">{new Date(t.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} {t.isCurrent && <span className="text-xs text-rust">(current)</span>}</td>
                          <td className="py-1.5 text-right font-medium">{currency(t.pricePerKg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-ink/50 text-center py-8">No price history yet for this material.</p>
            )}
          </div>
        </div>
      )}
    </ProtectedPage>
  );
}
