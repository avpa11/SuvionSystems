"use client";

import type { SensorUpdate } from "../hooks/useSensorData";

function SparkArc({ data, color }: { data: number[]; color: string }) {
  const width = 96;
  const height = 26;

  if (data.length < 2)
    return <svg width={width} height={height} aria-hidden="true" />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - 3 - ((value - min) / range) * (height - 6);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function trendLabel(history: number[]) {
  if (history.length < 2)
    return { label: "steady", className: "cog-widget__trend--flat" };
  const delta = history[history.length - 1] - history[history.length - 2];
  if (delta > 0.01)
    return {
      label: `up ${Math.abs(delta).toFixed(2)}`,
      className: "cog-widget__trend--up",
    };
  if (delta < -0.01)
    return {
      label: `down ${Math.abs(delta).toFixed(2)}`,
      className: "cog-widget__trend--down",
    };
  return { label: "steady", className: "cog-widget__trend--flat" };
}

interface SensorCogWidgetProps {
  label: string;
  mnemonic: string;
  update: SensorUpdate | null;
  history?: number[];
  precision?: number;
  accentColor?: string;
  min?: number;
  max?: number;
}

export function SensorCogWidget({
  label,
  mnemonic,
  update,
  history = [],
  precision = 1,
  accentColor = "#3b82f6",
  min = 0,
  max = 100,
}: SensorCogWidgetProps) {
  const hasData = update !== null;
  const value = update?.value ?? 0;
  const level = clamp(((value - min) / Math.max(1, max - min)) * 100, 0, 100);
  const trend = trendLabel(history);

  return (
    <div
      className={`cog-widget ${hasData ? "cog-widget--live" : "cog-widget--empty"}`}
      style={
        {
          "--accent": accentColor,
          "--level": `${level}%`,
        } as React.CSSProperties
      }
    >
      <div
        className="cog-widget__gear"
        aria-label={`${label}: ${hasData ? value.toFixed(precision) + " " + update.unit : "no data"}`}
      >
        <div className="cog-widget__inner">
          <span className="cog-widget__mnemonic">{mnemonic}</span>
          {hasData ? (
            <>
              <span className="cog-widget__value">
                {value.toFixed(precision)}
              </span>
              <span className="cog-widget__unit">{update.unit}</span>
            </>
          ) : (
            <span className="cog-widget__waiting">—</span>
          )}
        </div>
      </div>
      <div className="cog-widget__caption">
        <span className="cog-widget__label">{label}</span>
        {hasData && (
          <span className={`cog-widget__trend ${trend.className}`}>
            {trend.label}
          </span>
        )}
      </div>
      <div className="cog-widget__footer">
        <SparkArc data={history} color={accentColor} />
        {hasData && (
          <span className="cog-widget__time">
            {new Date(update.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
