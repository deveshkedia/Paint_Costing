"use client";

/**
 * Minimal SVG line chart for a price timeline. No external chart library —
 * just enough to show a trend with hoverable points.
 * points: [{ date: ISOString, value: number, isCurrent?: boolean }]
 */
export default function PriceTimelineChart({ points, valuePrefix = "₹", height = 180 }) {
  if (!points || points.length === 0) {
    return <p className="text-sm text-ink/50 text-center py-8">No price history yet.</p>;
  }

  const width = 600;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const padded = range * 0.15;
  const yMin = Math.max(0, minVal - padded);
  const yMax = maxVal + padded;

  const times = points.map((p) => new Date(p.date).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeRange = maxTime - minTime || 1;

  function xFor(time) {
    return padding.left + ((time - minTime) / timeRange) * innerWidth;
  }
  function yFor(value) {
    return padding.top + innerHeight - ((value - yMin) / (yMax - yMin)) * innerHeight;
  }

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(new Date(p.date).getTime())} ${yFor(p.value)}`)
    .join(" ");

  const areaD = `${pathD} L ${xFor(maxTime)} ${padding.top + innerHeight} L ${xFor(minTime)} ${padding.top + innerHeight} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <defs>
        <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C75D3D" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#C75D3D" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Gridlines */}
      {[0, 0.5, 1].map((frac) => {
        const y = padding.top + innerHeight * frac;
        const val = yMax - (yMax - yMin) * frac;
        return (
          <g key={frac}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#1C1816" strokeOpacity="0.08" />
            <text x={padding.left - 8} y={y + 4} fontSize="10" textAnchor="end" fill="#6B6258">
              {valuePrefix}{Math.round(val)}
            </text>
          </g>
        );
      })}

      <path d={areaD} fill="url(#priceFill)" />
      <path d={pathD} fill="none" stroke="#C75D3D" strokeWidth="2" />

      {points.map((p, i) => {
        const cx = xFor(new Date(p.date).getTime());
        const cy = yFor(p.value);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={p.isCurrent ? 5 : 3.5} fill={p.isCurrent ? "#C75D3D" : "#0F3D3E"} stroke="white" strokeWidth="1.5" />
          </g>
        );
      })}

      {/* X-axis date labels: first, middle, last */}
      {[points[0], points[Math.floor(points.length / 2)], points[points.length - 1]].map((p, i) => (
        <text
          key={i}
          x={xFor(new Date(p.date).getTime())}
          y={height - 8}
          fontSize="10"
          textAnchor="middle"
          fill="#6B6258"
        >
          {new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        </text>
      ))}
    </svg>
  );
}
