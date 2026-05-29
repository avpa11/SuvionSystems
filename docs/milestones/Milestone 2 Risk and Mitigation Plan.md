# Suvion Systems — Milestone 2 Risk and Mitigation Plan

# Risk Identification

| Risk Description | Likelihood (Low/Medium/High) | Impact (Low/Medium/High) | Priority (Low/Medium/High) |
| :---- | :---- | :---- | :---- |
| Signal K v2 fails to parse a required custom NMEA sentence type | Medium | High | High |
| WebSocket reconnect race condition causes stale data on dashboard after adapter restart | Medium | Medium | Medium |
| Docker Compose networking issues prevent inter-service communication on first run | Medium | Medium | Medium |
| Mock NMEA generator produces malformed packets that Signal K silently discards | Low | High | Medium |
| MongoDB schema validator misconfiguration allows PII field to be inserted | Low | High | High |
| Development machine performance insufficient to run all services concurrently at 1 Hz | Low | Medium | Low |

# Mitigation Strategies

| Risk Description | Mitigation Strategy | Owner | Deadline |
| :---- | :---- | :---- | :---- |
| Signal K fails to parse custom NMEA sentence | Fall back to a raw TCP listener; implement a lightweight custom parser in the Node.js adapter; file a scope note documenting the change | Alina | First week of Milestone 2 work |
| WebSocket reconnect race condition | Implement exponential backoff in the Socket.IO client; add `socket.removeAllListeners()` guard before re-subscribing on reconnect; write a restart integration test | Alina | April 13, 2026 |
| Docker Compose networking issues | Use the named `app_network` bridge network; test `docker-compose up` on a clean environment early; document required `docker network create` step in README | Alina | First week of Milestone 2 work |
| Mock generator produces malformed packets | Validate generator output against IEC 61162-1 checksum rules before integration; add a checksum verification flag to the generator script | Alina | First week of Milestone 2 work |
| MongoDB schema validator allows PII insert | Write a test that attempts to insert a disallowed field and asserts rejection; run `privacy-check.py` scan against test collection before milestone sign-off | Alina | April 13, 2026 |
| Machine performance bottleneck | Reduce mock generator packet rate from 1 Hz to 0.2 Hz and document the change in the test report; prioritise Docker resource limits in `docker-compose.yml` | Alina | If issue arises during development |

# Monitoring Plan

* **Daily:** Review Signal K server logs (`signal-k-server.log`) for parse errors or dropped packets during active development
* **Mid-milestone:** Confirm Signal K is receiving and parsing all four NMEA sentence types without errors; trigger the scope-note fallback if not
* **Before sign-off:** Run the full 500-packet smoke test (all four streams, three vessel states); confirm 100 % delivery and ≤1 s p95 latency; run `privacy-check.py` against the MongoDB test collection
* **Weekly:** Review Docker Compose startup time; flag if any service fails to become healthy within 30 seconds

# Contingency Plan

* **Signal K parse failure:** Switch to a raw TCP listener in `apps/api` that reads newline-delimited NMEA sentences directly; this removes the Signal K subscribe layer but preserves the rest of the pipeline unchanged. Document the substitution in `SCOPE_NOTES.md`.
* **Persistent reconnect instability:** Downgrade from Socket.IO to a plain WebSocket (`ws` library) connection between adapter and dashboard; the dashboard widget code needs minimal changes since it only consumes JSON messages.
* **MongoDB schema validator gap:** Add a pre-insert hook in the Node.js adapter (application-layer validation) as a redundant check independent of the database-layer validator.
* **Machine performance:** Drop the mock generator to 0.2 Hz (one packet per 5 seconds); adjust the 500-packet test to a 100-packet test with the same assertion criteria; note the change in the test report.
