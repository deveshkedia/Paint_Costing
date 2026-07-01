"use client";
import { useEffect, useState } from "react";
import ProtectedPage from "../../components/ProtectedPage";
import { Plus, Loader2 } from "lucide-react";

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", password: "", role: "estimator" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(data.users || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft({ name: "", email: "", password: "", role: "estimator" });
      setShowAdd(false);
      load();
    } catch (err) {
      setError(err.message || "Could not create user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage adminOnly>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Team Access</h1>
          <p className="text-sm text-ink/60">Admins manage costs and formulations. Estimators can quote but can't edit raw material prices.</p>
        </div>
        <button onClick={() => setShowAdd((s) => !s)} className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-3 py-2 rounded-md hover:bg-rustdark">
          <Plus size={15} /> Add team member
        </button>
      </div>

      {error && <p className="text-sm text-bad mb-4">{error}</p>}

      {showAdd && (
        <div className="bg-white border border-ink/10 rounded-lg p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
            <input placeholder="Name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
            <input placeholder="Email" type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
            <input placeholder="Temporary password" value={draft.password} onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]" />
            <select value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))} className="border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]">
              <option value="estimator">Estimator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button onClick={handleAdd} disabled={saving || !draft.name || !draft.email || !draft.password} className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-4 py-2 rounded-md disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create account
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
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-ink/60">{u.email}</td>
                  <td className="px-4 py-3"><span className="text-xs uppercase font-semibold text-rust">{u.role}</span></td>
                  <td className="px-4 py-3 text-ink/50 text-xs">{new Date(u.created_at).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ProtectedPage>
  );
}
