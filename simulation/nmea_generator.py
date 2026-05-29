"""
Suvion Systems — Mock NMEA0183 Generator
=========================================
Emits $IIXDR transducer sentences over UDP at 1 Hz for four data streams:
  FUEL_FLOW   — fuel flow rate (L/h)
  GEN_CURR    — generator current (A)
  WATER_USE   — water usage rate (L/h)
  TEMP        — ambient temperature (°C)

Usage:
    python nmea_generator.py [--scenario SCENARIO] [--host HOST] [--port PORT]

Scenarios:
    cruising    (default)  Typical underway conditions
    anchoring              Vessel at anchor, high generator use
    generator_cycling      Generator cycling between high and low load

Targets:
    --host  Default: 127.0.0.1 (Node.js adapter UDP listener)
    --port  Default: 10110 (NMEA0183 standard UDP port)

Signal K path (optional):
    Set --signalk-host / --signalk-port to also forward sentences to Signal K.
"""

import argparse
import math
import random
import socket
import time

# ─── NMEA checksum ────────────────────────────────────────────────────────────

def nmea_checksum(sentence: str) -> str:
    """XOR of all characters between $ and * (exclusive)."""
    cs = 0
    for ch in sentence[1:]:  # skip leading $
        if ch == "*":
            break
        cs ^= ord(ch)
    return format(cs, "02X")


def build_xdr(sensor_type: str, value: float, unit: str, name: str) -> str:
    """
    Build an $IIXDR sentence.
    Format: $IIXDR,<type>,<value>,<unit>,<name>*<checksum>
    """
    body = f"$IIXDR,{sensor_type},{value:.2f},{unit},{name}"
    cs = nmea_checksum(body)
    return f"{body}*{cs}"


# ─── Vessel state scenarios ───────────────────────────────────────────────────

class Scenario:
    """Base class describing nominal sensor values for a vessel state."""

    def readings(self, t: float) -> dict[str, float]:
        raise NotImplementedError

    @property
    def name(self) -> str:
        return self.__class__.__name__


class CruisingScenario(Scenario):
    """
    Vessel underway at cruising speed.
    Fuel flow 10–15 L/h with gentle variation; generator light load.
    """

    @property
    def name(self) -> str:
        return "cruising"

    def readings(self, t: float) -> dict[str, float]:
        return {
            "fuel": 12.5 + 2.0 * math.sin(t / 60) + random.gauss(0, 0.3),
            "generator": 8.2 + random.gauss(0, 0.5),
            "water": 15.0 + random.gauss(0, 0.8),
            "temperature": 21.0 + 0.5 * math.sin(t / 300) + random.gauss(0, 0.1),
        }


class AnchoringScenario(Scenario):
    """
    Vessel at anchor: main engine off, generator running hard for hotel load.
    Low fuel draw; higher generator current.
    """

    @property
    def name(self) -> str:
        return "anchoring"

    def readings(self, t: float) -> dict[str, float]:
        return {
            "fuel": 2.1 + random.gauss(0, 0.2),
            "generator": 12.5 + 2.0 * math.sin(t / 30) + random.gauss(0, 0.4),
            "water": 8.0 + random.gauss(0, 0.5),
            "temperature": 22.0 + random.gauss(0, 0.15),
        }


class GeneratorCyclingScenario(Scenario):
    """
    Generator cycling between high and low load every 2 minutes.
    Triggers the non-compliant CO₂ detection during high-load phases.
    """

    CYCLE_PERIOD = 120  # seconds

    @property
    def name(self) -> str:
        return "generator_cycling"

    def readings(self, t: float) -> dict[str, float]:
        phase = (t % self.CYCLE_PERIOD) / self.CYCLE_PERIOD
        gen_current = 15.0 if phase < 0.5 else 1.0
        # Fuel spikes slightly when generator is at full load
        fuel_base = 18.0 if phase < 0.5 else 5.0
        return {
            "fuel": fuel_base + random.gauss(0, 0.4),
            "generator": gen_current + random.gauss(0, 0.3),
            "water": 5.0 + random.gauss(0, 0.3),
            "temperature": 20.0 + random.gauss(0, 0.1),
        }


SCENARIOS: dict[str, Scenario] = {
    "cruising": CruisingScenario(),
    "anchoring": AnchoringScenario(),
    "generator_cycling": GeneratorCyclingScenario(),
}

# ─── UDP sender ───────────────────────────────────────────────────────────────

def send_sentences(
    sock: socket.socket,
    scenario: Scenario,
    host: str,
    port: int,
    t: float,
    jitter_ms: int = 10,
) -> None:
    """Generate and send one set of NMEA sentences for the current timestamp."""
    readings = scenario.readings(t)

    sentences = [
        build_xdr("V", max(0.0, readings["fuel"]),       "L", "FUEL_FLOW"),
        build_xdr("A", max(0.0, readings["generator"]),  "A", "GEN_CURR"),
        build_xdr("V", max(0.0, readings["water"]),      "L", "WATER_USE"),
        build_xdr("C", readings["temperature"],           "C", "TEMP"),
    ]

    for sentence in sentences:
        data = (sentence + "\r\n").encode("ascii")
        sock.sendto(data, (host, port))
        # Inter-packet jitter avoids UDP receive-buffer overflow at 1 Hz × 4 streams
        time.sleep(jitter_ms / 1000)


# ─── Logging ──────────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    print(f"[{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}] {msg}", flush=True)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Suvion Systems NMEA mock generator")
    parser.add_argument(
        "--scenario",
        choices=list(SCENARIOS),
        default="cruising",
        help="Vessel-state scenario to simulate (default: cruising)",
    )
    parser.add_argument("--host", default="127.0.0.1", help="UDP target host")
    parser.add_argument("--port", type=int, default=10110, help="UDP target port")
    parser.add_argument(
        "--signalk-host", default=None, help="Optional Signal K host (e.g. localhost)"
    )
    parser.add_argument("--signalk-port", type=int, default=3000, help="Signal K UDP port")
    parser.add_argument(
        "--duration", type=int, default=0,
        help="Run for N seconds then exit (0 = run forever)"
    )
    args = parser.parse_args()

    scenario = SCENARIOS[args.scenario]
    log(f"Starting scenario '{scenario.name}' → UDP {args.host}:{args.port}")

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    # Signal K secondary target (optional)
    sk_target = (args.signalk_host, args.signalk_port) if args.signalk_host else None

    start_time = time.time()
    t = 0.0
    packet_count = 0

    try:
        while True:
            t = time.time() - start_time

            send_sentences(sock, scenario, args.host, args.port, t)
            packet_count += 4

            # Mirror to Signal K if configured
            if sk_target:
                readings = scenario.readings(t)
                sentences = [
                    build_xdr("V", max(0.0, readings["fuel"]),       "L", "FUEL_FLOW"),
                    build_xdr("A", max(0.0, readings["generator"]),  "A", "GEN_CURR"),
                    build_xdr("V", max(0.0, readings["water"]),      "L", "WATER_USE"),
                    build_xdr("C", readings["temperature"],           "C", "TEMP"),
                ]
                for sentence in sentences:
                    sock.sendto((sentence + "\r\n").encode("ascii"), sk_target)

            if packet_count % 100 == 0:
                log(f"Sent {packet_count} packets | scenario={scenario.name} | t={t:.0f}s")

            if args.duration and t >= args.duration:
                log(f"Duration {args.duration}s reached — stopping")
                break

            # Sleep to maintain 1 Hz packet rate (accounting for send time)
            next_tick = start_time + (int(t) + 1)
            sleep_sec = next_tick - time.time()
            if sleep_sec > 0:
                time.sleep(sleep_sec)

    except KeyboardInterrupt:
        log(f"Generator stopped after {packet_count} packets")
    finally:
        sock.close()


if __name__ == "__main__":
    main()
