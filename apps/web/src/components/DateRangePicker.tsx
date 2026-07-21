"use client";

import { useState } from "react";

type Severity = "compliant" | "watch" | "warning";

interface ReportData {
  vesselId: string;
  reportPeriodStart: string;
  reportPeriodEnd: string;
  generatedAt: string;
  summaryStatus?: Severity;
  fuelType: string;
  fuelConsumedL: number;
  co2EmittedKg: number;
  waterUsageL: number;
  generatorCurrentAvgA: number;
  avgTemperatureC: number;
  carbonIntensityKgPerL: number;
  averageRates?: {
    fuelLh: number;
    co2Kgh: number;
    waterLh: number;
  };
  benchmarkContext?: {
    similarVesselLabel: string;
    standardsNote: string;
  };
  calculationBasis?: {
    fuel: string;
    emissions: string;
    compliance: string;
  };
  validationSources?: {
    id: string;
    title: string;
    url: string;
    fetchedAt: string | null;
    status: string;
    snippet?: string;
  }[];
  industryComparisons?: ComparisonMetric[];
  hourlySeries?: HourlySeriesPoint[];
  co2ImpactFacts?: Co2ImpactFact[];
  reportInsights?: ReportInsight[];
  nonCompliantPeriods: {
    start: string;
    end: string;
    reason: string;
    value: number;
    threshold: number;
  }[];
}

interface ComparisonMetric {
  id: string;
  label: string;
  category: "industry" | "similar_vessel" | "calculation";
  value: number;
  unit: string;
  benchmark: number;
  benchmarkLabel: string;
  ratio: number;
  deltaPct: number;
  status: Severity;
  detail: string;
  sourceId?: string;
}

interface HourlySeriesPoint {
  start: string;
  end: string;
  label: string;
  fuelRateLh: number;
  co2RateKgh: number;
  status: Severity;
}

interface Co2ImpactFact {
  id: string;
  label: string;
  value: number;
  unit: string;
  status: Severity;
  summary: string;
  method: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceStatus?: string;
  sourceSnippet?: string;
}

interface ReportInsight {
  id: string;
  title: string;
  status: Severity;
  message: string;
  sourceId?: string;
}

const API_HOST = process.env.NEXT_PUBLIC_API_HOST ?? "http://localhost:4001";

export function DateRangePicker() {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);

  const [startDate, setStartDate] = useState(yesterday.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchReport() {
    setLoading(true);
    setError(null);
    setReport(null);

    const start = `${startDate}T00:00:00.000Z`;
    const end = `${endDate}T23:59:59.000Z`;

    try {
      const res = await fetch(
        `${API_HOST}/report?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ReportData;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    const start = `${startDate}T00:00:00.000Z`;
    const end = `${endDate}T23:59:59.000Z`;
    const url = `${API_HOST}/report?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&format=csv`;
    window.open(url, "_blank");
  }

  function downloadPDF() {
    const start = `${startDate}T00:00:00.000Z`;
    const end = `${endDate}T23:59:59.000Z`;
    const url = `${API_HOST}/report?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&format=pdf`;
    window.open(url, "_blank");
  }

  const status = report?.summaryStatus ?? "compliant";

  return (
    <div className="report-panel">
      <div className="report-panel__heading">
        <h2 className="report-panel__title">Sustainability Report</h2>
        {report && <StatusBadge status={status} label={status} />}
      </div>

      <div className="report-panel__controls">
        <label>
          From
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <button onClick={fetchReport} disabled={loading}>
          {loading ? "Generating..." : "Generate Report"}
        </button>
      </div>

      {error && <div className="report-panel__error">{error}</div>}

      {report && (
        <div className="report-panel__result">
          <section className={`report-status report-status--${status}`}>
            <div>
              <span className="report-status__eyebrow">Overall Status</span>
              <strong>{status}</strong>
            </div>
            <div className="report-status__meta">
              <span>{formatDate(report.reportPeriodStart)}</span>
              <span>{formatDate(report.reportPeriodEnd)}</span>
            </div>
          </section>

          <section className="report-kpis" aria-label="Report summary">
            <Kpi label="CO₂ Emitted" value={formatNumber(report.co2EmittedKg)} unit="kg" status={status} />
            <Kpi label="Fuel Consumed" value={formatNumber(report.fuelConsumedL)} unit="L" />
            <Kpi label="Avg CO₂ Rate" value={formatNumber(report.averageRates?.co2Kgh ?? 0)} unit="kg/h" status={rateStatus(report.averageRates?.co2Kgh ?? 0, 45)} />
            <Kpi label="Carbon Intensity" value={formatNumber(report.carbonIntensityKgPerL, 3)} unit="kg/L" />
          </section>

          {report.reportInsights && report.reportInsights.length > 0 && (
            <section className="report-section">
              <h3>Key Findings</h3>
              <div className="report-insights">
                {report.reportInsights.map((insight) => (
                  <article key={insight.id} className={`report-insight report-insight--${insight.status}`}>
                    <StatusBadge status={insight.status} label={insight.status} />
                    <div>
                      <strong>{insight.title}</strong>
                      <p>{insight.message}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {report.industryComparisons && report.industryComparisons.length > 0 && (
            <section className="report-section">
              <div className="report-section__heading">
                <h3>Industry Standards & Similar Vessels</h3>
                <span>{report.benchmarkContext?.similarVesselLabel}</span>
              </div>
              <div className="comparison-grid">
                {report.industryComparisons.map((metric) => (
                  <ComparisonBar key={metric.id} metric={metric} />
                ))}
              </div>
              {report.benchmarkContext?.standardsNote && (
                <p className="report-note">{report.benchmarkContext.standardsNote}</p>
              )}
            </section>
          )}

          {report.hourlySeries && report.hourlySeries.length > 0 && (
            <section className="report-section">
              <div className="report-section__heading">
                <h3>Hourly Emissions Profile</h3>
                <span>{report.hourlySeries.length} samples</span>
              </div>
              <HourlyChart points={report.hourlySeries} />
            </section>
          )}

          {report.co2ImpactFacts && report.co2ImpactFacts.length > 0 && (
            <section className="report-section">
              <h3>CO₂ Impact</h3>
              <div className="impact-grid">
                {report.co2ImpactFacts.map((fact) => (
                  <article key={fact.id} className={`impact-fact impact-fact--${fact.status}`}>
                    <div className="impact-fact__topline">
                      <span>{fact.label}</span>
                      <StatusBadge status={fact.status} label={fact.status} />
                    </div>
                    <strong>
                      {formatNumber(fact.value, fact.value < 10 ? 2 : 1)} {fact.unit}
                    </strong>
                    <p>{fact.summary}</p>
                    <a href={fact.sourceUrl} target="_blank" rel="noreferrer">
                      {fact.sourceTitle}
                    </a>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="report-section">
            <h3>Report Details</h3>
            <div className="report-panel__summary">
              <ReportRow label="Vessel ID" value={report.vesselId} />
              <ReportRow label="Generated" value={formatDate(report.generatedAt)} />
              <ReportRow label="Fuel Type" value={report.fuelType} />
              <ReportRow label="Water Usage" value={`${formatNumber(report.waterUsageL)} L`} />
              <ReportRow label="Generator Current (avg)" value={`${formatNumber(report.generatorCurrentAvgA)} A`} />
              <ReportRow label="Temperature (avg)" value={`${formatNumber(report.avgTemperatureC)} °C`} />
              <ReportRow
                label="Validation Sources"
                value={String(report.validationSources?.length ?? 0)}
              />
              <ReportRow
                label="Non-Compliant Periods"
                value={String(report.nonCompliantPeriods.length)}
                highlight={report.nonCompliantPeriods.length > 0}
              />
            </div>
          </section>

          {report.nonCompliantPeriods.length > 0 && (
            <section className="report-panel__violations">
              <h3>Non-Compliant Periods</h3>
              {report.nonCompliantPeriods.map((p, i) => (
                <div key={`${p.start}-${p.reason}-${i}`} className="report-panel__violation">
                  <StatusBadge status="warning" label={p.reason} />
                  <span>{formatDate(p.start)} — {formatDate(p.end)}</span>
                  <span>Value: {p.value.toFixed(2)} / Threshold: {p.threshold}</span>
                </div>
              ))}
            </section>
          )}

          {report.validationSources && report.validationSources.length > 0 && (
            <section className="report-panel__sources">
              <h3>Sources</h3>
              {report.validationSources.map((source) => (
                <div key={source.id} className="report-panel__source">
                  <StatusBadge status={sourceSeverity(source.status)} label={source.status} />
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                </div>
              ))}
            </section>
          )}

          <div className="report-panel__downloads">
            <button onClick={downloadCSV}>Download CSV</button>
            <button onClick={downloadPDF}>Download PDF</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  status = "compliant",
}: {
  label: string;
  value: string;
  unit: string;
  status?: Severity;
}) {
  return (
    <div className={`report-kpi report-kpi--${status}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{unit}</em>
    </div>
  );
}

function ComparisonBar({ metric }: { metric: ComparisonMetric }) {
  const percent = Math.min(Math.max(metric.ratio * 100, 0), 160);
  const deltaLabel = metric.deltaPct === 0 ? "on target" : `${metric.deltaPct > 0 ? "+" : ""}${metric.deltaPct}%`;

  return (
    <article className={`comparison-metric comparison-metric--${metric.status}`}>
      <div className="comparison-metric__header">
        <span>{metric.label}</span>
        <StatusBadge status={metric.status} label={metric.status} />
      </div>
      <div className="comparison-metric__value">
        <strong>
          {formatNumber(metric.value, metric.value < 10 ? 2 : 1)} {metric.unit}
        </strong>
        <span>
          vs {formatNumber(metric.benchmark, metric.benchmark < 10 ? 2 : 1)} {metric.unit}
        </span>
      </div>
      <div className="comparison-metric__track" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="comparison-metric__footer">
        <span>{metric.benchmarkLabel}</span>
        <strong>{deltaLabel}</strong>
      </div>
      <p>{metric.detail}</p>
    </article>
  );
}

function HourlyChart({ points }: { points: HourlySeriesPoint[] }) {
  const maxFuel = Math.max(1, ...points.map((point) => point.fuelRateLh));
  const maxCo2 = Math.max(1, ...points.map((point) => point.co2RateKgh));
  const fuelPoints = toPolyline(points.map((point) => point.fuelRateLh), maxFuel);
  const co2Points = toPolyline(points.map((point) => point.co2RateKgh), maxCo2);

  return (
    <div className="report-chart">
      <svg viewBox="0 0 100 44" role="img" aria-label="Hourly fuel and CO2 trend">
        <line x1="0" y1="38" x2="100" y2="38" />
        <line x1="0" y1="20" x2="100" y2="20" />
        <polyline points={fuelPoints} className="report-chart__fuel" />
        <polyline points={co2Points} className="report-chart__co2" />
        {points.map((point, index) => {
          const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 100;
          return (
            <circle
              key={`${point.start}-${point.status}`}
              cx={x}
              cy={40 - (point.co2RateKgh / maxCo2) * 34}
              r="1.1"
              className={`report-chart__point report-chart__point--${point.status}`}
            />
          );
        })}
      </svg>
      <div className="report-chart__legend">
        <span className="report-chart__legend-fuel">Fuel L/h</span>
        <span className="report-chart__legend-co2">CO₂ kg/h</span>
        <span>{points[0]?.label} — {points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function toPolyline(values: number[], max: number): string {
  if (values.length === 0) return "";

  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 40 - (value / max) * 34;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function StatusBadge({ status, label }: { status: Severity; label: string }) {
  return <span className={`badge badge--${status}`}>{label}</span>;
}

function ReportRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`report-row${highlight ? " report-row--highlight" : ""}`}>
      <span className="report-row__label">{label}</span>
      <span className="report-row__value">{value}</span>
    </div>
  );
}

function rateStatus(value: number, threshold: number): Severity {
  if (value > threshold) return "warning";
  if (value >= threshold * 0.85) return "watch";
  return "compliant";
}

function sourceSeverity(status: string): Severity {
  if (status === "verified") return "compliant";
  if (status === "error" || status === "unavailable") return "warning";
  return "watch";
}

function formatNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value > 0 && value < 1 ? Math.min(digits, 2) : 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
