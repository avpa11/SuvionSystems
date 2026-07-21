"use client";

const SIZE = 160;
const CX = 80, CY = 80;
const R_OUTER = 72;
const R_MAJOR_TICK = 61;
const R_MINOR_TICK = 66;
const R_LABEL = 50;

const CARDINALS = ["N", "E", "S", "W"];
const INTERCARDINALS = ["NE", "SE", "SW", "NW"];

function bearingLabel(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function toRad(deg: number) { return (deg - 90) * Math.PI / 180; }

interface CompassWidgetProps {
  heading: number | null;
}

export function CompassWidget({ heading }: CompassWidgetProps) {
  const hdg = heading ?? 0;
  const hasData = heading !== null;

  const ticks = Array.from({ length: 36 }, (_, i) => {
    const angle = i * 10;
    const rad = toRad(angle);
    const isCardinal = angle % 90 === 0;
    const isMajor = angle % 30 === 0;
    const innerR = isCardinal ? R_MAJOR_TICK - 4 : isMajor ? R_MAJOR_TICK : R_MINOR_TICK;
    return {
      x1: CX + R_OUTER * Math.cos(rad),
      y1: CY + R_OUTER * Math.sin(rad),
      x2: CX + innerR * Math.cos(rad),
      y2: CY + innerR * Math.sin(rad),
      isCardinal,
      isMajor,
    };
  });

  return (
    <div className="nav-widget">
      <div className="nav-widget__label">HDG (MAG)</div>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        style={{ display: "block", margin: "0 auto" }}
        aria-label={`Compass heading ${Math.round(hdg)}°`}
      >
        {/* Outer ring */}
        <circle cx={CX} cy={CY} r={R_OUTER + 2} fill="none" stroke="#1e2433" strokeWidth="3" />
        <circle cx={CX} cy={CY} r={R_OUTER + 2} fill="#0a0c10" />

        {/* Rotating rose (heading-up: current heading always at top) */}
        <g transform={`rotate(${-hdg}, ${CX}, ${CY})`} opacity={hasData ? 1 : 0.3}>
          {/* Tick marks */}
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
              stroke={t.isCardinal ? "#5a6478" : t.isMajor ? "#3d4559" : "#2a3147"}
              strokeWidth={t.isCardinal ? 1.5 : 1}
            />
          ))}

          {/* Cardinal letters */}
          {CARDINALS.map((lbl, i) => {
            const angle = i * 90;
            const rad = toRad(angle);
            return (
              <text
                key={lbl}
                x={CX + R_LABEL * Math.cos(rad)}
                y={CY + R_LABEL * Math.sin(rad) + 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fontFamily="'Courier New', monospace"
                fill={lbl === "N" ? "#ef4444" : "#5a6478"}
              >
                {lbl}
              </text>
            );
          })}

          {/* Intercardinal letters */}
          {INTERCARDINALS.map((lbl, i) => {
            const angle = 45 + i * 90;
            const rad = toRad(angle);
            return (
              <text
                key={lbl}
                x={CX + R_LABEL * Math.cos(rad)}
                y={CY + R_LABEL * Math.sin(rad) + 3}
                textAnchor="middle"
                fontSize="7"
                fontFamily="'Courier New', monospace"
                fill="#3d4559"
              >
                {lbl}
              </text>
            );
          })}
        </g>

        {/* Fixed heading marker at 12 o'clock */}
        <polygon
          points={`${CX},${CY - R_OUTER + 1} ${CX - 5},${CY - R_OUTER + 13} ${CX + 5},${CY - R_OUTER + 13}`}
          fill="#3b82f6"
        />

        {/* Center value */}
        {hasData ? (
          <>
            <text x={CX} y={CY + 7} textAnchor="middle" fontSize="20" fontWeight="400" fontFamily="'Courier New', monospace" fill="#c9d1e0" letterSpacing="0">
              {String(Math.round(hdg) % 360).padStart(3, "0")}°
            </text>
          </>
        ) : (
          <text x={CX} y={CY + 5} textAnchor="middle" fontSize="9" fontFamily="'Courier New', monospace" fill="#3d4559" letterSpacing="1">
            NO SIGNAL
          </text>
        )}
      </svg>
      {hasData && (
        <div className="nav-widget__sublabel">{bearingLabel(hdg)}</div>
      )}
    </div>
  );
}
