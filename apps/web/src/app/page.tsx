"use client";

import { useState } from "react";
import {
  Anchor,
  ArrowDownToLine,
  ArrowUpRight,
  Activity,
  Waves,
  Navigation,
  Zap,
  SlidersHorizontal,
  Radio,
} from "lucide-react";
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
  vessel: "Vessel overview",
  environment: "Environment",
  navigation: "Navigation",
  electrical: "Electrical",
};

export default function Dashboard() {
  const {
    sensorState,
    histories,
    anomalies,
    connected,
    feedStatus,
    lastReadingAt,
    setFuelType,
  } = useSensorData();
  const [category, setCategory] = useState<Category>("vessel");
  const show = (cat: Category) => category === cat;
  const icons = {
    vessel: Activity,
    environment: Waves,
    navigation: Navigation,
    electrical: Zap,
  };
  const hasEnvironmentData = Boolean(
    sensorState.depthBelowKeel ||
    sensorState.depthBelowTransducer ||
    sensorState.waterTemp ||
    sensorState.windAngle ||
    sensorState.windSpeed,
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
    sensorState.gnssAltitude,
  );
  const hasElectricalData = Boolean(
    sensorState.battVoltage ||
    sensorState.battCurrent ||
    sensorState.battTemp ||
    sensorState.battTimeRemaining,
  );

  return (
    <main className="dashboard" id="main-content">
      <header className="dashboard__header">
        <a
          className="brand"
          href="#main-content"
          aria-label="Suvion Systems home"
        >
          <span className="brand__mark">
            <Anchor size={22} />
          </span>
          <span>
            SUVION<span className="brand__sub">SYSTEMS</span>
          </span>
        </a>
        <nav className="header-nav" aria-label="Main navigation">
          <a href="#instruments">Overview</a>
          <a href="#reports">Reports</a>
          <a href="#connections">Connections</a>
        </nav>
        <span className="prototype-label">Research prototype</span>
      </header>

      <section className="dashboard-hero" aria-labelledby="dashboard-heading">
        <div>
          <div className="eyebrow">
            <span /> MARITIME SUSTAINABILITY
          </div>
          <h1 id="dashboard-heading">Your vessel. A clearer picture.</h1>
          <p>
            Monitor your systems, understand your footprint, and turn vessel
            data into useful insights.
          </p>
        </div>
        <a className="primary-link" href="#reports">
          <ArrowDownToLine size={17} /> Create a report
        </a>
      </section>

      <div className="feed-strip" role="status" aria-live="polite">
        <span
          className={`connection-badge connection-badge--${feedStatus === "live" ? "online" : feedStatus === "offline" ? "offline" : "waiting"}`}
        >
          <Radio size={14} />{" "}
          {feedStatus === "live"
            ? "Receiving data"
            : feedStatus === "waiting"
              ? "Waiting for sensors"
              : feedStatus === "stale"
                ? "Sensor feed paused"
                : "API disconnected"}
        </span>
        <span>
          {feedStatus === "live"
            ? "Sensor readings update automatically"
            : feedStatus === "offline"
              ? "Start the API to connect. We’ll retry automatically."
              : feedStatus === "stale"
                ? "No readings for 15 seconds. Check the simulator or your data source."
                : "Connected to the API. Start the simulator to see your instruments."}
        </span>
        {lastReadingAt && (
          <time dateTime={new Date(lastReadingAt).toISOString()}>
            Last received {new Date(lastReadingAt).toLocaleTimeString()}
          </time>
        )}
      </div>

      {feedStatus !== "live" && (
        <details className="getting-started" open={!connected}>
          <summary>
            Get your first readings <ArrowUpRight size={16} />
          </summary>
          <p>
            From the repository root, start the local stack with{" "}
            <code>docker compose up --build -d</code>. It includes MongoDB, the
            API, this dashboard, and a vessel simulator. For a native setup, run{" "}
            <code>python3 simulation/nmea_generator.py</code> after starting
            MongoDB and the API.
          </p>
          <p>
            Missing values appear as a dash, never as zero consumption. Old
            readings expire after 15 seconds.
          </p>
        </details>
      )}

      <div className="instrument-heading" id="instruments">
        <div>
          <span className="eyebrow">LIVE INSTRUMENTS</span>
          <h2>Onboard overview</h2>
        </div>
        <span>
          <SlidersHorizontal size={15} /> Choose a system
        </span>
      </div>
      <div
        className="dashboard__filters"
        role="group"
        aria-label="Choose a system"
      >
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => {
          const Icon = icons[cat];
          return (
            <button
              key={cat}
              className={`filter-btn ${category === cat ? "filter-btn--active" : ""}`}
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
            >
              <Icon size={16} />
              {CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>
      {category !== "vessel" &&
        !{
          environment: hasEnvironmentData,
          navigation: hasNavigationData,
          electrical: hasElectricalData,
        }[category] && (
          <div className="system-empty">
            <Waves size={28} />
            <h3>No {CATEGORY_LABELS[category].toLowerCase()} readings yet</h3>
            <p>
              Instruments will appear when this system sends data. Electrical
              readings require a configured Signal K source.
            </p>
          </div>
        )}

      {/* ── VESSEL SENSORS ───────────────────────────────────────────────── */}
      {show("vessel") && (
        <section className="dashboard__section" aria-label="Vessel sensors">
          <div className="section-label">VESSEL SENSORS</div>
          <div className="dashboard__cogs">
            {
              <SensorCogWidget
                label="Fuel Flow"
                mnemonic="FUEL"
                update={sensorState.fuel}
                history={histories.fuel}
                precision={1}
                accentColor="#f59e0b"
                max={24}
              />
            }
            {
              <SensorCogWidget
                label="Generator Current"
                mnemonic="GEN"
                update={sensorState.generator}
                history={histories.generator}
                precision={1}
                accentColor="#06b6d4"
                max={20}
              />
            }
            {
              <SensorCogWidget
                label="Water Usage"
                mnemonic="H2O"
                update={sensorState.water}
                history={histories.water}
                precision={1}
                accentColor="#38bdf8"
                max={30}
              />
            }
            {sensorState.waterLevel && (
              <SensorCogWidget
                label="Water Tank Level"
                mnemonic="TANK"
                update={sensorState.waterLevel}
                history={histories.waterLevel}
                precision={1}
                accentColor="#22c55e"
                max={100}
              />
            )}
            {sensorState.temperature && (
              <SensorCogWidget
                label="Temperature"
                mnemonic="TEMP"
                update={sensorState.temperature}
                history={histories.temperature}
                precision={1}
                accentColor="#f97316"
                min={0}
                max={40}
              />
            )}
            {
              <EmissionsWidget
                update={sensorState.co2}
                history={histories.co2}
                onFuelTypeChange={setFuelType}
              />
            }
          </div>
        </section>
      )}

      {/* ── ENVIRONMENT ──────────────────────────────────────────────────── */}
      {show("environment") && hasEnvironmentData && (
        <section className="dashboard__section" aria-label="Environment">
          <div className="section-label">ENVIRONMENT</div>
          <div className="dashboard__cogs dashboard__cogs--compact">
            {sensorState.depthBelowKeel && (
              <SensorCogWidget
                label="Depth Below Keel"
                mnemonic="DBK"
                update={sensorState.depthBelowKeel}
                history={histories.depthBelowKeel}
                precision={2}
                accentColor="#06b6d4"
                max={80}
              />
            )}
            {sensorState.depthBelowTransducer && (
              <SensorCogWidget
                label="Depth Below Transducer"
                mnemonic="DBT"
                update={sensorState.depthBelowTransducer}
                history={histories.depthBelowTransducer}
                precision={2}
                accentColor="#0891b2"
                max={80}
              />
            )}
            {sensorState.waterTemp && (
              <SensorCogWidget
                label="Water Temperature"
                mnemonic="WTMP"
                update={sensorState.waterTemp}
                history={histories.waterTemp}
                precision={1}
                accentColor="#14b8a6"
                min={0}
                max={35}
              />
            )}
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
          {(sensorState.heading ||
            (sensorState.positionLat && sensorState.positionLon)) && (
            <div className="dashboard__nav">
              {sensorState.heading && (
                <CompassWidget
                  heading={sensorState.heading.value}
                  reference={
                    sensorState.heading.unit === "°T" ? "true" : "magnetic"
                  }
                />
              )}
              {sensorState.positionLat && sensorState.positionLon && (
                <PositionWidget
                  lat={sensorState.positionLat.value}
                  lon={sensorState.positionLon.value}
                />
              )}
            </div>
          )}
          <div className="dashboard__cogs">
            {sensorState.cog && (
              <SensorCogWidget
                label="Course Over Ground"
                mnemonic="COG"
                update={sensorState.cog}
                history={histories.cog}
                precision={1}
                accentColor="#818cf8"
                max={360}
              />
            )}
            {sensorState.sog && (
              <SensorCogWidget
                label="Speed Over Ground"
                mnemonic="SOG"
                update={sensorState.sog}
                history={histories.sog}
                precision={2}
                accentColor="#22c55e"
                max={16}
              />
            )}
            {sensorState.stw && (
              <SensorCogWidget
                label="Speed Thru Water"
                mnemonic="STW"
                update={sensorState.stw}
                history={histories.stw}
                precision={2}
                accentColor="#14b8a6"
                max={16}
              />
            )}
            {sensorState.magVariation && (
              <SensorCogWidget
                label="Magnetic Variation"
                mnemonic="VAR"
                update={sensorState.magVariation}
                history={histories.magVariation}
                precision={1}
                accentColor="#f97316"
                min={-30}
                max={30}
              />
            )}
            {sensorState.navLog && (
              <SensorCogWidget
                label="Total Log"
                mnemonic="LOG"
                update={sensorState.navLog}
                history={histories.navLog}
                precision={1}
                accentColor="#a855f7"
                min={1200}
                max={1400}
              />
            )}
            {sensorState.tripLog && (
              <SensorCogWidget
                label="Trip Log"
                mnemonic="TRIP"
                update={sensorState.tripLog}
                history={histories.tripLog}
                precision={2}
                accentColor="#ec4899"
                max={20}
              />
            )}
            {sensorState.gnssSatellites && (
              <SensorCogWidget
                label="GNSS Satellites"
                mnemonic="SAT"
                update={sensorState.gnssSatellites}
                history={histories.gnssSatellites}
                precision={0}
                accentColor="#84cc16"
                max={18}
              />
            )}
            {sensorState.gnssDilution && (
              <SensorCogWidget
                label="Horiz Dilution"
                mnemonic="HDOP"
                update={sensorState.gnssDilution}
                history={histories.gnssDilution}
                precision={2}
                accentColor="#f59e0b"
                max={3}
              />
            )}
            {sensorState.gnssAltitude && (
              <SensorCogWidget
                label="GNSS Altitude"
                mnemonic="ALT"
                update={sensorState.gnssAltitude}
                history={histories.gnssAltitude}
                precision={1}
                accentColor="#38bdf8"
                max={30}
              />
            )}
          </div>
        </section>
      )}

      {/* ── ELECTRICAL ───────────────────────────────────────────────────── */}
      {show("electrical") && hasElectricalData && (
        <section className="dashboard__section" aria-label="Electrical">
          <div className="section-label">ELECTRICAL</div>
          <div className="dashboard__cogs dashboard__cogs--compact">
            {sensorState.battVoltage && (
              <SensorCogWidget
                label="Battery Voltage"
                mnemonic="VBAT"
                update={sensorState.battVoltage}
                history={histories.battVoltage}
                precision={2}
                accentColor="#f59e0b"
                max={30}
              />
            )}
            {sensorState.battCurrent && (
              <SensorCogWidget
                label="Battery Current"
                mnemonic="IBAT"
                update={sensorState.battCurrent}
                history={histories.battCurrent}
                precision={1}
                accentColor="#f97316"
                min={-100}
                max={100}
              />
            )}
            {sensorState.battTemp && (
              <SensorCogWidget
                label="Battery Temperature"
                mnemonic="TBAT"
                update={sensorState.battTemp}
                history={histories.battTemp}
                precision={1}
                accentColor="#ef4444"
                min={0}
                max={70}
              />
            )}
            {sensorState.battTimeRemaining && (
              <SensorCogWidget
                label="Time Remaining"
                mnemonic="TIME"
                update={sensorState.battTimeRemaining}
                history={histories.battTimeRemaining}
                precision={1}
                accentColor="#22c55e"
                max={24}
              />
            )}
          </div>
        </section>
      )}

      <AnomalyPanel anomalies={anomalies} />

      <details className="optional-panel" id="connections">
        <summary>
          Weather &amp; optional connections{" "}
          <span>Configure extra services</span>
        </summary>
        <WeatherPanel
          vesselLat={sensorState.positionLat?.value ?? null}
          vesselLon={sensorState.positionLon?.value ?? null}
        />

        <IntegrationPanel />
      </details>

      {/* ── REPORT ───────────────────────────────────────────────────────── */}
      <section
        id="reports"
        className="dashboard__report"
        aria-label="Sustainability report"
      >
        <DateRangePicker />
      </section>

      <footer className="dashboard-footer">
        <span>
          <Anchor size={15} /> Suvion Systems
        </span>
        <p>
          Simulation-first research prototype. Operational targets are
          illustrative; reports do not certify regulatory compliance.
        </p>
        <a
          href="https://www.bcit.ca/news/stories/computing-capstone-project-maritime-sustainability/"
          target="_blank"
          rel="noreferrer"
        >
          The project story <ArrowUpRight size={14} />
        </a>
      </footer>
      <AgentChatPopup sensorState={sensorState} />
    </main>
  );
}
