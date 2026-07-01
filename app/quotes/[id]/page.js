"use client";
import { useEffect, useState } from "react";
import ProtectedPage from "../../../components/ProtectedPage";
import { Loader2 } from "lucide-react";

function currency(n) {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function QuoteDetailPage({ params }) {
  const { id } = params;
  const [quote, setQuote] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/quotes/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
        } else {
          setQuote(d.quote);
          setLines(d.lines);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <ProtectedPage allowedRoles={["admin", "estimator"]}><Loader2 className="animate-spin text-rust" /></ProtectedPage>;
  }
  if (error || !quote) {
    return <ProtectedPage allowedRoles={["admin", "estimator"]}><p className="text-sm text-bad">{error || "Quote not found."}</p></ProtectedPage>;
  }

  return (
    <ProtectedPage allowedRoles={["admin", "estimator"]}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>{quote.name}</h1>
        <p className="text-sm text-ink/60">
          {quote.client_name && `${quote.client_name} · `}
          Created by {quote.created_by_name || "—"} on {new Date(quote.created_at).toLocaleDateString("en-IN")}
        </p>
      </div>

      <div className="bg-white border border-ink/10 rounded-lg shadow-sm overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs text-ink/60 uppercase tracking-wide">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Spec</th>
              <th className="px-4 py-3 text-right">Quantity</th>
              <th className="px-4 py-3 text-right">Cost/kg</th>
              <th className="px-4 py-3 text-right">Cost/litre</th>
              <th className="px-4 py-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-ink/5 last:border-0">
                <td className="px-4 py-3 font-medium">{l.product_name}</td>
                <td className="px-4 py-3 text-ink/60">{l.customer_spec}</td>
                <td className="px-4 py-3 text-right">{l.quantity_kg ? `${l.quantity_kg} kg` : `${l.quantity_litre} L`}</td>
                <td className="px-4 py-3 text-right text-ink/60">{currency(l.cost_per_kg_snap)}</td>
                <td className="px-4 py-3 text-right text-ink/60">{currency(l.cost_per_litre_snap)}</td>
                <td className="px-4 py-3 text-right font-semibold">{currency(l.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-teal text-paper rounded-lg p-5">
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div><span className="text-paper/60">Margin</span><p className="font-semibold">{quote.margin_pct}%</p></div>
          <div><span className="text-paper/60">GST</span><p className="font-semibold">{quote.gst_pct}%</p></div>
        </div>
        <div className="flex items-center justify-between border-t border-paper/20 pt-4">
          <span className="text-sm text-paper/60">Grand total</span>
          <span className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>{currency(quote.grand_total)}</span>
        </div>
      </div>

      <p className="text-xs text-ink/50 mt-4">
        Costs shown are snapshotted at the time this quote was created — they won't change even if raw material prices move later.
      </p>
    </ProtectedPage>
  );
}
