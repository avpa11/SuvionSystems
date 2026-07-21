"use client";

interface PositionWidgetProps {
  lat: number | null;
  lon: number | null;
}

function formatCoord(value: number, posLabel: string, negLabel: string): string {
  const hemi = value >= 0 ? posLabel : negLabel;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFull = (abs - deg) * 60;
  const min = minFull.toFixed(3);
  return `${hemi} ${String(deg).padStart(posLabel === "N" ? 2 : 3, "0")}° ${min}'`;
}

export function PositionWidget({ lat, lon }: PositionWidgetProps) {
  const hasData = lat !== null && lon !== null;

  return (
    <div className="position-instrument">
      <div className="position-instrument__header">
        <span className="position-instrument__mnemonic">POS</span>
        <span className="position-instrument__label">Position</span>
      </div>
      {hasData ? (
        <div className="position-widget__body">
          <div className="position-widget__coord">
            <span className="position-widget__hemi">{lat! >= 0 ? "N" : "S"}</span>
            <span className="position-widget__value">{formatCoord(lat!, "N", "S")}</span>
          </div>
          <div className="position-widget__coord">
            <span className="position-widget__hemi">{lon! >= 0 ? "E" : "W"}</span>
            <span className="position-widget__value">{formatCoord(lon!, "E", "W")}</span>
          </div>
        </div>
      ) : (
        <div className="position-instrument__waiting">NO SIGNAL</div>
      )}
    </div>
  );
}
