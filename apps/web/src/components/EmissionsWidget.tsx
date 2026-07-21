"use client";

import type { SensorUpdate } from "../hooks/useSensorData";

const FUEL_TYPES = ["diesel", "MGO", "MDO", "HFO", "LNG"] as const;
const ACCENT = "#22c55e";

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const W = 100, H = 22;
  if (data.length < 2) return <svg width={W} height={H} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * W},${H - 2 - ((v - min) / range) * (H - 4)}`)
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function useTrend(history: number[]) {
  if (history.length < 2) return { dir: "─", delta: "0.0", up: true };
  const delta = history[history.length - 1] - history[history.length - 2];
  return {
    dir: delta > 0.01 ? "▲" : delta < -0.01 ? "▼" : "─",
    delta: Math.abs(delta).toFixed(2),
    up: delta >= 0,
  };
}

interface EmissionsWidgetProps {
  update: SensorUpdate | null;
  history?: number[];
  onFuelTypeChange: (ft: string) => void;
}

export function EmissionsWidget({ update, history = [], onFuelTypeChange }: EmissionsWidgetProps) {
  const { dir, delta, up } = useTrend(history);
  const level = Math.min(100, Math.max(0, ((update?.value ?? 0) / 40) * 100));

  return (
    <div
      className={`cog-widget cog-widget--emissions ${update ? "cog-widget--live" : "cog-widget--empty"}`}
      style={{ "--accent": ACCENT, "--level": `${level}%` } as React.CSSProperties}
    >
      <div className="cog-widget__gear">
        <div className="cog-widget__inner">
          <span className="cog-widget__mnemonic">CO2</span>
          {update ? (
            <>
              <span className="cog-widget__value">{update.value.toFixed(2)}</span>
              <span className="cog-widget__unit">kg/h</span>
            </>
          ) : (
            <span className="cog-widget__waiting">NO SIGNAL</span>
          )}
        </div>
      </div>
      <div className="cog-widget__caption">
        <span className="cog-widget__label">Emission Rate</span>
        {update && (
          <span className={`cog-widget__trend ${up ? "cog-widget__trend--up" : "cog-widget__trend--down"}`}>
            {dir} {delta}
          </span>
        )}
      </div>
      {update ? (
        <>
          <div className="cog-widget__footer">
            <Sparkline data={history} color={ACCENT} />
            <span className="cog-widget__time">{new Date(update.timestamp).toLocaleTimeString()}</span>
          </div>
          <div className="cog-widget__meta">
            {update.fuelType && <span>{update.fuelType}</span>}
            {update.cacheHit && <span>CACHED</span>}
          </div>
        </>
      ) : null}
      <div className="cog-widget__fuel-selector">
        <label htmlFor="fuelType">FUEL TYPE</label>
        <select id="fuelType" onChange={(e) => onFuelTypeChange(e.target.value)} defaultValue="diesel">
          {FUEL_TYPES.map((ft) => (
            <option key={ft} value={ft}>{ft}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
