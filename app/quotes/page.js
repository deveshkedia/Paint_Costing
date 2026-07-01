"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ProtectedPage from "../../components/ProtectedPage";
import { exportToCSV, exportToJSON, exportToPDF } from "../../lib/exportUtils";
import { Plus, Loader2, FileText, Download } from "lucide-react";

function currency(n) {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/quotes")
      .then((r) => r.json())
      .then((d) => setQuotes(d.quotes || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ProtectedPage>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Quotes</h1>
          <p className="text-sm text-ink/60">Customer pricing built on top of formulation costs, with margin and GST applied.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportToCSV(quotes.map(q => ({ name: q.name, client: q.client_name, createdBy: q.created_by_name, date: new Date(q.created_at).toLocaleDateString('en-IN'), total: q.grand_total })), 'quotes')} className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={() => exportToJSON(quotes, 'quotes')} className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5">
            <Download size={15} /> Export JSON
          </button>
          <button onClick={() => exportToPDF(quotes.map(q => ({ name: q.name, client: q.client_name || '—', createdBy: q.created_by_name || '—', date: new Date(q.created_at).toLocaleDateString('en-IN'), total: currency(q.grand_total) })), 'quotes', 'Quotes List')} className="flex items-center gap-2 border border-ink/20 text-sm font-semibold px-3 py-2 rounded-md hover:bg-ink/5">
            <Download size={15} /> Export PDF
          </button>
          <Link href="/quotes/new" className="flex items-center gap-2 bg-rust text-white text-sm font-semibold px-3 py-2 rounded-md hover:bg-rustdark">
            <Plus size={15} /> New quote
          </Link>
        </div>
      </div>

      {loading ? (
        <Loader2 className="animate-spin text-rust" />
      ) : (
        <div className="bg-white border border-ink/10 rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs text-ink/60 uppercase tracking-wide">
                <th className="px-4 py-3">Quote</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b border-ink/5 last:border-0 hover:bg-[#FCFBF8]">
                  <td className="px-4 py-3"><Link href={`/quotes/${q.id}`} className="font-medium text-rust flex items-center gap-2"><FileText size={14} />{q.name}</Link></td>
                  <td className="px-4 py-3 text-ink/70">{q.client_name || "—"}</td>
                  <td className="px-4 py-3 text-ink/60">{q.created_by_name || "—"}</td>
                  <td className="px-4 py-3 text-ink/50 text-xs">{new Date(q.created_at).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3 text-right font-semibold">{currency(q.grand_total)}</td>
                </tr>
              ))}
              {quotes.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/50 text-sm">No quotes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </ProtectedPage>
  );
}
