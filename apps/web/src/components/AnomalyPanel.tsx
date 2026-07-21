"use client";

import type { AnomalyUpdate } from "../hooks/useSensorData";

interface AnomalyPanelProps {
  anomalies: AnomalyUpdate[];
}

export function AnomalyPanel({ anomalies }: AnomalyPanelProps) {
  const latest = anomalies[0];

  return (
    <section className="anomaly-panel" aria-label="Anomaly detection">
      <div className="anomaly-panel__header">
        <span className="anomaly-panel__title">Anomaly Detection</span>
        <span className={`badge ${latest ? "badge--warning" : "badge--success"}`}>
          {latest ? `${anomalies.length} active` : "clear"}
        </span>
      </div>

      {latest ? (
        <div className="anomaly-panel__list">
          {anomalies.map((event, index) => (
            <div key={`${event.timestamp}-${index}`} className="anomaly-panel__event">
              <span className="anomaly-panel__time">{new Date(event.timestamp).toLocaleTimeString()}</span>
              <span className="anomaly-panel__score">score {event.score.toFixed(3)}</span>
              <span className="anomaly-panel__streams">
                {(event.contributing.length ? event.contributing : ["combined"]).join(", ")}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="anomaly-panel__empty">No anomaly events received in this session.</div>
      )}
    </section>
  );
}
