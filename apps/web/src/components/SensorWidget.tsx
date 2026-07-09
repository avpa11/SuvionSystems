"use client";

import type { SensorUpdate } from "../hooks/useSensorData";

interface SensorWidgetProps {
  label: string;
  mnemonic: string;
  update: SensorUpdate | null;
  history?: number[];
  precision?: number;
  accentColor?: string;
}

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
    delta: Math.abs(delta).toFixed(1),
    up: delta >= 0,
  };
}

export function SensorWidget({
  label,
  mnemonic,
  update,
  history = [],
  precision = 1,
  accentColor = "#3b82f6",
}: SensorWidgetProps) {
  const { dir, delta, up } = useTrend(history);

  return (
    <div className="sensor-widget" style={{ "--accent": accentColor } as React.CSSProperties}>
      <div className="sensor-widget__header">
        <span className="sensor-widget__mnemonic">{mnemonic}</span>
        <span className="sensor-widget__label">{label}</span>
        {update && (
          <span className={`sensor-widget__trend ${up ? "sensor-widget__trend--up" : "sensor-widget__trend--down"}`}>
            {dir} {delta}
          </span>
        )}
      </div>
      {update ? (
        <>
          <div className="sensor-widget__value-row">
            <span className="sensor-widget__value">{update.value.toFixed(precision)}</span>
            <span className="sensor-widget__unit">{update.unit}</span>
          </div>
          <div className="sensor-widget__footer">
            <Sparkline data={history} color={accentColor} />
            <span className="sensor-widget__ts">{new Date(update.timestamp).toLocaleTimeString()}</span>
          </div>
        </>
      ) : (
        <div className="sensor-widget__waiting">NO DATA</div>
      )}
    </div>
  );
}
