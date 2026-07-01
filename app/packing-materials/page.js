"use client";
import { useEffect, useState } from "react";
import ProtectedPage from "../../components/ProtectedPage";
import { exportToCSV, exportToJSON, exportToPDF } from "../../lib/exportUtils";
import { Plus, Trash2, Pencil, Save, X, Loader2, Download } from "lucide-react";

function currency(n) {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const ROLE_LABELS = { single: "Single-pack", base: "Base (multi-pack)", hardener: "Hardener (multi-pack)", component_c: "Component C (three-pack)" };

export default function PackingMaterialsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [newDraft, setNewDraft] = useState({ name: "", packRole: "single", cost: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/packing-materials");
      const data = await res.json();
      setItems(data.packingMaterials || []);
    } catch {
      setError("Could not load packing materials.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(m) {
    setEditingId(m.id);
    setEditDraft({ name: m.name, packRole: m.pack_role, cost: m.cost });
  }

  async function saveEdit(id) {
    setSaving(true);
    try {
      const res = await fetch(`/api/packing-materials/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editDraft.name, packRole: editDraft.packRole, cost: parseFloat(editDraft.cost) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remove this packing material?")) return;
    await fetch(`/api/packing-materials/${id}`, { method: "DELETE" });
    load();
  }

  async function handleAdd() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/packing-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDraft.name, packRole: newDraft.packRole, cost: parseFloat(newDraft.cost) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewDraft({ name: "", packRole: "single", cost: "" });
      setShowAdd(false);
      load();
    } catch (err) {
      setError(err.message || "Could not add.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage adminOnly>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Packing Materials</h1>
          <p className="text-sm text-ink/60">Flat cost per pack unit — same across all products using that pack type.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportToCSV(items, 'packing_materials')} className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={() => exportToJSON(items, 'packing_materials')} className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5">
            <Download size={15} /> Export JSON
          </button>
          <button onClick={() => exportToPDF(items.map(i => ({ name: i.name, role: ROLE_LABELS[i.pack_role], cost: currency(i.cost), updated: new Date(i.updated_at).toLocaleDateString('en-IN') })), 'packing_materials', 'Packing Materials List')} className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5">
            <Download size={15} /> Export PDF
          </button>
          <button onClick={() => setShowAdd((s) => !s)} className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-3 py-2 rounded-md hover:bg-rustdark">
            <Plus size={15} /> Add packing item
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-bad mb-4">{error}</p>}

      {showAdd && (
        <div className="bg-white border border-ink/10 rounded-lg p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <input placeholder="Name, e.g. 20L Drum" value={newDraft.name} onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
            <select value={newDraft.packRole} onChange={(e) => setNewDraft((d) => ({ ...d, packRole: e.target.value }))} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]">
              <option value="single">Single-pack</option>
              <option value="base">Base (multi-pack)</option>
              <option value="hardener">Hardener (multi-pack)</option>
              <option value="component_c">Component C (three-pack)</option>
            </select>
            <input placeholder="Cost (₹)" type="number" value={newDraft.cost} onChange={(e) => setNewDraft((d) => ({ ...d, cost: e.target.value }))} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
          </div>
          <button onClick={handleAdd} disabled={saving || !newDraft.name || !newDraft.cost} className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-4 py-2 rounded-md disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save
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
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-b border-ink/5 last:border-0">
                  {editingId === m.id ? (
                    <>
                      <td className="px-4 py-2"><input value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} className="border border-ink/20 rounded px-2 py-1 text-sm w-full" /></td>
                      <td className="px-4 py-2">
                        <select value={editDraft.packRole} onChange={(e) => setEditDraft((d) => ({ ...d, packRole: e.target.value }))} className="border border-ink/20 rounded px-2 py-1 text-sm">
                          <option value="single">Single-pack</option>
                          <option value="base">Base</option>
                          <option value="hardener">Hardener</option>
                          <option value="component_c">Component C</option>
                        </select>
                      </td>
                      <td className="px-4 py-2"><input type="number" value={editDraft.cost} onChange={(e) => setEditDraft((d) => ({ ...d, cost: e.target.value }))} className="border border-ink/20 rounded px-2 py-1 text-sm w-24" /></td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(m.id)} className="text-good"><Save size={15} /></button>
                          <button onClick={() => setEditingId(null)} className="text-ink/50"><X size={15} /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium">{m.name}</td>
                      <td className="px-4 py-3 text-ink/60">{ROLE_LABELS[m.pack_role]}</td>
                      <td className="px-4 py-3">{currency(m.cost)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(m)} className="text-ink/50 hover:text-rust"><Pencil size={14} /></button>
                          <button onClick={() => handleDelete(m.id)} className="text-ink/50 hover:text-bad"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-ink/50 text-sm">No packing materials yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </ProtectedPage>
  );
}
