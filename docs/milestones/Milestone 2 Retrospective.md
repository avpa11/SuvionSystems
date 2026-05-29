# Milestone 2: Setup Signal K, Mock NMEA Generator, Basic Dashboard Skeleton

# What Was Completed

**Must — all completed:**
* Signal K v2 server running over UDP, successfully parsing NMEA0183 sentences (RMC, XDR, MTW)
* Python mock NMEA generator (`simulation/nmea_generator.py`) emitting fuel flow, generator current, water usage, and temperature at 1 Hz across three vessel-state scenarios: cruising, anchoring, and generator cycling
* Next.js dashboard skeleton (`apps/web`) with four sensor widgets rendering live Socket.IO data; widget layout uses shared `packages/ui` components
* Node.js adapter (`apps/api`) subscribes to Signal K, stamps each inbound message with a UTC timestamp, forwards to Socket.IO, and persists to MongoDB

**Should — all completed:**
* Docker Compose (`docker-compose.yml`) orchestrates Signal K (port 3000), MongoDB (port 27017), `apps/api` (port 4001), and `apps/web` (port 4000) on a shared `app_network`
* MongoDB schema validator rejects inserts containing `crewName`, `vesselReg`, or any other disallowed PII field
* Turborepo monorepo with `apps/web` and `apps/api` resolved against `packages/ui`, `packages/logger`, and `packages/typescript-config`

**Could — partially completed:**
* Connection log format implemented (connection established, message received with timestamp + payload, disconnection); structured JSON output to `signal-k-server.log` and `dashboard-client.log`
* Lint and type-check pipeline passing for `apps/web` and `apps/api`; `apps/api` hot-reload not fully stable under rapid file saves (deferred to Milestone 3 cleanup)

**Deviations:** No scope changes required. Signal K parsed all four target NMEA sentence types without falling back to a raw TCP listener.

# Lessons Learned

**What went well:**
* Signal K's subscribe API was simpler to wire up than expected — the adapter reached a stable streaming state early, leaving extra time for dashboard polish and Docker Compose tuning
* Turborepo's `dependsOn: ["^build"]` graph eliminated manual build ordering issues across packages from the start
* The Python generator's state-machine design (cruising / anchoring / generator cycling) made it easy to reproduce specific data patterns during manual dashboard testing

**What didn't go well:**
* Signal K v2 documentation online still mixes v1 examples; the `signalk-node-server` configuration format took several hours to reconcile
* Socket.IO reconnect on the dashboard side emitted duplicate `connect` events after a rapid adapter restart, briefly showing stale readings; required a `socket.removeAllListeners()` guard before re-subscribing

**What could be improved:**
* Start with the official Signal K GitHub repo README rather than third-party tutorials — the documentation discrepancy cost time that a direct source check would have avoided
* Write reconnect integration tests (adapter restart → dashboard recovers) at the start of the milestone rather than discovering the edge case during manual testing

# Future Improvements

* Add a reconnect integration test: bring the adapter down, wait 5 s, bring it back, assert dashboard resumes showing live data within 2 s
* Extract Signal K configuration into a checked-in `signalk-config/` directory so the server state is reproducible from a fresh Docker volume
* Stabilize `apps/api` hot-reload under rapid file saves (low priority; development experience issue, not a production concern)

# Team Reflections

* **Alina** — Signal K's learning curve was steeper than expected on day one but the subscribe API turned out to be clean once the configuration format was sorted out. The Docker Compose single-command startup was a good investment early; it removed a whole class of "works on my machine" issues during dashboard iteration.
