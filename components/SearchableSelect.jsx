"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

export default function SearchableSelect({ value, onChange, options, placeholder = "Search and select…" }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const filtered = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between border border-ink/20 rounded-md px-3 py-2 text-sm bg-[#FCFBF8] text-left hover:bg-white transition-colors"
      >
        <span className={selectedOption ? "text-ink" : "text-ink/50"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={16} className={`text-ink/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-ink/20 rounded-md shadow-lg z-50">
          <div className="sticky top-0 p-2 bg-white border-b border-ink/10">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search…"
              className="w-full border border-ink/20 rounded px-2 py-1.5 text-sm bg-[#FCFBF8] placeholder-ink/40 focus:outline-none focus:ring-1 focus:ring-rust/30"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-ink/40">No matches found</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-rust/5 border-b border-ink/5 last:border-0 transition-colors ${
                    value === opt.value ? "bg-rust/10 text-rust font-medium" : "text-ink"
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
