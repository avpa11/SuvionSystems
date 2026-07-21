"use client";

import { useState } from "react";
import { SensorCogWidget } from "../components/SensorCogWidget";
import { EmissionsWidget } from "../components/EmissionsWidget";
import { CompassWidget } from "../components/CompassWidget";
import { WindGaugeWidget } from "../components/WindGaugeWidget";
import { PositionWidget } from "../components/PositionWidget";
import { DateRangePicker } from "../components/DateRangePicker";
import { AnomalyPanel } from "../components/AnomalyPanel";
import { IntegrationPanel } from "../components/IntegrationPanel";
import { WeatherPanel } from "../components/WeatherPanel";
import { AgentChatPopup } from "../components/AgentChatPopup";
import { useSensorData } from "../hooks/useSensorData";

type Category = "vessel" | "environment" | "navigation" | "electrical";

const CATEGORY_LABELS: Record<Category, string> = {
  vessel:      "VESSEL",
  environment: "ENVIRONMENT",
  navigation:  "NAVIGATION",
  electrical:  "ELECTRICAL",
};

export default function Dashboard() {
  const { sensorState, histories, anomalies, connected, setFuelType } = useSensorData();
  const [visibleCats, setVisibleCats] = useState<Set<Category>>(
    new Set<Category>(["vessel", "environment", "navigation"])
  );

  function toggleCat(cat: Category) {
    setVisibleCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  const show = (cat: Category) => visibleCats.has(cat);
  const hasVesselData = Boolean(
    sensorState.fuel ||
      sensorState.generator ||
      sensorState.water ||
      sensorState.waterLevel ||
      sensorState.temperature ||
      sensorState.co2
  );
  const hasEnvironmentData = Boolean(
    sensorState.depthBelowKeel ||
      sensorState.depthBelowTransducer ||
      sensorState.waterTemp ||
      sensorState.windAngle ||
      sensorState.windSpeed
  );
  const hasNavigationData = Boolean(
    sensorState.heading ||
      sensorState.positionLat ||
      sensorState.positionLon ||
      sensorState.cog ||
      sensorState.sog ||
      sensorState.stw ||
      sensorState.magVariation ||
      sensorState.navLog ||
      sensorState.tripLog ||
      sensorState.gnssSatellites ||
      sensorState.gnssDilution ||
      sensorState.gnssAltitude
  );
  const hasElectricalData = Boolean(
    sensorState.battVoltage ||
      sensorState.battCurrent ||
      sensorState.battTemp ||
      sensorState.battTimeRemaining
  );

  return (
    <main className="dashboard">
      <header className="dashboard__header">
        <h1 className="dashboard__title">SUVION SYSTEMS</h1>
        <p className="dashboard__subtitle">Environmental Monitoring &amp; Sustainability</p>
        <div className={`connection-badge ${connected ? "connection-badge--online" : "connection-badge--offline"}`}>
          {connected ? "● LIVE" : "○ OFFLINE"}
        </div>
      </header>

      <AnomalyPanel anomalies={anomalies} />

      {/* Category filter */}
      <div className="dashboard__filters" role="group" aria-label="Category filter">
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
          <button
            key={cat}
            className={`filter-btn ${visibleCats.has(cat) ? "filter-btn--active" : ""}`}
            onClick={() => toggleCat(cat)}
            aria-pressed={visibleCats.has(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* ── VESSEL SENSORS ───────────────────────────────────────────────── */}
      {show("vessel") && hasVesselData && (
        <section className="dashboard__section" aria-label="Vessel sensors">
          <div className="section-label">VESSEL SENSORS</div>
          <div className="dashboard__cogs">
            {sensorState.fuel && <SensorCogWidget label="Fuel Flow"         mnemonic="FUEL" update={sensorState.fuel}        history={histories.fuel}        precision={1} accentColor="#f59e0b" max={24} />}
            {sensorState.generator && <SensorCogWidget label="Generator Current" mnemonic="GEN"  update={sensorState.generator}   history={histories.generator}   precision={1} accentColor="#06b6d4" max={20} />}
            {sensorState.water && <SensorCogWidget label="Water Usage"       mnemonic="H2O"  update={sensorState.water}       history={histories.water}       precision={1} accentColor="#38bdf8" max={30} />}
            {sensorState.waterLevel && <SensorCogWidget label="Water Tank Level"  mnemonic="TANK" update={sensorState.waterLevel}  history={histories.waterLevel}  precision={1} accentColor="#22c55e" max={100} />}
            {sensorState.temperature && <SensorCogWidget label="Temperature"       mnemonic="TEMP" update={sensorState.temperature} history={histories.temperature} precision={1} accentColor="#f97316" min={0} max={40} />}
            {sensorState.co2 && <EmissionsWidget update={sensorState.co2} history={histories.co2} onFuelTypeChange={setFuelType} />}
          </div>
        </section>
      )}

      {/* ── ENVIRONMENT ──────────────────────────────────────────────────── */}
      {show("environment") && hasEnvironmentData && (
        <section className="dashboard__section" aria-label="Environment">
          <div className="section-label">ENVIRONMENT</div>
          <div className="dashboard__cogs dashboard__cogs--compact">
            {sensorState.depthBelowKeel && <SensorCogWidget label="Depth Below Keel"        mnemonic="DBK"  update={sensorState.depthBelowKeel}       history={histories.depthBelowKeel}       precision={2} accentColor="#06b6d4" max={80} />}
            {sensorState.depthBelowTransducer && <SensorCogWidget label="Depth Below Transducer"  mnemonic="DBT"  update={sensorState.depthBelowTransducer} history={histories.depthBelowTransducer} precision={2} accentColor="#0891b2" max={80} />}
            {sensorState.waterTemp && <SensorCogWidget label="Water Temperature"       mnemonic="WTMP" update={sensorState.waterTemp}            history={histories.waterTemp}            precision={1} accentColor="#14b8a6" min={0} max={35} />}
          </div>
          {(sensorState.windAngle || sensorState.windSpeed) && (
            <div className="dashboard__nav">
              <WindGaugeWidget
                angle={sensorState.windAngle?.value ?? null}
                speed={sensorState.windSpeed?.value ?? null}
              />
            </div>
          )}
        </section>
      )}

      {/* ── NAVIGATION ───────────────────────────────────────────────────── */}
      {show("navigation") && hasNavigationData && (
        <section className="dashboard__section" aria-label="Navigation">
          <div className="section-label">NAVIGATION</div>
          {(sensorState.heading || (sensorState.positionLat && sensorState.positionLon)) && (
            <div className="dashboard__nav">
              {sensorState.heading && <CompassWidget heading={sensorState.heading.value} />}
              {sensorState.positionLat && sensorState.positionLon && (
                <PositionWidget
                  lat={sensorState.positionLat.value}
                  lon={sensorState.positionLon.value}
                />
              )}
            </div>
          )}
          <div className="dashboard__cogs">
            {sensorState.cog && <SensorCogWidget label="Course Over Ground"   mnemonic="COG"  update={sensorState.cog}            history={histories.cog}            precision={1} accentColor="#818cf8" max={360} />}
            {sensorState.sog && <SensorCogWidget label="Speed Over Ground"    mnemonic="SOG"  update={sensorState.sog}            history={histories.sog}            precision={2} accentColor="#22c55e" max={16} />}
            {sensorState.stw && <SensorCogWidget label="Speed Thru Water"     mnemonic="STW"  update={sensorState.stw}            history={histories.stw}            precision={2} accentColor="#14b8a6" max={16} />}
            {sensorState.magVariation && <SensorCogWidget label="Magnetic Variation"   mnemonic="VAR"  update={sensorState.magVariation}   history={histories.magVariation}   precision={1} accentColor="#f97316" min={-30} max={30} />}
            {sensorState.navLog && <SensorCogWidget label="Total Log"            mnemonic="LOG"  update={sensorState.navLog}         history={histories.navLog}         precision={1} accentColor="#a855f7" min={1200} max={1400} />}
            {sensorState.tripLog && <SensorCogWidget label="Trip Log"             mnemonic="TRIP" update={sensorState.tripLog}        history={histories.tripLog}        precision={2} accentColor="#ec4899" max={20} />}
            {sensorState.gnssSatellites && <SensorCogWidget label="GNSS Satellites"      mnemonic="SAT"  update={sensorState.gnssSatellites} history={histories.gnssSatellites} precision={0} accentColor="#84cc16" max={18} />}
            {sensorState.gnssDilution && <SensorCogWidget label="Horiz Dilution"       mnemonic="HDOP" update={sensorState.gnssDilution}   history={histories.gnssDilution}   precision={2} accentColor="#f59e0b" max={3} />}
            {sensorState.gnssAltitude && <SensorCogWidget label="GNSS Altitude"        mnemonic="ALT"  update={sensorState.gnssAltitude}   history={histories.gnssAltitude}   precision={1} accentColor="#38bdf8" max={30} />}
          </div>
        </section>
      )}

      {/* ── ELECTRICAL ───────────────────────────────────────────────────── */}
      {show("electrical") && hasElectricalData && (
        <section className="dashboard__section" aria-label="Electrical">
          <div className="section-label">ELECTRICAL</div>
          <div className="dashboard__cogs dashboard__cogs--compact">
            {sensorState.battVoltage && <SensorCogWidget label="Battery Voltage"       mnemonic="VBAT" update={sensorState.battVoltage}       history={histories.battVoltage}       precision={2} accentColor="#f59e0b" max={30} />}
            {sensorState.battCurrent && <SensorCogWidget label="Battery Current"       mnemonic="IBAT" update={sensorState.battCurrent}       history={histories.battCurrent}       precision={1} accentColor="#f97316" min={-100} max={100} />}
            {sensorState.battTemp && <SensorCogWidget label="Battery Temperature"   mnemonic="TBAT" update={sensorState.battTemp}          history={histories.battTemp}          precision={1} accentColor="#ef4444" min={0} max={70} />}
            {sensorState.battTimeRemaining && <SensorCogWidget label="Time Remaining"        mnemonic="TIME" update={sensorState.battTimeRemaining} history={histories.battTimeRemaining} precision={1} accentColor="#22c55e" max={24} />}
          </div>
        </section>
      )}

      <WeatherPanel
        vesselLat={sensorState.positionLat?.value ?? null}
        vesselLon={sensorState.positionLon?.value ?? null}
      />

      <IntegrationPanel />

      {/* ── REPORT ───────────────────────────────────────────────────────── */}
      <section className="dashboard__report" aria-label="Sustainability report">
        <DateRangePicker />
      </section>

      <AgentChatPopup sensorState={sensorState} />
    </main>
  );
}
