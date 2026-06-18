import { cn } from "@/lib/utils";

type AtmosphericMapVisualProps = {
  variant: "login" | "reports";
  className?: string;
};

const loginPoints = [
  { x: 17, y: 30, tone: "soft" },
  { x: 31, y: 58, tone: "strong" },
  { x: 46, y: 36, tone: "soft" },
  { x: 64, y: 50, tone: "warm" },
  { x: 78, y: 27, tone: "strong" },
  { x: 84, y: 68, tone: "soft" }
];

const reportPoints = [
  { x: 12, y: 68, tone: "soft" },
  { x: 23, y: 44, tone: "strong" },
  { x: 36, y: 56, tone: "soft" },
  { x: 51, y: 34, tone: "warm" },
  { x: 66, y: 48, tone: "strong" },
  { x: 81, y: 29, tone: "soft" },
  { x: 88, y: 62, tone: "strong" }
];

function pointColor(tone: string) {
  if (tone === "strong") return "#183D2A";
  if (tone === "warm") return "#B8922E";
  return "#88A98B";
}

export function AtmosphericMapVisual({ variant, className }: AtmosphericMapVisualProps) {
  const isLogin = variant === "login";
  const points = isLogin ? loginPoints : reportPoints;

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-app-border bg-app-soft",
        isLogin ? "min-h-[260px] rounded-[18px]" : "min-h-[260px]",
        className
      )}
    >
      <div
        className={cn(
          "absolute inset-0",
          isLogin
            ? "bg-[radial-gradient(circle_at_30%_28%,rgba(24,61,42,0.12),transparent_30%),radial-gradient(circle_at_72%_54%,rgba(243,232,200,0.86),transparent_30%),linear-gradient(118deg,rgba(255,255,255,0.72),rgba(232,241,232,0.2))]"
            : "bg-[radial-gradient(circle_at_18%_70%,rgba(24,61,42,0.1),transparent_28%),radial-gradient(circle_at_54%_34%,rgba(243,232,200,0.82),transparent_26%),linear-gradient(115deg,rgba(255,255,255,0.68),rgba(232,241,232,0.18))]"
        )}
      />
      <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(90deg,rgba(24,61,42,0.1)_1px,transparent_1px),linear-gradient(0deg,rgba(24,61,42,0.05)_1px,transparent_1px)] [background-size:68px_68px,42px_42px]" />

      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        {isLogin ? (
          <>
            <path
              d="M8 66 C22 42, 38 62, 50 42 S76 20, 92 34"
              fill="none"
              opacity="0.34"
              stroke="#183D2A"
              strokeWidth="0.45"
            />
            <path
              d="M14 38 C29 30, 43 37, 56 34 S78 22, 88 48"
              fill="none"
              opacity="0.26"
              stroke="#88A98B"
              strokeWidth="0.32"
            />
            <ellipse cx="67" cy="52" fill="#F3E8C8" opacity="0.58" rx="16" ry="11" />
          </>
        ) : (
          <>
            <path
              d="M6 74 C20 62, 31 65, 42 48 S62 26, 76 36 S86 59, 95 45"
              fill="none"
              opacity="0.34"
              stroke="#183D2A"
              strokeWidth="0.42"
            />
            <path
              d="M10 24 C24 32, 36 20, 48 28 S70 48, 90 28"
              fill="none"
              opacity="0.28"
              stroke="#88A98B"
              strokeWidth="0.34"
            />
            <path
              d="M22 78 C35 55, 49 63, 61 45 S76 34, 88 39"
              fill="none"
              opacity="0.18"
              stroke="#B8922E"
              strokeWidth="0.36"
            />
            <ellipse cx="53" cy="37" fill="#F3E8C8" opacity="0.55" rx="14" ry="9" />
          </>
        )}

        {points.map((point) => (
          <circle
            key={`${point.x}-${point.y}`}
            cx={point.x}
            cy={point.y}
            fill={pointColor(point.tone)}
            opacity={point.tone === "warm" ? 0.96 : 0.7}
            r={point.tone === "warm" ? 1.1 : 0.74}
          />
        ))}
      </svg>

      {isLogin ? (
        <div className="absolute bottom-5 left-5 font-mono text-[10px] uppercase tracking-[0.22em] text-app-muted">
          clima / cultivo / operación
        </div>
      ) : (
        <div className="absolute inset-x-5 bottom-5 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-app-muted">
          <span>trayectoria operativa</span>
          <span>producción · riego · costos</span>
        </div>
      )}
    </div>
  );
}
