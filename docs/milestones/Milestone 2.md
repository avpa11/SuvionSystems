# Milestone 2: Setup Signal K, Mock NMEA Generator, Basic Dashboard Skeleton

Deadline **April 13, 2026**

# Goals

## Must

* Signal K server (v2.x) running and receiving NMEA0183 packets over UDP
* Python mock NMEA generator emitting 4 data streams at 1 Hz: fuel flow, generator current, water usage, temperature
* Basic Next.js dashboard (`apps/web`) rendering one widget per stream with live Socket.IO updates
* Node.js adapter (`apps/api`) bridging Signal K subscribe API to Socket.IO and MongoDB

## Should

* Docker Compose configuration running Signal K, MongoDB, `apps/api`, and `apps/web` together
* MongoDB collection with schema validator enforcing the no-PII policy (rejects inserts containing disallowed fields)
* Turborepo monorepo with `apps/web` and `apps/api` packages wired to shared `packages/ui` and `packages/logger`

## Could

* Connection logs capturing: connection established, each message received with timestamp and payload, and disconnection events
* Dashboard hot-reload dev environment working end-to-end (generator → Signal K → adapter → browser widget updates live)
* Basic lint and type-check pipeline passing across all packages

# Deliverables

* Working Signal K instance parsing NMEA0183 sentences over UDP on the local network
* Python mock NMEA generator (`simulation/nmea_generator.py`) producing fuel flow, generator current, water usage, and temperature streams
* Next.js dashboard with one sensor widget per stream, updating in real time via Socket.IO
* Node.js adapter forwarding Signal K data to the dashboard and persisting each reading to MongoDB with a UTC timestamp
* Docker Compose file orchestrating Signal K, MongoDB, adapter, and dashboard

# Key Challenges

* Signal K v2 plugin API documentation is inconsistent with v1 — risk of custom NMEA sentence parse failures
  * Mitigation: Fall back to a raw TCP listener and file a scope note if Signal K fails to parse a required custom sentence by end of the first week of work
* WebSocket reconnect race conditions between the adapter and dashboard during service restarts
  * Mitigation: Implement exponential backoff in the Socket.IO client; test restart scenarios explicitly

# Resources Needed

* Signal K server v2.x (open-source, npm install)
* MongoDB Community Edition (Docker image `mongo:7`)
* IEC 61162-1 NMEA0183 sentence reference (for mock generator format validation)
* IMO MEPC.361(78) GHG Calculation Guidelines (emission factor reference to be used in Milestone 3)
