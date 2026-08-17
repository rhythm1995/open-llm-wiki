/**
 * Insight lattice mark. Original drawing: one hub, radiating
 * notes in the brand constellation. Not copied from any third-party SVG.
 */
export function Lattice({ className = "" }: { className?: string }) {
  const spokes = [
    { x: 210, y: 36, r: 5, fill: "#1a1614" },
    { x: 268, y: 78, r: 4, fill: "#e2e67d" },
    { x: 292, y: 148, r: 5, fill: "#1a1614" },
    { x: 250, y: 214, r: 4, fill: "#c47a2c" },
    { x: 176, y: 236, r: 4.5, fill: "#7d8240" },
    { x: 98, y: 206, r: 4, fill: "#e2e67d" },
    { x: 62, y: 136, r: 5, fill: "#1a1614" },
    { x: 86, y: 68, r: 3.5, fill: "#c47a2c" },
    { x: 148, y: 42, r: 4, fill: "#7d8240" },
    { x: 232, y: 118, r: 3, fill: "#e2e67d" },
    { x: 118, y: 162, r: 3, fill: "#1a1614" },
  ];
  const cx = 176;
  const cy = 132;
  return (
    <svg
      className={className}
      viewBox="0 0 352 264"
      role="img"
      aria-label="A hub with notes radiating into a lattice"
    >
      {spokes.map((s) => (
        <line
          key={`${s.x}-${s.y}-line`}
          x1={cx}
          y1={cy}
          x2={s.x}
          y2={s.y}
          stroke="#a8a7a1"
          strokeWidth="0.6"
        />
      ))}
      <circle className="lattice-hub" cx={cx} cy={cy} r="7" fill="#1a1614" />
      {spokes.map((s) => (
        <circle key={`${s.x}-${s.y}`} cx={s.x} cy={s.y} r={s.r} fill={s.fill} />
      ))}
    </svg>
  );
}
