# Suvion Systems \- Environmental Monitoring and Sustainability Dashboard

## Maritime vessel sustainability tracking made accessible

[**Introduction	3**](#introduction)

[**Executive Summary	3**](#executive-summary)

[**Biography	5**](#biography)

[**Introduction & Background	5**](#introduction-&-background)

[**Goals & Proposed System	6**](#goals-&-proposed-system)

[**Methodology & Design	7**](#methodology-&-design)

[**Scope	8**](#scope)

[**System Architecture & Design	9**](#system-architecture-&-design)

[Components	9](#heading=)

[Data Flow	9](#heading=)

[State Transitions	10](#heading=)

[Storage	10](#heading=)

[Privacy and Timing Enforcement Points	10](#heading=)

[**Success Metrics	11**](#success-metrics)

[Sensor data	11](#sensor-data)

[Test Procedure	11](#test-procedure)

[Sample Size	11](#sample-size)

[Baseline	11](#baseline)

[Log Types	11](#log-types)

[Emissions Calculations	11](#emissions-calculations)

[Test Procedure	12](#test-procedure-1)

[Sample Size	12](#sample-size-1)

[Baseline	12](#baseline-1)

[Log Types	12](#log-types-1)

[Sustainability Reports	12](#sustainability-reports)

[Test Procedure	12](#test-procedure-2)

[Sample Size	12](#sample-size-2)

[Baseline	13](#baseline-2)

[Log Types	13](#log-types-2)

[**Innovation & Differentiation	13**](#innovation-&-differentiation)

[1\. Simulation-First Accessibility	13](#heading=)

[2\. Open-Source Stack for Zero Licensing Cost	13](#heading=)

[3\. Automated IMO Emissions Calculation with Auditable Accuracy	14](#heading=)

[**Risks & Mitigations	14**](#risks-&-mitigations)

[**Testing & Validation Plan	14**](#testing-&-validation-plan)

[Unit Tests — Emissions Engine	15](#heading=)

[Unit Tests — Dashboard Widgets	16](#heading=)

[Integration Tests — Data Ingestion	16](#heading=)

[Integration Tests — Reporting API	17](#heading=)

[End-to-End / System Tests	18](#heading=)

[**Schedule & Milestones	19**](#heading=h.e0n4q4uhbhvc)

[Weeks 1‑2: Setup Signal K, mock NMEA generator, basic dashboard skeleton.	19](#weeks-1‑2:-setup-signal k,-mock-nmea-generator,-basic-dashboard-skeleton.)

[Weeks 3‑5: Emissions engine & real‑time data pipeline.	20](#weeks-3‑5:-emissions-engine-&-real‑time-data-pipeline.)

[Weeks 6‑7: Reporting API, export formats	20](#weeks-6‑7:-reporting-api,-export-formats)

[Weeks 8‑9: Bug fixes, unit testing. Potentially: anomaly detection model and alert UI	20](#weeks-8‑9:-bug-fixes,-unit-testing.-potentially:-anomaly-detection-model-and-alert-ui)

[Weeks 10‑11: Integration testing, performance tuning, documentation.	20](#weeks-10‑11:-integration-testing,-performance-tuning,-documentation.)

[Week 12: Demo prep, risk review, final polish.	21](#week 12:-demo-prep,-risk-review,-final-polish.)

[**Assumptions & Constraints	21**](#assumptions-&-constraints)

[Assumptions	21](#heading=)

[Constraints	21](#heading=)

[**Ethics & Data Governance	22**](#ethics-&-data-governance)

[Data Retention	22](#data-retention)

[Data Deletion	22](#data-deletion)

[Privacy Constraints	22](#privacy-constraints)

[Compliance	23](#compliance)

[**Feasibility & Build Plan	23**](#feasibility-&-build-plan)

[Why This Is Achievable in One Term	23](#why-this-is-achievable-in-one-term)

[**Canonical Terms	23**](#canonical-terms)

[**Related Work	25**](#related-work)

# Introduction {#introduction}

Suvion Systems helps small vessel operators easily track fuel consumption levels, monitor systems and calculate CO₂ emissions instead of having to manually log, calculate and analyze the data.

As a captain, you review your yacht’s fuel consumption report at the end of a charter season. Your engineer spent hours and hours manually logging generator hours into a spreadsheet. Due to manual reporting, the crew identified an excessive generator use and smaller water leaks days after they happened which caused the vessel to not comply with environmental regulations in the last charter season. 

Suvion Systems addresses this by providing a single dashboard web application that reads real-time data from sensors using open-source software, calculates the environmental impact and produces standards-compliant sustainability reports.

# Executive Summary {#executive-summary}

On a small yacht, the crew spends many hours (in addition to regular watch hours) manually tracking fuel and emissions using spreadsheets. This labour-intensive and error-prone process is done for fuel consumption reporting. The captain reviews the report and tries to analyze carbon intensity to see if the vessel complies with International Maritime Organization (IMO) standards on environmental contribution. To analyze the data, the captain spends hours calculating CO₂ emissions for the given report period. Manual monitoring led to delays in detecting high generator consumption and small water leaks, and by the time the issues were identified, the vessel had already breached environmental compliance standards for that charter period. 

Currently, there are no alternatives to manual tracking for small vessel operators that can address the issues outlined above. The fix is a monitoring system that features a web dashboard with:

* real-time sensors in a widget view with multiple streams of data—fuel, water, energy, and waste  
* automated CO₂ emissions calculations using IMO formulas and sensor-ingested data  
* sustainability reporting with no compliance guarantee

In future (potential supporting work), the dashboard will offer:

* alert mechanisms for identifying non‑compliant periods and detecting anomalies using lightweight machine‑learning models   
* sensor data stored in time-series storage  
* regulatory compliance reporting

Suvion Systems provides a straightforward way for vessel environmental monitoring and sustainability tracking. The front-end will feature a dashboard page where users can view real-time sensor data, calculate CO₂ emissions using that data and generate sustainability and fuel consumption reports.

Behind the scenes, the dashboard will use an open-source software for collecting data from devices and sensors. The app will feature a simulation mode with sample NMEA0183 and NMEA2000 data, allowing users to explore the system without the need for hardware deployment.

During testing, Suvion Systems will be tested against:

* *Real‑time Data Ingestion with Data Accuracy*. All simulated sensor streams appear in the dashboard within \< 1 s of emission, with no data loss or corruption. 100 % match between simulated values and dashboard display; no unit mismatches.  
* *CO₂ Emissions Calculation.* Calculated emissions differ from reference values (for a variety of fuel types and consumption rates) by \< 0.5 %  
* *Report Generation.* Reports are produced within 5 s, contain all required fields, and correctly flag non‑compliant periods.  
* *Simulation Mode.* Simulation can be started/stopped in \< 2 s and the dashboard updates to match simulated conditions (cruising, anchoring, generator cycling).

Scope stays narrow on purpose. 

* Suvion Systems only uses simulated vessel data with NMEA connections through Signal K (open-source central hub software). It provides configuration options for different data connections but the project doesn’t test hardware installation with equipment on boats, only simulated data.   
* Fuel consumption and sustainability reporting are restricted only to IMO standards on environmental contribution with publicly available formulas.  
* There is no user authentication in place. Since the app’s server is designed to potentially be installed on a physical vessel, it is assumed that the dashboard users are the crew members of the vessel.  
* The application’s FE is a single page dashboard  
* Machine learning anomaly detection with time-series data is treated as future work, not part of the MVP release  
* Compliance check is also treated as a potential future improvement and not part of the MVP. The system will generate the reports using saved sensor data and *CO₂* emission calculations but not guarantee regulatory compliance

All results in this summary will be verified against reference values for *CO₂* emissions for a variety of fuel types and consumption rates with multiple simulated conditions. Sensor accuracy will be evaluated over one week of recorded data. Real-time emissions will be demonstrated by logging socket and network connections.

# Biography {#biography}

I have developed scalable, full-stack applications and AI-powered tools based on real-time insights and automation. Most recently, at Navica AI, I contributed to a maritime intelligence platform that uses multi-agent AI workflows to enable predictive vessel management. In previous projects, I was responsible for delivering fintech software, designing custom AI agents with complex workflows, enhancing online pharmacies and telehealth platforms. 

These experiences support building data ingestion, real-time dashboards, and analytics directly—all of which include designing data schemas and generating actionable insights. I am confident I can deliver simulation mode, sustainability reporting, and an open-source dashboard, complete with testable, reproducible results.

In this project, I will reuse my professional skills to implement the finalized design, build and debug the end-to-end full-stack systems prototype with a web dashboard, realtime capture of sensor data, emissions calculations and standards-compliant sustainability reports for small vessels. I will produce a test suite with unit tests for the web dashboard, integration tests for back-end services; design and run the evaluation scripts calculation errors, accuracy, and response time.

# Introduction & Background {#introduction-&-background}

On small yachts the crew spends many hours logging fuel, generator use, water consumption and other operational data into spreadsheets. The resulting reports are labor‑intensive, error‑prone, and often incomplete.

Because the data is captured manually, captains must spend hours after each charter season to calculate CO₂ emissions using International Maritime Organization (IMO) formulas and compare the vessel’s carbon intensity against regulatory thresholds. In practice this leads to late discovery of inefficiencies: excessive generator use, water leaks or fuel‑spillage are only noticed after the fact, causing non‑compliance with IMO environmental standards and loss of charter revenue.

There is a clear market gap: no affordable, open‑source system exists that automatically captures sensor data, performs real‑time emissions calculations, and produces standards‑compliant sustainability reports for small vessels. The cost of commercial monitoring solutions is prohibitive (US $20‑50 k plus installation), and spreadsheets lack the analytics needed to detect anomalies early.

Suvion Systems provides a single dashboard that displays widgets for each data stream, an emissions calculator and a report builder with date‑range picker. All components are open‑source and can be deployed on a single onboard computer or in the cloud.

# Goals & Proposed System {#goals-&-proposed-system}

Suvion Systems is a web‑based dashboard that:

* Ingests real‑time sensor data (fuel flow, generator current, water meters, temperature) via an open‑source hub (Signal K).  
* Calculates CO₂ emissions automatically using publicly available IMO formulas and the ingested sensor data.  
* Generates sustainability reports (fuel consumption, CO₂ emissions, water usage) that can be exported for regulatory filing (but can’t be used as standalone standards‑compliant documents).  
* Provides a simulation mode with sample NMEA0183/2000 streams so operators can test the system without hardware.

As part of future work and potential improvements, the system will:

* Detect anomalies (e.g., generator over‑run, water leak) using lightweight machine‑learning models and trigger alerts.  
* Generate standards‑compliant report with regulatory checks

The application is a single dashboard that displays widgets for each data stream, an emissions calculator and a report builder with date‑range picker. All components are open‑source and can be deployed on a single onboard computer or in the cloud.

| goal | feature | test | evidence |
| :---- | :---- | :---- | :---- |
| use open-source software to automatically capture sensor data | real-time sensors in a widget view with multiple streams of data—fuel, water, energy, and waste | all simulated sensor streams appear in the dashboard within \< 1 s of emission, with no data loss or corruption. 100 % match between simulated values and dashboard display; no unit mismatches. | logs for socket and network connections that captures: connection established, each message received with timestamp and payload, and disconnection events |
| perform emissions calculations | the system calculates CO₂ emissions automatically using publicly available IMO formulas and the ingested sensor data | calculated emissions differ from reference values (for a variety of fuel types and consumption rates) by \< 0.5 % | a test suite (e.g. Jest, pytest) that feeds known inputs — a matrix of fuel types at varying consumption rates \- into the calculation module and asserts that outputs match pre-computed reference values within 0.5%. The reference values should be derived directly from the IMO  formulas, with the formula source cited in the test file so the calculation is auditable. |
| produce standards-compliant sustainability reports for small vessels | platform generates sustainability reports (fuel consumption, CO₂ emissions, water usage) that can be exported for regulatory filing | reports are produced within 5 s, contain all required fields, and correctly flag non‑compliant periods | integration test that triggers report generation and then asserts three things: the file is produced within 5 seconds (measured wall-clock), a schema validator confirms all required fields are present (fuel consumption, CO₂, water usage, vessel ID, reporting period, etc.), and a second assertion flags any time windows where values exceeded the compliance threshold — confirming the non-compliant period detection logic fired correctly. |

# Methodology & Design {#methodology-&-design}

Suvion Systems consists of the following modules:

* Single-page Next.js application (dashboard) for the front-end portion of the app with unit tests for dashboard widgets and inputs  
* Data Ingestion \- Signal K receives NMEA0183/2000 packets over UDP/TCP. A Node.js adapter forwards parsed data to the dashboard via WebSocket and stores it in MongoDB. The service produces log files (e.g. from Socket.IO or a raw TCP listener) that captures socket and network connection  
* Simulation \- A mock NMEA generator (Python) streams synthetic data through the same Signal K pipeline, enabling demo and testing without hardware.  
* Emissions Engine \- A small TypeScript module applies IMO emission factors (fuel type × consumption) to compute CO₂. Results are cached and refreshed every minute. Known reference values are fed into the calculation module to validate the correctness of computations.  
* Reporting \- A REST API aggregates data over user‑selected ranges and returns JSON formatted for export to CSV or PDF. The service includes integration tests to ensure correct report generation.

Potential future modules:

* Anomaly Detector \- An isolation‑forest model (Python) trained on a 24‑hour baseline of simulated data.   
* Optimization algorithms \- seek patterns to recommend efficiency gains (i.e., "minimize overlap between generators when electrical load is low").  
* Alerts service \- alerts emitted when new readings exceed the model’s threshold, then sent to the front‑end via WebSocket.  
* Compliance automation

# Scope {#scope}

| In Scope | Out of Scope | Future work (Out of Scope for MVP) |
| ----- | ----- | ----- |
| Simulated data input | Physical sensor installation on vessels | Anomaly detection (generator, water) |
| Real‑time ingestion via Signal K | Integration with proprietary vessel management systems | Alerts and notifications  |
| CO₂ emissions calculation using IMO formulas | User authentication/authorization | Standards‑compliant report generation |
| Full system test on local MacOS and Linux machines | Cloud deployment (beyond a single local instance) | Optimization algorithms |
| Report generation with no regulatory acceptance | Regulatory certification beyond IMO formulas |  |

The project deliberately excludes hardware deployment, authentication mechanisms, commercial licensing and regulatory certification. Alerts notification and machine learning based anomaly detection and optimization are part of potential future work, and are also excluded from the initial scope.

The focus is on simulated sensor ingestion, emissions calculation using IMO formulas, and a clear visualization pipeline with reproducible results.

# System Architecture & Design {#system-architecture-&-design}

Suvion Systems is composed of five loosely coupled modules that share a common data bus (WebSocket / REST). Data flows in one direction — from sensor source to storage to display — with privacy and timing controls applied at defined integration points.

![][image1]

## Components

* **Dashboard (Next.js SPA).** Single-page application that renders sensor widgets, an emissions calculator, and a report builder with a date-range picker. Communicates with the back-end exclusively over WebSocket (live data) and REST (reports).  
* **Signal K Hub.** Open-source server that receives NMEA0183 / NMEA2000 packets over UDP and TCP, normalises them into a standard key–value model, and exposes a subscribe API consumed by the Node.js adapter.  
* **Node.js Adapter.** Bridges Signal K and the rest of the system. It forwards parsed readings to the dashboard via Socket.IO (WebSocket) and persists them to MongoDB. This is the primary timing enforcement point: messages are timestamped on receipt and any message that exceeds the 1-second latency budget is flagged in the connection log.  
* **Emissions Engine (TypeScript).** Stateless calculation module that applies IMO GHG emission factors (fuel type × consumption rate) to produce CO₂ values. Results are cached in memory and refreshed every 60 seconds to avoid redundant recomputation while keeping displayed values current.  
* **Reporting API (REST).** Aggregates stored sensor data over a user-selected date range and returns a JSON payload that the front-end renders and exports as CSV or PDF. Report generation must complete within 5 seconds (wall-clock); the API logs request and response timestamps for validation.  
* **Simulation Module (Python).** Mock NMEA generator that streams synthetic packets through the same Signal K pipeline used by live hardware, enabling demo and test without physical sensors.

## Data Flow

**Simulation path:** Python mock generator → Signal K (UDP/TCP) → Node.js adapter → Socket.IO → Dashboard widgets. In parallel, the adapter writes each reading to MongoDB with a UTC timestamp.  
**Reporting path:** Dashboard date-range picker → HTTP GET /report → Reporting API → MongoDB aggregation → JSON payload → CSV / PDF download.  
**Emissions path:** Node.js adapter → Emissions Engine (in-process call) → cached CO₂ value → Socket.IO → dashboard emissions widget. Cache is invalidated every 60 seconds or on fuel-type change.

## State Transitions

The system operates in two top-level modes that share the same ingestion and storage pipeline:

* **Simulation mode (default).** The Python mock generator is the data source. The user can start or stop simulation from the dashboard; transition must complete in \<2 seconds. Simulated scenarios include cruising, anchoring, and generator cycling.  
* **Live mode (future).** Physical NMEA hardware replaces the mock generator; no other component changes. Out of scope for the MVP.

Within each mode the adapter transitions through: Idle → Connected (Signal K handshake) → Streaming (messages received) → Error (dropped connection, auto-reconnect attempted) → Idle.

## Storage

All sensor readings are persisted in MongoDB as time-series documents (one document per reading, indexed on timestamp and stream type). The collection is capped at 30 days of data in accordance with the data-minimisation policy described in Ethics & Data Governance. No document may contain a crew name, vessel registration number, or any other PII field; this is enforced by a pre-insert schema validator and verified by the nightly privacy-check.py scan.

## Privacy and Timing Enforcement Points

* **Node.js adapter (timing).** Timestamps every inbound message; latency exceeding 1 second triggers a log warning. This is the only place where end-to-end delivery time is measured.  
* **MongoDB schema validator (privacy).** Rejects any insert that includes disallowed fields. Nightly privacy-check.py scans the collection and logs any anomaly to data-lifecycle.log.  
* **Reporting API (timing).** Records wall-clock duration from request receipt to JSON response. Responses that exceed 5 seconds are flagged in reporting-api.log and counted as test failures.  
* **30-day TTL job (privacy).** Automated script runs daily, permanently deletes documents older than 30 days, and appends a signed deletion record to data-lifecycle.log.

# Success Metrics {#success-metrics}

## Sensor data {#sensor-data}

Real-time sensor data (NMEA0183/2000) appears in the dashboard within \<1 second of emission, with 100% accuracy (no loss/corruption/unit mismatches).

### Test Procedure {#test-procedure}

* Use the mock NMEA generator (Python) to stream 500+ synthetic packets across 4 data streams (fuel flow, generator current, water usage, temperature) over a 24-hour replay period (simulating cruising, idling, generator surges).  
* For each packet, record:  
  * Timestamp of emission from the generator.  
  * Timestamp of reception by Signal K (via UDP/TCP logs).  
  * Timestamp of display in the dashboard (via WebSocket message logs).  
* Validate that:  
  * Dashboard update latency ≤ 1 second (95th percentile).  
  * 100% match between simulated values and dashboard readings (e.g., fuel flow \= 12.5 L/h → dashboard shows 12.5 L/h, no unit conversions like "L/h" vs "gal/min").

### Sample Size {#sample-size}

500+ synthetic NMEA packets per data stream (2,000 total).

### Baseline  {#baseline}

IMO NMEA data standard (valid packet formats, transmission rates).

### Log Types {#log-types}

* Signal K connection logs (e.g., signal-k-server.log): Records UDP/TCP packet reception timestamps and payloads.  
* WebSocket message logs (e.g., dashboard-client.log): Captures front-end data update events with timestamps.  
* Mock generator logs: Tracks emission timestamps for baseline comparison.

## Emissions Calculations {#emissions-calculations}

CO₂ emissions calculations differ from IMO reference values by \<0.5% for all fuel types (diesel, marine gasoil, LNG) and consumption rates (0.1–500 L/h).

### Test Procedure {#test-procedure-1}

* Create a test matrix of 100+ scenarios: 5 fuel types × 20 consumption rates (spanning idle to full load).  
* For each scenario, compute expected CO₂ using IMO GHG Calculation Guidelines  
* Feed scenario inputs into the TypeScript emissions engine and compare outputs to expected values.  
* Replay scenarios over a weekly simulated operation period (7 days × 24 hours) to test stability.

### Sample Size {#sample-size-1}

100+ fuel-consumption scenarios.

### Baseline  {#baseline-1}

IMO emission factors (e.g., diesel \= 2.68 kg CO₂/L, marine gasoil \= 2.72 kg CO₂/L).

### Log Types {#log-types-1}

* Emissions engine audit logs (e.g., emissions.log): Records input fuel type/consumption, output CO₂, and timestamp.  
* Test result logs: Stores pass/fail for each scenario (error % vs. IMO reference).

## Sustainability Reports  {#sustainability-reports}

Reports are generated in \<5 seconds, include all 12 required fields (vessel ID, reporting period, fuel consumed, CO₂ emitted, water usage, etc.), and correctly flag non-compliant periods (exceeding IMO carbon intensity thresholds).

### Test Procedure {#test-procedure-2}

* Trigger report generation for 50+ date ranges (e.g., 1 day, 1 week, 1 month) using pre-simulated data.  
* Measure:  
  * Time to generate report (wall-clock time from API request to file download).  
  * Completeness: Validate all 12 required fields via JSON schema (e.g., report-schema.json).  
  * Compliance detection: For scenarios with fuel consumption \> 150 L/h (arbitrary threshold for testing), confirm the report flags "non-compliant" with a timestamp.  
* Replay tests over monthly report cycles (4 weeks) to ensure consistency.

### Sample Size {#sample-size-2}

50+ report requests across varying date ranges.

### Baseline  {#baseline-2}

IMO Environmental Contribution Report Template (MEPC.359(77))

### Log Types {#log-types-2}

* API response logs (e.g., reporting-api.log): Records request/response timestamps and status codes.  
* Schema validation logs: Confirms presence of required fields (e.g., "fuel\_consumption\_L" not missing).  
* Compliance flag logs: Tracks when non-compliant periods are detected and included in reports.

# Innovation & Differentiation {#innovation-&-differentiation}

Suvion Systems is novel relative to the existing options described in Related Work in three concrete, measurable ways, each of which is within the approved project scope.

## 1\. Simulation-First Accessibility (Experimental)

Every existing alternative — commercial monitors (US$20–50 k), proprietary management suites, and spreadsheets — requires expensive hardware, certified installation, or both before a user can interact with the system.

Suvion Systems removes this barrier entirely by routing synthetic NMEA streams through the same production pipeline used by real hardware. This is not merely a cost reduction — it is a qualitative architectural decision: the simulation module is first-class, not an afterthought, and all functional requirements are verified exclusively against it.

* **Inventive aspect**: The Python mock generator emits NMEA packets across multiple vessel states (cruising, anchoring, generator cycling) through the full Signal K \-\> adapter \-\> dashboard pipeline, making every functional claim independently reproducible without vessel access.  
* **Measurable target**: Simulation starts and stops in \< 2 seconds; dashboard correctly reflects simulated state transitions.

## 2\. Open-Source Stack for Zero Licensing Cost

The combination of Signal K (NMEA normalisation), Next.js (dashboard), Node.js (adapter), MongoDB Community (time-series store), and Python (simulation \+ privacy checks) achieves a fully integrated environmental monitoring platform at $0 software licensing cost — a configuration that does not exist in the current market.

* **Inventive aspect.** Signal K was designed for navigation, not environmental compliance. Repurposing it as the data ingestion layer for an IMO-compliant emissions system is a novel application of the protocol.  
* **Measurable target.** Use of open-source software is explicitly stated as a goal in Goals & Proposed System and confirmed in the Feasibility & Build Plan.

## 3\. Auditable Real-Time IMO Emissions Engine (Exploratory)

No open-source vessel monitoring tool currently publishes a verifiable, formula-cited accuracy target for real-time IMO GHG emissions calculations. Commercial systems provide limited or undisclosed environmental modules with no documented error bounds.

Suvion Systems implements an automated calculation pipeline that cites the source formula in every audit log entry, targets a \< 0.5 % error margin validated against 100+ reference scenarios, and produces results in real time rather than end-of-season.

* **Measurable comparison.** \<0.5% emissions calculation error (target) vs. manual spreadsheet calculations with no documented error bound. Calculation results are produced in real time vs. hours of end-of-season manual effort.  
* **Scope alignment.** The Emissions Calculations success metric (\<0.5% error, 100+ scenarios across 5 fuel types and 20 consumption rates) directly verifies this claim within the approved project scope.

# Risks & Mitigations {#risks-&-mitigations}

| Risk | Impact | Likelihood | Mitigation |
| :---- | :---- | :---- | :---- |
| Data Quality – Simulated NMEA streams may not capture all real‑world edge cases.	 | Medium | High | Use a diverse set of synthetic scenarios (cruising, idling, generator surge) and validate against known IMO emission factors.  |
| Emission calculation accuracy | High | Low | Apply the equations of the IMO, and check comparison case studies with the reports from the research paper of the maritime branch. Document assumptions clearly. |
| Lack of domain expertise in maritime operations | Low | Low | Conduct a comprehensive study of public documents, including IMO guidelines, EU regulations, maritime engineering textbooks; verify assumptions with published research. |

# Testing & Validation Plan {#testing-&-validation-plan}

Unit Tests:

* Emissions Engine  
* Dashboard Widgets

Integration Tests:

* Data Ingestion  
* Reporting API

# Schedule & Milestones

The schedule below expands each phase into deliverables, risk triggers, and a buffer allocation. 

| Phase | Details |
| ----- | ----- |
| Weeks 1–2  |  Foundation | Signal K running; mock generator emitting; dashboard skeleton deployed. |
| Weeks 3–5  |  Core pipeline | Emissions engine. |
| Weeks 6–7  |  Reporting | Reporting API / PDF export functional |
| Weeks 8–9  |  Buffer | All unit & integration tests pass; fixing all bugs and issues |
| Weeks 10–11  |  System test | performance tuning; documentation complete. |
| Week 12  |  Delivery | Demo ready; final risk review/ |

## Weeks 1‑2: Setup Signal K, mock NMEA generator, basic dashboard skeleton. {#weeks-1‑2:-setup-signal k,-mock-nmea-generator,-basic-dashboard-skeleton.}

Deliverables: working Signal K instance receiving NMEA0183 packets over UDP; mock NMEA generator producing at least 4 data streams (fuel flow, generator current, water usage, temperature); basic Next.js dashboard rendering one widget per stream with live WebSocket data. Risk trigger: if Signal K fails to parse a custom NMEA sentence by end of Week 1, switch to raw TCP listener and file a scope note.

## Weeks 3‑5: Emissions engine & real‑time data pipeline. {#weeks-3‑5:-emissions-engine-&-real‑time-data-pipeline.}

Deliverables: TypeScript emissions engine; Node.js adapter. Risk trigger: if ±0.5% accuracy is not achieved by end of Week 4, extend engine work into the buffer in weeks 8–9 and defer Reporting API start by one week.

## Weeks 6‑7: Reporting API, export formats {#weeks-6‑7:-reporting-api,-export-formats}

Deliverables: REST Reporting AP; CSV and PDF export functional from the dashboard date-range picker. Risk trigger: if MongoDB aggregation for 1-month ranges exceeds 5 s, add a pre-aggregation index and extend optimization into weeks 8–9 buffer. 

## Weeks 8‑9: Bug fixes, unit testing. Potentially: anomaly detection model and alert UI {#weeks-8‑9:-bug-fixes,-unit-testing.-potentially:-anomaly-detection-model-and-alert-ui}

Deliverables: all unit and integration tests passing. Weeks 8–9 serve as the primary schedule buffer: if the emissions engine or Signal K integration required remediation in weeks 3–7, this period absorbs it.

## Weeks 10‑11: Integration testing, performance tuning, documentation. {#weeks-10‑11:-integration-testing,-performance-tuning,-documentation.}

Performance tuning complete (p95 latency confirmed ≤1 s under 2 000-packet load; report generation confirmed ≤5 s for 1-month range).

## Week 12: Demo prep, risk review, final polish. {#week 12:-demo-prep,-risk-review,-final-polish.}

Deliverables: live demo walkthrough

# Assumptions & Constraints {#assumptions-&-constraints}

The following assumptions have been made in scoping and designing this project. Each assumption is paired with the constraint it implies and the action taken if the assumption proves false.

## Assumptions

* The Signal K open-source server (v2.x) correctly parses NMEA0183 and NMEA2000 packets over UDP/TCP without requiring custom protocol modifications. If false: fall back to a raw TCP listener and implement a custom parser; schedule impact absorbed in the weeks 8–9 buffer.  
* IMO GHG Calculation Guidelines (MEPC.361(78)) are publicly available and provide unambiguous emission factors for diesel, marine gasoil, LNG, HFO, and MDO. If false: use MEPC.245(66) as a fallback; document the substitution.  
* Simulated NMEA data (synthetic packets) is sufficient to validate all functional requirements. No physical vessel hardware is available or required. If false: the scope note in Section 4 (Scope) applies; live-hardware testing is out of scope for this project.  
* The local development machines (macOS and Linux) provide adequate performance to run Signal K, MongoDB, the Next.js dashboard, and the Python generator concurrently without hardware-level bottlenecks. If false: reduce mock-generator packet rate from 1 Hz to 0.2 Hz and note the change in the test report.  
* MongoDB Community Edition is sufficient for time-series storage at the volumes generated in this project (≤2 000 packets/test run, ≤30 days of data). No managed cloud database is required.  
* The project's test environment has stable internet access for installing npm and pip packages during setup. All production dependencies will be pinned in package.json and requirements.txt before the integration test phase begins.

## Constraints

* No physical hardware. The system is tested exclusively with simulated NMEA data. Hardware installation on a vessel is out of scope.  
* No user authentication. The dashboard assumes all users are authorised crew members on a private local network. Authentication is out of scope for the MVP.  
* Single local deployment. The system is deployed on one machine (MacOS or Linux). Multi-instance, clustered, or cloud deployments are out of scope.  
* No regulatory certification. Reports are generated using IMO formulas but are not submitted to any regulatory body. The system does not guarantee acceptance of its outputs as standards-compliant documents.  
* No PII. The system must not store or process any personally identifiable information. All sensor readings are numerical values with no operator, crew, or vessel identification beyond a configurable vessel\_id string.  
* Open-source dependencies only. All software components must carry an OSI-approved open-source licence. No proprietary SDKs, paid APIs, or commercial data feeds may be used.  
* Time constraint: 12 weeks, single developer. Feature additions that cannot be completed and tested within this window are classified as future work (see Scope section).

# Ethics & Data Governance {#ethics-&-data-governance}

Given Suvion’s focus on simulated data and prototype scope, ethics and data governance are centered on minimizing risk (no real user/PII data) and transparency (documented data lifecycle). Below is how retention, deletion, and privacy are verified:

## Data Retention {#data-retention}

* Policy: Simulated sensor data is retained for 30 days maximum (aligned with The General Data Protection Regulation (GDPR’s) "data minimization" principle). No real vessel or crew data is stored.  
* Verification: Automated scripts run daily to delete data older than 30 days. Logs of deletion events are stored in data-lifecycle.log for audit.

## Data Deletion {#data-deletion}

* Policy: All test data is purged permanently upon project completion (or earlier at user request).  
* Verification: A final "data wipe" script is documented and executed post-demo, with a cryptographically signed log confirming deletion.

## Privacy Constraints {#privacy-constraints}

* Policy: No personal identifiable information (PII) or vessel operator data is collected. All "user" interactions are with simulated data (e.g., no login credentials, no crew names).  
* Verification: Regular scans using privacy-check.py confirm no PII fields (e.g., email, vessel registration numbers) exist in the database (MongoDB).

## Compliance {#compliance}

Documentation file is maintained, detailing:

* Data types stored (only simulated sensor readings: fuel flow, temperature—no PII).  
* Retention/deletion workflows.  
* Privacy impact assessment (PIA) confirming no real-user risk.

# Feasibility & Build Plan {#feasibility-&-build-plan}

### Why This Is Achievable in One Term {#why-this-is-achievable-in-one-term}

| Feasibility | Details |
| ----- | ----- |
| Prior Experience | I have built small, fast web tools that ingest real‑time data and expose dashboards. |
| Tech Stack | Next.js, Node.js, TypeScript, MongoDB, and Python are my core languages |
| Resources | All dependencies are open‑source; IMO and EPA publish emission factors to the public. No external hardware or paid services are required. |
| Validation | Success metrics don't require vessel access. Calculations validate against published papers. |

### 

# Canonical Terms {#canonical-terms}

| Term | Definition | Unit | Verification Method |
| ----- | ----- | ----- | ----- |
| Sensor Data Ingestion Latency & Accuracy	 | Time from sensor data emission (mock NMEA0183/2000 packet) to dashboard display, plus percentage of values matching simulated inputs (no loss/corruption/unit mismatches).	 | Seconds (latency: ≤1s target) / % (accuracy: 100% target)	 | Stream 500+ synthetic packets via mock NMEA generator; compare emission/dashboard timestamps (Signal K/WebSocket logs) and validate 100% value match (e.g., fuel flow \= 12.5 L/h → dashboard shows 12.5 L/h).  |
| Emissions Calculation Error | Relative difference between Suvion’s CO₂ emission output and IMO GHG Guidelines (MEPC.361(78)) reference values for fuel type/consumption scenarios.	 | % (error: ≤0.5% target)	 | Test 100+ scenarios (5 fuel types × 20 consumption rates: 0.1–500 L/h); compare Suvion outputs to IMO-calculated references using emissions engine audit logs (e.g., diesel emission factor \= 2.68 kg CO₂/L). |
| Report Generation Time | Wall-clock time from API request (user selects date range) to report download (CSV/PDF).	 | Seconds (≤5s target)	 | Trigger 50+ report requests across date ranges (1 day/1 week/1 month); measure time via API response logs (reporting-api.log).  |
| Report Field Completeness	 | Percentage of required fields (vessel ID, reporting period, fuel consumed (L), CO₂ emitted (kg), water usage (m³)) present in generated reports.	 | % (100% target)	 | Validate reports against IMO-compliant JSON schema (report-schema.json); track missing fields via schema validation logs. |
| Compliance Detection Accuracy	 | Percentage of simulated non-compliant periods (exceeding IMO carbon intensity threshold: e.g., \>150 L/h fuel consumption) correctly flagged in reports.	 | % (100% target)	 | Simulate 20+ threshold breaches; confirm reports flag "non-compliant" with timestamps via compliance flag logs.  |

# Related Work {#related-work}

A search on GitHub and google reveals no repositories offering integrated yacht environmental monitoring combining fuel, emissions, water, and energy with optimization algorithms. This gap forces operators to choose between expensive proprietary solutions or manual tracking.

| Existing solution | Limitation |
| ----- | ----- |
| Spreadsheets / Manual Logs	 | Time‑consuming, error‑prone, no real‑time insight  |
| Commercial Marine Monitors	 | High upfront cost (20–50 k), require certified installation, target large fleets |
| Proprietary Yacht Management Software	 | Limited environmental modules, no automated emissions calculations, no anomaly detection |

None of the above options provide a single, web‑based dashboard that ingests standard NMEA0183/ NMEA2000 data, automatically computes CO₂ emissions using IMO formulas and exports reports.

Suvion Systems differentiates itself from existing solutions through three measurable, scope-aligned design decisions that address the unmet needs of small vessel operators:

* Simulation-First Accessibility (Eliminates Hardware Barriers)  
* Open-Source Stack for Affordability  
* Automated IMO Compliance Automation (Eliminates Manual Error)

## 

[image1]: <data:image/png;base64,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>