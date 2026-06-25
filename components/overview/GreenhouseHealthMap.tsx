const sectors = [
  { x: 9, y: 18, state: "normal" },
  { x: 18, y: 32, state: "strong" },
  { x: 28, y: 20, state: "normal" },
  { x: 37, y: 45, state: "normal" },
  { x: 47, y: 28, state: "strong" },
  { x: 57, y: 52, state: "normal" },
  { x: 68, y: 24, state: "alert" },
  { x: 77, y: 42, state: "normal" },
  { x: 88, y: 30, state: "strong" },
  { x: 14, y: 62, state: "normal" },
  { x: 27, y: 74, state: "normal" },
  { x: 40, y: 66, state: "strong" },
  { x: 53, y: 78, state: "normal" },
  { x: 66, y: 70, state: "normal" },
  { x: 81, y: 72, state: "normal" }
];

const lines = [
  "0 18 100 18",
  "0 34 100 34",
  "0 50 100 50",
  "0 66 100 66",
  "0 82 100 82",
  "12 0 12 100",
  "25 0 25 100",
  "38 0 38 100",
  "51 0 51 100",
  "64 0 64 100",
  "77 0 77 100",
  "90 0 90 100"
];

function pointColor(state: string) {
  if (state === "strong") return "#183D2A";
  if (state === "alert") return "#B8922E";
  return "#88A98B";
}

type GreenhouseHealthMapProps = {
  beds: number;
  reviewZones: number;
};

export function GreenhouseHealthMap({ beds, reviewZones }: GreenhouseHealthMapProps) {
  const bedLabel = beds === 1 ? "1 cama" : `${beds.toLocaleString("es-MX")} camas`;
  const reviewLabel =
    reviewZones === 1
      ? "1 zona en revisión"
      : `${reviewZones.toLocaleString("es-MX")} zonas en revisión`;

  return (
    <div className="overflow-hidden rounded-[18px] border border-app-border bg-app-soft">
      <div className="flex items-center justify-between border-b border-app-border bg-white/35 px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-app-muted">
            Mapa operativo del área productiva
          </p>
          <p className="mt-1 text-sm text-app-muted">Sectores, camas y zonas de atención</p>
        </div>
        <span className="h-2 w-2 rounded-full bg-app-green" />
      </div>
      <div className="relative aspect-[1.72] min-h-[300px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_26%_30%,rgba(24,61,42,0.16),transparent_28%),radial-gradient(circle_at_68%_42%,rgba(243,232,200,0.9),transparent_24%),linear-gradient(115deg,rgba(255,255,255,0.72),rgba(232,241,232,0.18))]" />
        <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(110deg,rgba(24,61,42,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(24,61,42,0.05)_1px,transparent_1px)] [background-size:54px_54px,36px_36px]" />
        <svg
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
          role="img"
          aria-label="Mapa abstracto de salud del área productiva"
        >
          <g opacity="0.34" stroke="#183D2A" strokeWidth="0.12">
            {lines.map((line) => {
              const [x1, y1, x2, y2] = line.split(" ").map(Number);
              return <line key={line} x1={x1} y1={y1} x2={x2} y2={y2} />;
            })}
          </g>
          <path
            d="M8 76 C20 58, 33 65, 43 48 S64 28, 76 37 S88 61, 94 45"
            fill="none"
            opacity="0.38"
            stroke="#183D2A"
            strokeWidth="0.42"
          />
          <path
            d="M7 35 C22 28, 36 42, 48 31 S72 16, 93 26"
            fill="none"
            opacity="0.3"
            stroke="#88A98B"
            strokeWidth="0.35"
          />
          <ellipse cx="68" cy="42" fill="#F3E8C8" opacity="0.68" rx="13" ry="10" />
          {sectors.map((sector) => (
            <circle
              key={`${sector.x}-${sector.y}`}
              cx={sector.x}
              cy={sector.y}
              fill={pointColor(sector.state)}
              opacity={sector.state === "alert" ? 1 : 0.72}
              r={sector.state === "alert" ? 1.15 : 0.72}
            />
          ))}
        </svg>
        <div className="absolute bottom-5 left-5 flex gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-app-muted">
          <span>{bedLabel}</span>
          <span className="text-app-border">/</span>
          <span>{reviewLabel}</span>
        </div>
      </div>
    </div>
  );
}
