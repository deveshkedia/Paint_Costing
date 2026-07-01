"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuth } from "../../lib/AuthContext";
import { exportToCSV, exportToJSON, exportToPDF } from "../../lib/exportUtils";
import { Plus, Loader2, Search, Layers, Download } from "lucide-react";

const CATEGORY_SWATCH = {
  decorative: "bg-ochre",
  industrial: "bg-teal",
  specialty: "bg-rust",
};

const PACK_LABELS = {
  single: "Single-pack",
  two_pack: "Two-pack (base + hardener)",
  three_pack: "Three-pack (base + hardener + component C)",
};

export default function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newDraft, setNewDraft] = useState({ name: "", category: "industrial", packType: "single", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load(searchTerm = "") {
    setLoading(true);
    const url = searchTerm ? `/api/products?search=${encodeURIComponent(searchTerm)}` : "/api/products";
    const res = await fetch(url);
    const data = await res.json();
    setProducts(data.products || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Debounced search-as-you-type.
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function handleAdd() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewDraft({ name: "", category: "industrial", packType: "single", notes: "" });
      setShowAdd(false);
      load(search);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage allowedRoles={["admin", "estimator"]}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Products</h1>
          <p className="text-sm text-ink/60">Each product can have multiple customer-specific formulations.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportToCSV(products.map(p => ({ name: p.name, category: p.category, packType: p.pack_type, formulations: p.formulation_count })), 'products')} className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={() => exportToJSON(products, 'products')} className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5">
            <Download size={15} /> Export JSON
          </button>
          <button onClick={() => exportToPDF(products.map(p => ({ name: p.name, category: p.category, packType: p.pack_type, formulations: p.formulation_count || 0 })), 'products', 'Products List')} className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5">
            <Download size={15} /> Export PDF
          </button>
          {user?.role === "admin" && (
            <button onClick={() => setShowAdd((s) => !s)} className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-3 py-2 rounded-md hover:bg-rustdark">
              <Plus size={15} /> Add product
            </button>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product name or customer…"
          className="w-full border border-ink/20 rounded-md pl-9 pr-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-rust/30"
        />
      </div>

      {error && <p className="text-sm text-bad mb-4">{error}</p>}

      {showAdd && (
        <div className="bg-white border border-ink/10 rounded-lg p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <input placeholder="Product name, e.g. Synthetic Enamel" value={newDraft.name} onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
            <select value={newDraft.category} onChange={(e) => setNewDraft((d) => ({ ...d, category: e.target.value }))} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]">
              <option value="decorative">Decorative</option>
              <option value="industrial">Industrial</option>
              <option value="specialty">Specialty</option>
            </select>
            <select value={newDraft.packType} onChange={(e) => setNewDraft((d) => ({ ...d, packType: e.target.value }))} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]">
              <option value="single">Single-pack</option>
              <option value="two_pack">Two-pack (base + hardener)</option>
              <option value="three_pack">Three-pack (base + hardener + component C)</option>
            </select>
          </div>
          <button onClick={handleAdd} disabled={saving || !newDraft.name} className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-4 py-2 rounded-md disabled:opacity-50">
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
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Pack type</th>
                <th className="px-4 py-3">Formulations</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-ink/5 last:border-0 hover:bg-tealtint/40 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/products/${p.id}`} className="font-medium text-teal hover:text-rust transition-colors">
                      {p.name}
                    </Link>
                    {p.matched_customer && (
                      <p className="text-xs text-rust mt-0.5">Matched customer: {p.matched_customer}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink/70 font-medium">
                      <span className={`w-2.5 h-2.5 rounded-full ${CATEGORY_SWATCH[p.category] || "bg-ink/30"}`} />
                      {p.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink/60">{PACK_LABELS[p.pack_type] || p.pack_type}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-ink/60">
                      <Layers size={13} />
                      {p.formulation_count}
                    </span>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-ink/50 text-sm">{search ? "No products match your search." : "No products yet."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </ProtectedPage>
  );
}
