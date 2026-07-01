"use client";
import { useEffect, useState } from "react";
import { Database, Download, X, Loader2 } from "lucide-react";

export default function BackupPrompt() {
  const [status, setStatus] = useState(null); // { shouldPrompt, daysSinceLastBackup }
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch("/api/backup")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setStatus(data));
  }, []);

  async function handleBackupNow() {
    setDownloading(true);
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `anupam-paints-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStatus({ shouldPrompt: false, lastBackupAt: data.exportedAt, daysSinceLastBackup: 0 });
      setDismissed(true);
    } catch (err) {
      alert("Could not create backup. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (!status || !status.shouldPrompt || dismissed) return null;

  return (
    <div className="bg-ochretint border border-ochre/40 rounded-lg px-4 py-3 mb-6 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-sm text-ink/80">
        <Database size={16} className="text-ochre" />
        {status.daysSinceLastBackup === null
          ? "You haven't taken a backup yet. It's a good idea to back up your data weekly."
          : `It's been ${status.daysSinceLastBackup} days since your last backup. Take one now?`}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleBackupNow}
          disabled={downloading}
          className="flex items-center gap-1.5 bg-ochre text-white text-xs font-semibold px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50"
        >
          {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Backup now
        </button>
        <button onClick={() => setDismissed(true)} className="text-ink/40 hover:text-ink/70">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
