import { Router, type Request, type Response } from "express";
import * as AjvModule from "ajv";
import type { Ajv as AjvInstance, Options as AjvOptions, Plugin as AjvPlugin } from "ajv";
import _addFormats from "ajv-formats";
import PDFDocument from "pdfkit";

// ajv-formats ships CJS types that lose call signatures under NodeNext ESM interop.
// The function is callable at runtime; this cast restores the type signature.
const addFormats = _addFormats as unknown as AjvPlugin<object>;
import { SensorReading, EmissionsReading } from "../db/mongodb.js";
import {
  carbonIntensity,
  FUEL_TYPES,
  isFuelType,
  NON_COMPLIANT_FUEL_RATE_LH,
  NON_COMPLIANT_CO2_RATE_KGH,
} from "@repo/emissions";
import type { FuelType } from "@repo/emissions";
import { reportSchema } from "../schemas/report-schema.js";
import {
  integrateRateSamples,
  integrateRateSamplesByHour,
  type IntegratedBucket,
  type RateSample,
} from "../services/rateIntegration.js";
import { getValidationSources } from "../services/officialSources.js";
import fs from "fs";
import path from "path";

const router = Router();

const LOG_PATH = path.join(process.cwd(), "reporting-api.log");

const EPA_PASSENGER_VEHICLE_CO2_KG_PER_YEAR = 4_600;
const EPA_GASOLINE_CO2_KG_PER_GALLON = 8.887;
const EPA_DIESEL_CO2_KG_PER_GALLON = 10.18;
const IMO_TOTAL_SHIPPING_GHG_SHARE_2018_PCT = 2.89;

const SIMILAR_VESSEL_BENCHMARKS = {
  label: process.env.REPORT_SIMILAR_VESSEL_LABEL ?? "Comparable 12-18 m diesel workboat target",
  fuelRateLh: Number(process.env.REPORT_SIMILAR_VESSEL_FUEL_RATE_LH ?? 12),
  co2RateKgh: Number(process.env.REPORT_SIMILAR_VESSEL_CO2_RATE_KGH ?? 32),
  waterRateLh: Number(process.env.REPORT_SIMILAR_VESSEL_WATER_RATE_LH ?? 10),
  generatorCurrentA: Number(process.env.REPORT_SIMILAR_VESSEL_GENERATOR_CURRENT_A ?? 8),
};

type AjvConstructor = new (opts?: AjvOptions) => AjvInstance;

const Ajv = AjvModule.default as unknown as AjvConstructor;
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateReport = ajv.compile(reportSchema);

type NonCompliantPeriod = {
  start: string;
  end: string;
  reason: string;
  value: number;
  threshold: number;
};

type SensorDoc = {
  value: number;
  timestamp: Date;
};

type EmissionsDoc = {
  fuelRateLh?: number;
  co2RateKgh?: number;
  consumptionL?: number;
  co2Kg?: number;
  timestamp: Date;
};

type Severity = "compliant" | "watch" | "warning";

type ValidationSourceSummary = {
  id: string;
  title: string;
  url: string;
  fetchedAt: string | null;
  status: string;
  snippet?: string;
};

type ComparisonMetric = {
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
};

type Co2ImpactFact = {
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
};

type ReportInsight = {
  id: string;
  title: string;
  status: Severity;
  message: string;
  sourceId?: string;
};

function appendReportLog(entry: Record<string, unknown>): void {
  const line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(LOG_PATH, line, "utf8");
}

async function sensorSamples(stream: string, start: Date, end: Date): Promise<RateSample[]> {
  const docs = await SensorReading.find(
    { stream, timestamp: { $gte: start, $lte: end } },
    { _id: 0, value: 1, timestamp: 1 }
  )
    .sort({ timestamp: 1 })
    .lean<SensorDoc[]>();

  return docs.map((doc) => ({ value: doc.value, timestamp: new Date(doc.timestamp) }));
}

async function averageSensorValue(stream: string, start: Date, end: Date): Promise<number> {
  const result = await SensorReading.aggregate<{ avg: number }>([
    { $match: { stream, timestamp: { $gte: start, $lte: end } } },
    { $group: { _id: null, avg: { $avg: "$value" } } },
  ]);

  return result[0]?.avg ?? 0;
}

async function emissionsSamples(start: Date, end: Date): Promise<{
  fuelSamples: RateSample[];
  co2Samples: RateSample[];
}> {
  const docs = await EmissionsReading.find(
    { timestamp: { $gte: start, $lte: end } },
    {
      _id: 0,
      fuelRateLh: 1,
      co2RateKgh: 1,
      consumptionL: 1,
      co2Kg: 1,
      timestamp: 1,
    }
  )
    .sort({ timestamp: 1 })
    .lean<EmissionsDoc[]>();

  return {
    fuelSamples: docs.map((doc) => ({
      value: doc.fuelRateLh ?? doc.consumptionL ?? 0,
      timestamp: new Date(doc.timestamp),
    })),
    co2Samples: docs.map((doc) => ({
      value: doc.co2RateKgh ?? doc.co2Kg ?? 0,
      timestamp: new Date(doc.timestamp),
    })),
  };
}

function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function ratio(value: number, benchmark: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(benchmark) || benchmark <= 0) return 0;
  return value / benchmark;
}

function thresholdStatus(
  value: number,
  benchmark: number,
  options: { watchRatio?: number; warningRatio?: number } = {}
): Severity {
  const valueRatio = ratio(value, benchmark);
  const watchRatio = options.watchRatio ?? 0.85;
  const warningRatio = options.warningRatio ?? 1;

  if (valueRatio > warningRatio) return "warning";
  if (valueRatio >= watchRatio) return "watch";
  return "compliant";
}

function deviationStatus(value: number, benchmark: number): Severity {
  const valueRatio = ratio(value, benchmark);
  const deviation = Math.abs(1 - valueRatio);

  if (deviation > 0.05) return "warning";
  if (deviation > 0.02) return "watch";
  return "compliant";
}

function buildComparisonMetric(input: {
  id: string;
  label: string;
  category: ComparisonMetric["category"];
  value: number;
  unit: string;
  benchmark: number;
  benchmarkLabel: string;
  status: Severity;
  detail: string;
  sourceId?: string;
}): ComparisonMetric {
  const valueRatio = ratio(input.value, input.benchmark);

  return {
    ...input,
    value: round(input.value, 3),
    benchmark: round(input.benchmark, 3),
    ratio: round(valueRatio, 3),
    deltaPct: round((valueRatio - 1) * 100, 1),
  };
}

function worstStatus(statuses: Severity[]): Severity {
  if (statuses.includes("warning")) return "warning";
  if (statuses.includes("watch")) return "watch";
  return "compliant";
}

function averageRate(total: number, observedSeconds: number): number {
  return observedSeconds > 0 ? total / (observedSeconds / 3600) : 0;
}

function sourceById(
  sources: ValidationSourceSummary[],
  id: string
): ValidationSourceSummary | undefined {
  return sources.find((source) => source.id === id);
}

function buildImpactFact(input: {
  id: string;
  label: string;
  value: number;
  unit: string;
  status: Severity;
  summary: string;
  method: string;
  sourceId: string;
  sources: ValidationSourceSummary[];
}): Co2ImpactFact {
  const source = sourceById(input.sources, input.sourceId);

  return {
    id: input.id,
    label: input.label,
    value: round(input.value, 2),
    unit: input.unit,
    status: input.status,
    summary: input.summary,
    method: input.method,
    sourceId: input.sourceId,
    sourceTitle: source?.title ?? input.sourceId,
    sourceUrl: source?.url ?? "",
    ...(source?.status ? { sourceStatus: source.status } : {}),
    ...(source?.snippet ? { sourceSnippet: source.snippet } : {}),
  };
}

function buildCo2ImpactFacts(
  totalCo2Kg: number,
  sources: ValidationSourceSummary[]
): Co2ImpactFact[] {
  const passengerVehicleYears = totalCo2Kg / EPA_PASSENGER_VEHICLE_CO2_KG_PER_YEAR;
  const gasolineGallons = totalCo2Kg / EPA_GASOLINE_CO2_KG_PER_GALLON;
  const dieselGallons = totalCo2Kg / EPA_DIESEL_CO2_KG_PER_GALLON;

  return [
    buildImpactFact({
      id: "passenger-vehicle-years",
      label: "Passenger vehicle-years",
      value: passengerVehicleYears,
      unit: "vehicle-years",
      status: passengerVehicleYears >= 0.1 ? "warning" : passengerVehicleYears > 0 ? "watch" : "compliant",
      summary: `${round(totalCo2Kg, 1)} kg CO2 is about ${round(
        passengerVehicleYears,
        2
      )} years of tailpipe CO2 from a typical passenger vehicle.`,
      method: "Report CO2 kg / 4,600 kg CO2 per passenger vehicle-year.",
      sourceId: "epa-passenger-vehicle-co2",
      sources,
    }),
    buildImpactFact({
      id: "gasoline-gallon-equivalent",
      label: "Gasoline CO2 equivalent",
      value: gasolineGallons,
      unit: "gal",
      status: gasolineGallons >= 50 ? "warning" : gasolineGallons > 0 ? "watch" : "compliant",
      summary: `The same CO2 mass is comparable to burning ${round(
        gasolineGallons,
        1
      )} gallons of gasoline.`,
      method: "Report CO2 kg / 8.887 kg CO2 per gallon gasoline.",
      sourceId: "epa-ghg-equivalencies",
      sources,
    }),
    buildImpactFact({
      id: "diesel-gallon-equivalent",
      label: "Road-diesel CO2 equivalent",
      value: dieselGallons,
      unit: "gal",
      status: dieselGallons >= 45 ? "warning" : dieselGallons > 0 ? "watch" : "compliant",
      summary: `For road-diesel context, this is comparable to burning ${round(
        dieselGallons,
        1
      )} gallons of diesel.`,
      method: "Report CO2 kg / 10.180 kg CO2 per gallon diesel.",
      sourceId: "epa-ghg-equivalencies",
      sources,
    }),
    buildImpactFact({
      id: "global-shipping-context",
      label: "Shipping emissions context",
      value: IMO_TOTAL_SHIPPING_GHG_SHARE_2018_PCT,
      unit: "% global GHG",
      status: "watch",
      summary:
        "IMO context: total shipping was 2.89% of global anthropogenic GHG emissions in 2018, so vessel-level reductions compound across a large sector.",
      method: "Context fact from the IMO Fourth Greenhouse Gas Study 2020.",
      sourceId: "imo-fourth-ghg-study",
      sources,
    }),
  ];
}

function buildComparisons(input: {
  avgFuelRateLh: number;
  avgCo2RateKgh: number;
  avgWaterRateLh: number;
  avgGenA: number;
  intensityKgPerL: number;
  fuelType: FuelType;
}): ComparisonMetric[] {
  const fuelFactorBenchmark = carbonIntensity(input.fuelType);

  return [
    buildComparisonMetric({
      id: "fuel-rate-threshold",
      label: "Avg fuel rate",
      category: "industry",
      value: input.avgFuelRateLh,
      unit: "L/h",
      benchmark: NON_COMPLIANT_FUEL_RATE_LH,
      benchmarkLabel: "Operational threshold",
      status: thresholdStatus(input.avgFuelRateLh, NON_COMPLIANT_FUEL_RATE_LH),
      detail: "Compares observed fuel burn against the configured hourly non-compliance threshold.",
      sourceId: "imo-cii-g1",
    }),
    buildComparisonMetric({
      id: "co2-rate-threshold",
      label: "Avg CO2 rate",
      category: "industry",
      value: input.avgCo2RateKgh,
      unit: "kg/h",
      benchmark: NON_COMPLIANT_CO2_RATE_KGH,
      benchmarkLabel: "Operational threshold",
      status: thresholdStatus(input.avgCo2RateKgh, NON_COMPLIANT_CO2_RATE_KGH),
      detail: "Compares observed CO2 rate against the configured hourly non-compliance threshold.",
      sourceId: "imo-cii-g1",
    }),
    buildComparisonMetric({
      id: "fuel-factor-alignment",
      label: "CO2 per litre",
      category: "calculation",
      value: input.intensityKgPerL,
      unit: "kg/L",
      benchmark: fuelFactorBenchmark,
      benchmarkLabel: `${input.fuelType} fuel factor`,
      status: deviationStatus(input.intensityKgPerL, fuelFactorBenchmark),
      detail: "Checks measured carbon intensity against the selected fuel conversion factor.",
      sourceId: "imo-eedi-cf",
    }),
    buildComparisonMetric({
      id: "similar-vessel-fuel",
      label: "Fuel vs similar vessel",
      category: "similar_vessel",
      value: input.avgFuelRateLh,
      unit: "L/h",
      benchmark: SIMILAR_VESSEL_BENCHMARKS.fuelRateLh,
      benchmarkLabel: SIMILAR_VESSEL_BENCHMARKS.label,
      status: thresholdStatus(input.avgFuelRateLh, SIMILAR_VESSEL_BENCHMARKS.fuelRateLh, {
        watchRatio: 1,
        warningRatio: 1.15,
      }),
      detail: "Compares average fuel burn with the configured comparable-vessel operating target.",
    }),
    buildComparisonMetric({
      id: "similar-vessel-co2",
      label: "CO2 vs similar vessel",
      category: "similar_vessel",
      value: input.avgCo2RateKgh,
      unit: "kg/h",
      benchmark: SIMILAR_VESSEL_BENCHMARKS.co2RateKgh,
      benchmarkLabel: SIMILAR_VESSEL_BENCHMARKS.label,
      status: thresholdStatus(input.avgCo2RateKgh, SIMILAR_VESSEL_BENCHMARKS.co2RateKgh, {
        watchRatio: 1,
        warningRatio: 1.15,
      }),
      detail: "Compares average CO2 rate with the configured comparable-vessel operating target.",
    }),
    buildComparisonMetric({
      id: "similar-vessel-water",
      label: "Water use vs similar vessel",
      category: "similar_vessel",
      value: input.avgWaterRateLh,
      unit: "L/h",
      benchmark: SIMILAR_VESSEL_BENCHMARKS.waterRateLh,
      benchmarkLabel: SIMILAR_VESSEL_BENCHMARKS.label,
      status: thresholdStatus(input.avgWaterRateLh, SIMILAR_VESSEL_BENCHMARKS.waterRateLh, {
        watchRatio: 1,
        warningRatio: 1.25,
      }),
      detail: "Compares water usage against the configured comparable-vessel target.",
    }),
    buildComparisonMetric({
      id: "similar-vessel-generator",
      label: "Generator load vs similar vessel",
      category: "similar_vessel",
      value: input.avgGenA,
      unit: "A",
      benchmark: SIMILAR_VESSEL_BENCHMARKS.generatorCurrentA,
      benchmarkLabel: SIMILAR_VESSEL_BENCHMARKS.label,
      status: thresholdStatus(input.avgGenA, SIMILAR_VESSEL_BENCHMARKS.generatorCurrentA, {
        watchRatio: 1,
        warningRatio: 1.2,
      }),
      detail: "Compares average generator current with the configured comparable-vessel target.",
    }),
  ];
}

function buildHourlySeries(
  hourlyFuel: IntegratedBucket[],
  hourlyCo2: IntegratedBucket[]
): Array<{
  start: string;
  end: string;
  label: string;
  fuelRateLh: number;
  co2RateKgh: number;
  status: Severity;
}> {
  const co2ByHour = new Map(hourlyCo2.map((row) => [row.start.toISOString(), row]));

  return hourlyFuel.map((fuelRow) => {
    const co2Row = co2ByHour.get(fuelRow.start.toISOString());
    const fuelStatus = thresholdStatus(fuelRow.averageRate, NON_COMPLIANT_FUEL_RATE_LH);
    const co2Status = thresholdStatus(co2Row?.averageRate ?? 0, NON_COMPLIANT_CO2_RATE_KGH);

    return {
      start: fuelRow.start.toISOString(),
      end: fuelRow.end.toISOString(),
      label: fuelRow.start.toISOString().slice(11, 16),
      fuelRateLh: round(fuelRow.averageRate, 2),
      co2RateKgh: round(co2Row?.averageRate ?? 0, 2),
      status: worstStatus([fuelStatus, co2Status]),
    };
  });
}

function buildInsights(input: {
  summaryStatus: Severity;
  nonCompliantCount: number;
  avgFuelRateLh: number;
  avgCo2RateKgh: number;
  co2ImpactFacts: Co2ImpactFact[];
}): ReportInsight[] {
  const topImpact = input.co2ImpactFacts.find((fact) => fact.id === "passenger-vehicle-years");

  return [
    {
      id: "operating-status",
      title: "Operating status",
      status: input.summaryStatus,
      message:
        input.nonCompliantCount > 0
          ? `${input.nonCompliantCount} hourly checks exceeded fuel or CO2 thresholds. Prioritize load trimming, speed review, and generator duty-cycle checks.`
          : "No hourly fuel or CO2 threshold breaches were detected in this report period.",
      sourceId: "imo-cii-g1",
    },
    {
      id: "co2-impact",
      title: "CO2 impact",
      status: topImpact?.status ?? "compliant",
      message:
        topImpact?.summary ??
        "No CO2 impact equivalence is available because this report period has no observed CO2 emissions.",
      ...(topImpact?.sourceId ? { sourceId: topImpact.sourceId } : {}),
    },
    {
      id: "regulatory-readiness",
      title: "Regulatory readiness",
      status: "watch",
      message:
        "CII-style rating needs distance, cargo/deadweight, and transport-work data. This report compares fuel and CO2 operating rates until voyage metadata is configured.",
      sourceId: "imo-cii-g1",
    },
    {
      id: "rate-profile",
      title: "Rate profile",
      status: thresholdStatus(input.avgCo2RateKgh, NON_COMPLIANT_CO2_RATE_KGH),
      message: `Average fuel burn was ${round(input.avgFuelRateLh, 2)} L/h and average CO2 rate was ${round(
        input.avgCo2RateKgh,
        2
      )} kg/h over observed samples.`,
      sourceId: "imo-eedi-cf",
    },
  ];
}

function detectNonCompliantPeriods(hourlyFuel: IntegratedBucket[], hourlyCo2: IntegratedBucket[]): NonCompliantPeriod[] {
  const periods: NonCompliantPeriod[] = [];
  const co2ByHour = new Map(hourlyCo2.map((row) => [row.start.toISOString(), row]));

  for (const fuelRow of hourlyFuel) {
    const co2Row = co2ByHour.get(fuelRow.start.toISOString());

    // A window can breach both thresholds independently; record each so the
    // compliance report never masks a CO₂ violation behind a fuel violation.
    if (fuelRow.averageRate > NON_COMPLIANT_FUEL_RATE_LH) {
      periods.push({
        start: fuelRow.start.toISOString(),
        end: fuelRow.end.toISOString(),
        reason: "HIGH_FUEL_USAGE",
        value: fuelRow.averageRate,
        threshold: NON_COMPLIANT_FUEL_RATE_LH,
      });
    }

    if (co2Row && co2Row.averageRate > NON_COMPLIANT_CO2_RATE_KGH) {
      periods.push({
        start: co2Row.start.toISOString(),
        end: co2Row.end.toISOString(),
        reason: "HIGH_CO2",
        value: co2Row.averageRate,
        threshold: NON_COMPLIANT_CO2_RATE_KGH,
      });
    }
  }

  return periods;
}

async function buildReport(
  startDate: Date,
  endDate: Date,
  fuelType: FuelType = "diesel"
): Promise<Record<string, unknown>> {
  const [fuelSamples, waterSamples, avgGenA, avgTempC, emissions] = await Promise.all([
    sensorSamples("fuel", startDate, endDate),
    sensorSamples("water", startDate, endDate),
    averageSensorValue("generator", startDate, endDate),
    averageSensorValue("temperature", startDate, endDate),
    emissionsSamples(startDate, endDate),
  ]);

  const fuelIntegration = integrateRateSamples(fuelSamples, startDate, endDate);
  const waterIntegration = integrateRateSamples(waterSamples, startDate, endDate);
  const co2Integration = integrateRateSamples(emissions.co2Samples, startDate, endDate);
  const hourlyFuel = integrateRateSamplesByHour(fuelSamples, startDate, endDate);
  const hourlyCo2 = integrateRateSamplesByHour(emissions.co2Samples, startDate, endDate);

  const totalFuelL = fuelIntegration.total;
  const totalWaterL = waterIntegration.total;
  const totalCo2Kg = co2Integration.total;
  const avgFuelRateLh = averageRate(totalFuelL, fuelIntegration.observedSeconds);
  const avgWaterRateLh = averageRate(totalWaterL, waterIntegration.observedSeconds);
  const avgCo2RateKgh = averageRate(totalCo2Kg, co2Integration.observedSeconds);
  const intensityKgPerL = totalFuelL > 0 ? totalCo2Kg / totalFuelL : carbonIntensity(fuelType);
  const nonCompliantPeriods = detectNonCompliantPeriods(hourlyFuel, hourlyCo2);
  const validationSources = getValidationSources().sources.map(({ id, title, url, fetchedAt, status, snippet }) => ({
    id,
    title,
    url,
    fetchedAt,
    status,
    ...(snippet ? { snippet } : {}),
  }));
  const industryComparisons = buildComparisons({
    avgFuelRateLh,
    avgCo2RateKgh,
    avgWaterRateLh,
    avgGenA,
    intensityKgPerL,
    fuelType,
  });
  const hourlySeries = buildHourlySeries(hourlyFuel, hourlyCo2);
  const summaryStatus = worstStatus([
    nonCompliantPeriods.length > 0 ? "warning" : "compliant",
    ...industryComparisons.map((comparison) => comparison.status),
  ]);
  const co2ImpactFacts = buildCo2ImpactFacts(totalCo2Kg, validationSources);
  const reportInsights = buildInsights({
    summaryStatus,
    nonCompliantCount: nonCompliantPeriods.length,
    avgFuelRateLh,
    avgCo2RateKgh,
    co2ImpactFacts,
  });

  const report = {
    vesselId: process.env.VESSEL_ID ?? "DEMO-VESSEL-001",
    reportPeriodStart: startDate.toISOString(),
    reportPeriodEnd: endDate.toISOString(),
    generatedAt: new Date().toISOString(),
    summaryStatus,
    fuelType,
    fuelConsumedL: Math.round(totalFuelL * 100) / 100,
    co2EmittedKg: Math.round(totalCo2Kg * 100) / 100,
    waterUsageL: Math.round(totalWaterL * 100) / 100,
    generatorCurrentAvgA: Math.round(avgGenA * 100) / 100,
    avgTemperatureC: Math.round(avgTempC * 100) / 100,
    carbonIntensityKgPerL: Math.round(intensityKgPerL * 10000) / 10000,
    averageRates: {
      fuelLh: round(avgFuelRateLh, 2),
      co2Kgh: round(avgCo2RateKgh, 2),
      waterLh: round(avgWaterRateLh, 2),
    },
    benchmarkContext: {
      similarVesselLabel: SIMILAR_VESSEL_BENCHMARKS.label,
      similarVesselBenchmarks: {
        fuelRateLh: SIMILAR_VESSEL_BENCHMARKS.fuelRateLh,
        co2RateKgh: SIMILAR_VESSEL_BENCHMARKS.co2RateKgh,
        waterRateLh: SIMILAR_VESSEL_BENCHMARKS.waterRateLh,
        generatorCurrentA: SIMILAR_VESSEL_BENCHMARKS.generatorCurrentA,
      },
      standardsNote:
        "IMO CII/EEXI certification needs distance, transport work, and vessel particulars. This report compares observed fuel and CO2 rates against configured operational thresholds and fuel-factor references.",
    },
    calculationBasis: {
      fuel: "Fuel and water readings are rates in L/h integrated over observed sample intervals.",
      emissions: "CO2 readings are kg/h integrated over observed sample intervals.",
      compliance: "Non-compliant periods compare hourly average rates against configured thresholds.",
      observedSeconds: {
        fuel: Math.round(fuelIntegration.observedSeconds),
        water: Math.round(waterIntegration.observedSeconds),
        co2: Math.round(co2Integration.observedSeconds),
      },
    },
    validationSources,
    industryComparisons,
    hourlySeries,
    co2ImpactFacts,
    reportInsights,
    nonCompliantPeriods,
  };

  return report;
}

function reportToCSV(report: Record<string, unknown>): string {
  const periods = report.nonCompliantPeriods as NonCompliantPeriod[];
  const comparisons = (report.industryComparisons ?? []) as ComparisonMetric[];
  const impactFacts = (report.co2ImpactFacts ?? []) as Co2ImpactFact[];
  const insights = (report.reportInsights ?? []) as ReportInsight[];
  const rows: string[][] = [
    ["Field", "Value"],
    ["Vessel ID", String(report.vesselId)],
    ["Report Period Start", String(report.reportPeriodStart)],
    ["Report Period End", String(report.reportPeriodEnd)],
    ["Generated At", String(report.generatedAt)],
    ["Overall Status", String(report.summaryStatus)],
    ["Fuel Type", String(report.fuelType)],
    ["Fuel Consumed (L)", String(report.fuelConsumedL)],
    ["CO2 Emitted (kg)", String(report.co2EmittedKg)],
    ["Water Usage (L)", String(report.waterUsageL)],
    ["Generator Current Avg (A)", String(report.generatorCurrentAvgA)],
    ["Avg Temperature (C)", String(report.avgTemperatureC)],
    ["Carbon Intensity (kg CO2/L)", String(report.carbonIntensityKgPerL)],
    ["Calculation Basis", JSON.stringify(report.calculationBasis)],
    ["Validation Sources", JSON.stringify(report.validationSources)],
    ["Non-Compliant Periods", String(periods.length)],
  ];

  insights.forEach((insight, i) => {
    rows.push([`Insight #${i + 1}`, `${insight.status}: ${insight.title} - ${insight.message}`]);
  });

  comparisons.forEach((comparison, i) => {
    rows.push([`Comparison #${i + 1}`, comparison.label]);
    rows.push([`  Comparison #${i + 1} Status`, comparison.status]);
    rows.push([`  Comparison #${i + 1} Value`, `${comparison.value} ${comparison.unit}`]);
    rows.push([
      `  Comparison #${i + 1} Benchmark`,
      `${comparison.benchmark} ${comparison.unit} (${comparison.benchmarkLabel})`,
    ]);
    rows.push([`  Comparison #${i + 1} Delta (%)`, String(comparison.deltaPct)]);
  });

  impactFacts.forEach((fact, i) => {
    rows.push([`CO2 Impact #${i + 1}`, fact.label]);
    rows.push([`  CO2 Impact #${i + 1} Value`, `${fact.value} ${fact.unit}`]);
    rows.push([`  CO2 Impact #${i + 1} Summary`, fact.summary]);
    rows.push([`  CO2 Impact #${i + 1} Source`, `${fact.sourceTitle}: ${fact.sourceUrl}`]);
  });

  periods.forEach((p, i) => {
    rows.push([`  Non-Compliant #${i + 1} Start`, p.start]);
    rows.push([`  Non-Compliant #${i + 1} End`, p.end]);
    rows.push([`  Non-Compliant #${i + 1} Reason`, p.reason]);
    rows.push([`  Non-Compliant #${i + 1} Value`, String(p.value)]);
    rows.push([`  Non-Compliant #${i + 1} Threshold`, String(p.threshold)]);
  });

  return rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function reportToPDF(report: Record<string, unknown>): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const periods = report.nonCompliantPeriods as NonCompliantPeriod[];
  const comparisons = (report.industryComparisons ?? []) as ComparisonMetric[];
  const impactFacts = (report.co2ImpactFacts ?? []) as Co2ImpactFact[];
  const insights = (report.reportInsights ?? []) as ReportInsight[];

  // Header
  doc.fontSize(20).font("Helvetica-Bold").text("Suvion Systems", { align: "center" });
  doc.fontSize(14).font("Helvetica").text("Vessel Sustainability Report", { align: "center" });
  doc.moveDown();

  doc.fontSize(11).font("Helvetica-Bold").text("Calculation Basis");
  doc.font("Helvetica").fontSize(9);
  doc.text("Fuel, water, and CO2 totals are integrated from rate readings over observed sample intervals.");
  doc.text("Hourly non-compliance uses hourly average fuel and CO2 rates.");
  doc.moveDown();

  doc.fontSize(11).font("Helvetica-Bold").text("Validation Sources");
  doc.font("Helvetica").fontSize(8);
  const validationSources = report.validationSources as { title: string; url: string }[] | undefined;
  (validationSources ?? []).forEach((source) => {
    doc.text(`${source.title}: ${source.url}`);
  });
  doc.moveDown();

  // Vessel and period info
  doc.fontSize(11).font("Helvetica-Bold").text("Report Details");
  doc.font("Helvetica").fontSize(10);
  doc.text(`Vessel ID: ${report.vesselId}`);
  doc.text(`Period: ${report.reportPeriodStart} — ${report.reportPeriodEnd}`);
  doc.text(`Generated: ${report.generatedAt}`);
  doc.text(`Overall status: ${String(report.summaryStatus).toUpperCase()}`);
  doc.moveDown();

  doc.fontSize(11).font("Helvetica-Bold").text("Key Insights");
  doc.font("Helvetica").fontSize(9);
  insights.forEach((insight) => {
    doc.text(`${insight.status.toUpperCase()} - ${insight.title}: ${insight.message}`);
  });
  doc.moveDown();

  // Summary table
  doc.fontSize(11).font("Helvetica-Bold").text("Environmental Summary");
  doc.font("Helvetica").fontSize(10);

  const rows: [string, string][] = [
    ["Fuel Type", String(report.fuelType)],
    ["Total Fuel Consumed", `${report.fuelConsumedL} L`],
    ["Total CO₂ Emitted", `${report.co2EmittedKg} kg`],
    ["Total Water Usage", `${report.waterUsageL} L`],
    ["Generator Current (avg)", `${report.generatorCurrentAvgA} A`],
    ["Ambient Temperature (avg)", `${report.avgTemperatureC} °C`],
    ["Carbon Intensity", `${report.carbonIntensityKgPerL} kg CO₂/L`],
  ];

  rows.forEach(([label, value]) => {
    doc.text(`${label}:  ${value}`);
  });

  doc.moveDown();

  doc.fontSize(11).font("Helvetica-Bold").text("Industry and Similar-Vessel Comparisons");
  doc.font("Helvetica").fontSize(8.5);
  comparisons.forEach((comparison) => {
    doc.text(
      `${comparison.status.toUpperCase()} - ${comparison.label}: ${comparison.value} ${comparison.unit} vs ${comparison.benchmark} ${comparison.unit} (${comparison.benchmarkLabel}); delta ${comparison.deltaPct}%`
    );
  });
  doc.moveDown();

  doc.fontSize(11).font("Helvetica-Bold").text("CO2 Impact Facts");
  doc.font("Helvetica").fontSize(8.5);
  impactFacts.forEach((fact) => {
    doc.text(`${fact.label}: ${fact.value} ${fact.unit}. ${fact.summary}`);
    doc.text(`Source: ${fact.sourceTitle} (${fact.sourceUrl})`);
  });
  doc.moveDown();

  // Non-compliant periods
  doc.fontSize(11).font("Helvetica-Bold").text("Non-Compliant Periods");
  doc.font("Helvetica").fontSize(10);

  if (periods.length === 0) {
    doc.text("No non-compliant periods detected.");
  } else {
    periods.forEach((p, i) => {
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").text(`Period ${i + 1}:`);
      doc.font("Helvetica");
      doc.text(`  ${p.start} — ${p.end}`);
      doc.text(`  Reason: ${p.reason}  |  Value: ${p.value.toFixed(2)}  |  Threshold: ${p.threshold}`);
    });
  }

  doc.moveDown();
  doc.fontSize(8).fillColor("grey").text(
    "Generated by Suvion Systems. This report is for informational purposes only and does not constitute a regulatory compliance certification.",
    { align: "center" }
  );

  doc.end();
  return doc;
}

// ─── GET /report ──────────────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  const receiptTime = Date.now();

  const { startDate, endDate, format, fuelType } = req.query as Record<string, string>;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required (ISO 8601 UTC)" });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: "Invalid date format — use ISO 8601 with UTC offset" });
  }

  if (start >= end) {
    return res.status(400).json({ error: "startDate must be before endDate" });
  }

  const resolvedFuelType = fuelType ?? "diesel";
  if (!isFuelType(resolvedFuelType)) {
    return res.status(400).json({
      error: `Invalid fuelType. Expected one of: ${FUEL_TYPES.join(", ")}`,
    });
  }

  try {
    const report = await buildReport(start, end, resolvedFuelType);

    // Schema validation on every response
    const valid = validateReport(report);
    if (!valid) {
      const errors = validateReport.errors;
      appendReportLog({ event: "SCHEMA_INVALID", errors, receiptTime });
      return res.status(500).json({ error: "Report schema validation failed", details: errors });
    }

    const responseTime = Date.now();
    const durationMs = responseTime - receiptTime;

    appendReportLog({
      event: durationMs > 5000 ? "SLOW_REPORT" : "report_generated",
      startDate,
      endDate,
      format: format ?? "json",
      durationMs,
      nonCompliantCount: (report.nonCompliantPeriods as unknown[]).length,
      receiptTime: new Date(receiptTime).toISOString(),
      responseTime: new Date(responseTime).toISOString(),
    });

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="suvion-report-${startDate}-${endDate}.csv"`
      );
      return res.send(reportToCSV(report));
    }

    if (format === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="suvion-report-${startDate}-${endDate}.pdf"`
      );
      const doc = reportToPDF(report);
      doc.pipe(res);
      return;
    }

    return res.json(report);
  } catch (err) {
    appendReportLog({ event: "report_error", error: String(err), receiptTime });
    return res.status(500).json({ error: "Report generation failed", detail: String(err) });
  }
});

export default router;
