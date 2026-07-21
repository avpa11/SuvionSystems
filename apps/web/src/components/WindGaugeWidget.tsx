"use client";

// Semicircle arc: left (−90°) through top (0°) to right (+90°).
// Wind angle convention: 0° = head to wind, − = port, + = starboard.
// Needle SVG angle = windAngle − 90°.
//
// Full arc from left to right covers wind angles −90° to +90°.
// Beyond ±90° the needle moves into the lower half (outside the arc) — physically
// meaningful (wind from astern) and visually clear.

const VW = 200, VH = 120;
const CX = 100, CY = 108;
const R = 92;

function windToSvg(angle: number) {
  const rad = (angle - 90) * Math.PI / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

// Tick labels shown inside the arc
const LABELS: { angle: number; label: string }[] = [
  { angle: 0,   label: "0"  },
  { angle: 30,  label: "30" },
  { angle: -30, label: "30" },
  { angle: 60,  label: "60" },
  { angle: -60, label: "60" },
  { angle: 90,  label: "90" },
  { angle: -90, label: "90" },
];

const TICK_ANGLES = [-90, -60, -30, 0, 30, 60, 90];

interface WindGaugeWidgetProps {
  angle: number | null;
  speed: number | null;
}

export function WindGaugeWidget({ angle, speed }: WindGaugeWidgetProps) {
  const hasData = angle !== null;
  const safeAngle = angle ?? 0;

  // Needle endpoint
  const needle = windToSvg(safeAngle);

  return (
    <div className="nav-widget">
      <div className="nav-widget__label">APPARENT WIND</div>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        width={VW}
        height={VH}
        style={{ display: "block", margin: "0 auto", overflow: "visible" }}
        aria-label={`Apparent wind ${hasData ? Math.round(safeAngle) + "°" : "no data"}`}
      >
        {/* Port arc (red): left → top */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX} ${CY - R}`}
          fill="none"
          stroke={hasData ? "rgba(239,68,68,0.55)" : "#1e2433"}
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Starboard arc (green): top → right */}
        <path
          d={`M ${CX} ${CY - R} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke={hasData ? "rgba(34,197,94,0.55)" : "#1e2433"}
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Tick marks */}
        {TICK_ANGLES.map((a) => {
          const outer = windToSvg(a);
          const innerR = 84;
          const rad = (a - 90) * Math.PI / 180;
          const inner = { x: CX + innerR * Math.cos(rad), y: CY + innerR * Math.sin(rad) };
          return (
            <line
              key={a}
              x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y}
              stroke="#3d4559"
              strokeWidth={a === 0 ? 1.5 : 1}
            />
          );
        })}

        {/* Labels inside the arc at R=74 */}
        {LABELS.map(({ angle: a, label }) => {
          const rad = (a - 90) * Math.PI / 180;
          const lx = CX + 74 * Math.cos(rad);
          const ly = CY + 74 * Math.sin(rad);
          return (
            <text
              key={`${a}-${label}`}
              x={lx}
              y={ly + 3}
              textAnchor="middle"
              fontSize="8"
              fontFamily="'Courier New', monospace"
              fill="#3d4559"
            >
              {label}
            </text>
          );
        })}

        {/* Needle */}
        {hasData && (
          <>
            <line
              x1={CX} y1={CY}
              x2={needle.x} y2={needle.y}
              stroke="#c9d1e0"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            {/* Needle tip dot */}
            <circle cx={needle.x} cy={needle.y} r="3" fill={safeAngle >= 0 ? "#22c55e" : "#ef4444"} />
          </>
        )}

        {/* Center pivot */}
        <circle cx={CX} cy={CY} r="4" fill="#1e2433" stroke="#3d4559" strokeWidth="1" />

        {/* Port / Starboard side labels */}
        <text x="14" y={CY - 6} textAnchor="middle" fontSize="7" fontFamily="'Courier New', monospace" fill="rgba(239,68,68,0.6)">PORT</text>
        <text x="186" y={CY - 6} textAnchor="middle" fontSize="7" fontFamily="'Courier New', monospace" fill="rgba(34,197,94,0.6)">STBD</text>

        {/* Value readout */}
        {hasData ? (
          <>
            <text x={CX} y={CY + 22} textAnchor="middle" fontSize="18" fontWeight="400" fontFamily="'Courier New', monospace" fill="#c9d1e0">
              {safeAngle >= 0 ? "+" : "−"}{Math.abs(Math.round(safeAngle))}°
            </text>
            {speed !== null && (
              <text x={CX} y={CY + 36} textAnchor="middle" fontSize="9" fontFamily="'Courier New', monospace" fill="#5a6478">
                {speed.toFixed(1)} m/s
              </text>
            )}
          </>
        ) : (
          <text x={CX} y={CY + 20} textAnchor="middle" fontSize="9" fontFamily="'Courier New', monospace" fill="#3d4559" letterSpacing="1">
            NO SIGNAL
          </text>
        )}
      </svg>
    </div>
  );
}
