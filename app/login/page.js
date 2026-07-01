"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthContext";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }
      setUser(data.user);
      router.push("/products");
    } catch (err) {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-ink" style={{ fontFamily: "Georgia, serif" }}>
            Anupam Paints
          </h1>
          <p className="text-sm text-ink/60 mt-1">Costing &amp; Quoting System</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-ink/10 rounded-lg p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink/70 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]"
              placeholder="you@anupampaints.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink/70 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8]"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-xs text-bad font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-rust text-white text-sm font-semibold py-2.5 rounded-md hover:bg-rustdark transition-colors disabled:opacity-60"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            Sign in
          </button>
        </form>

        <p className="text-xs text-ink/50 text-center mt-4">
          Accounts are created by your admin. Contact them if you need access.
        </p>
      </div>
    </div>
  );
}
