"""
Suvion Systems — Mock NMEA0183 Generator
=========================================
Emits NMEA0183 sentences over UDP at 1 Hz for sensor and navigation streams:
  FUEL_FLOW   — fuel flow rate (L/h)
  GEN_CURR    — generator current (A)
  WATER_USE   — water usage rate (L/h)
  TEMP        — ambient temperature (°C)
  HDM/HDG     — heading and magnetic variation
  VTG/VHW     — course, speed over ground, and speed through water
  GGA/GLL     — GNSS position, satellites, HDOP, altitude
  VLW         — total and trip log

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


def build_hdm(heading_deg: float) -> str:
    """Build a $IIHDM magnetic heading sentence."""
    heading_deg = heading_deg % 360
    body = f"$IIHDM,{heading_deg:.1f},M"
    return f"{body}*{nmea_checksum(body)}"


def build_mwv(wind_angle_signed: float, wind_speed_ms: float) -> str:
    """
    Build a $IIMWV apparent wind sentence.
    wind_angle_signed: ±180°, port negative, starboard positive.
    """
    angle_0_360 = wind_angle_signed % 360
    body = f"$IIMWV,{angle_0_360:.1f},R,{wind_speed_ms:.1f},M,A"
    return f"{body}*{nmea_checksum(body)}"


def build_hdg(heading_deg: float, variation_deg: float) -> str:
    """Build a $IIHDG magnetic heading sentence with variation."""
    heading_deg = heading_deg % 360
    direction = "W" if variation_deg < 0 else "E"
    body = f"$IIHDG,{heading_deg:.1f},,,{abs(variation_deg):.1f},{direction}"
    return f"{body}*{nmea_checksum(body)}"


def build_vtg(cog_deg: float, sog_kn: float) -> str:
    """Build a $IIVTG course-over-ground/speed-over-ground sentence."""
    sog_kn = max(0.0, sog_kn)
    body = f"$IIVTG,{cog_deg % 360:.1f},T,,M,{sog_kn:.2f},N,{sog_kn * 1.852:.2f},K"
    return f"{body}*{nmea_checksum(body)}"


def build_vhw(stw_kn: float) -> str:
    """Build a $IIVHW speed-through-water sentence."""
    stw_kn = max(0.0, stw_kn)
    body = f"$IIVHW,,T,,M,{stw_kn:.2f},N,{stw_kn * 1.852:.2f},K"
    return f"{body}*{nmea_checksum(body)}"


def format_lat(lat: float) -> tuple[str, str]:
    """Return NMEA ddmm.mmmm latitude plus hemisphere."""
    hemisphere = "N" if lat >= 0 else "S"
    value = abs(lat)
    degrees = int(value)
    minutes = (value - degrees) * 60
    return f"{degrees:02d}{minutes:07.4f}", hemisphere


def format_lon(lon: float) -> tuple[str, str]:
    """Return NMEA dddmm.mmmm longitude plus hemisphere."""
    hemisphere = "E" if lon >= 0 else "W"
    value = abs(lon)
    degrees = int(value)
    minutes = (value - degrees) * 60
    return f"{degrees:03d}{minutes:07.4f}", hemisphere


def nmea_utc_time() -> str:
    """Return HHMMSS UTC for GNSS sentences."""
    return time.strftime("%H%M%S", time.gmtime())


def build_gga(lat: float, lon: float, satellites: float, hdop: float, altitude_m: float) -> str:
    """Build a $IIGGA GNSS fix sentence."""
    lat_raw, lat_hemi = format_lat(lat)
    lon_raw, lon_hemi = format_lon(lon)
    body = (
        f"$IIGGA,{nmea_utc_time()},{lat_raw},{lat_hemi},{lon_raw},{lon_hemi},"
        f"1,{int(round(max(0.0, satellites))):02d},{hdop:.2f},{altitude_m:.1f},M,0.0,M,,"
    )
    return f"{body}*{nmea_checksum(body)}"


def build_gll(lat: float, lon: float) -> str:
    """Build a $IIGLL geographic position sentence."""
    lat_raw, lat_hemi = format_lat(lat)
    lon_raw, lon_hemi = format_lon(lon)
    body = f"$IIGLL,{lat_raw},{lat_hemi},{lon_raw},{lon_hemi},{nmea_utc_time()},A,A"
    return f"{body}*{nmea_checksum(body)}"


def build_vlw(total_log_nm: float, trip_log_nm: float) -> str:
    """Build a $IIVLW distance log sentence."""
    body = f"$IIVLW,{total_log_nm:.2f},N,{trip_log_nm:.2f},N,,N,,N"
    return f"{body}*{nmea_checksum(body)}"


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
            "heading": 205.0 + 4.0 * math.sin(t / 90) + random.gauss(0, 0.4),
            "cog": 207.0 + 3.0 * math.sin(t / 95) + random.gauss(0, 0.4),
            "sog": 8.6 + 0.4 * math.sin(t / 80) + random.gauss(0, 0.05),
            "stw": 8.2 + 0.35 * math.sin(t / 75) + random.gauss(0, 0.05),
            "magVariation": -13.2 + 0.1 * math.sin(t / 600),
            "gnssSatellites": 12 + 1.0 * math.sin(t / 300),
            "gnssDilution": 0.82 + 0.06 * math.sin(t / 200),
            "gnssAltitude": 4.7 + 0.2 * math.sin(t / 180),
            "windAngle": -18.0 + 12.0 * math.sin(t / 45) + random.gauss(0, 1.0),
            "windSpeed": 6.2 + 1.0 * math.sin(t / 60) + random.gauss(0, 0.2),
            "depthBelowKeel": 16.5 + 1.8 * math.sin(t / 70) + random.gauss(0, 0.08),
            "depthBelowTransducer": 18.0 + 1.8 * math.sin(t / 70) + random.gauss(0, 0.08),
            "waterTemp": 14.8 + 0.4 * math.sin(t / 240) + random.gauss(0, 0.05),
            "waterLevel": 74.0 - min(t / 3600, 6.0) + random.gauss(0, 0.2),
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
            # Swinging at anchor: heading wanders slowly through ±20°
            "heading": 140.0 + 18.0 * math.sin(t / 180) + random.gauss(0, 1.0),
            "cog": 126.0 + 30.0 * math.sin(t / 220) + random.gauss(0, 2.0),
            "sog": 0.08 + max(0.0, 0.08 * math.sin(t / 40)) + random.gauss(0, 0.02),
            "stw": 0.03 + max(0.0, 0.04 * math.sin(t / 35)) + random.gauss(0, 0.01),
            "magVariation": -13.2 + 0.1 * math.sin(t / 600),
            "gnssSatellites": 10 + 1.0 * math.sin(t / 280),
            "gnssDilution": 1.05 + 0.08 * math.sin(t / 240),
            "gnssAltitude": 4.6 + 0.1 * math.sin(t / 150),
            "windAngle": 5.0 + 25.0 * math.sin(t / 60) + random.gauss(0, 2.0),
            "windSpeed": 3.5 + 1.5 * math.sin(t / 90) + random.gauss(0, 0.3),
            "depthBelowKeel": 9.2 + 0.5 * math.sin(t / 50) + random.gauss(0, 0.05),
            "depthBelowTransducer": 10.7 + 0.5 * math.sin(t / 50) + random.gauss(0, 0.05),
            "waterTemp": 15.2 + 0.2 * math.sin(t / 300) + random.gauss(0, 0.04),
            "waterLevel": 68.0 - min(t / 4200, 5.0) + random.gauss(0, 0.2),
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
            "heading": 310.0 + 6.0 * math.sin(t / 120) + random.gauss(0, 0.5),
            "cog": 312.0 + 5.0 * math.sin(t / 130) + random.gauss(0, 0.5),
            "sog": 6.0 + 0.3 * math.sin(t / 100) + random.gauss(0, 0.05),
            "stw": 5.7 + 0.25 * math.sin(t / 90) + random.gauss(0, 0.05),
            "magVariation": -13.2 + 0.1 * math.sin(t / 600),
            "gnssSatellites": 11 + 1.0 * math.sin(t / 260),
            "gnssDilution": 0.9 + 0.08 * math.sin(t / 220),
            "gnssAltitude": 4.9 + 0.2 * math.sin(t / 160),
            "windAngle": -35.0 + 20.0 * math.sin(t / 50) + random.gauss(0, 1.5),
            "windSpeed": 8.5 + 2.0 * math.sin(t / 30) + random.gauss(0, 0.3),
            "depthBelowKeel": 21.0 + 2.4 * math.sin(t / 80) + random.gauss(0, 0.08),
            "depthBelowTransducer": 22.5 + 2.4 * math.sin(t / 80) + random.gauss(0, 0.08),
            "waterTemp": 13.9 + 0.3 * math.sin(t / 260) + random.gauss(0, 0.05),
            "waterLevel": 61.0 - min(t / 5000, 4.0) + random.gauss(0, 0.2),
        }


SCENARIOS: dict[str, Scenario] = {
    "cruising": CruisingScenario(),
    "anchoring": AnchoringScenario(),
    "generator_cycling": GeneratorCyclingScenario(),
}


def navigation_state(readings: dict[str, float], t: float) -> dict[str, float]:
    """Compute deterministic position and logs from scenario speed/course."""
    base_lat = 37.7749
    base_lon = -122.4194
    total_log_base_nm = 1284.2
    sog_kn = max(0.0, readings["sog"])
    cog_rad = math.radians(readings["cog"] % 360)
    distance_nm = sog_kn * (t / 3600)
    dlat = math.cos(cog_rad) * distance_nm / 60
    denom = 60 * max(0.2, math.cos(math.radians(base_lat)))
    dlon = math.sin(cog_rad) * distance_nm / denom

    return {
        "positionLat": base_lat + dlat,
        "positionLon": base_lon + dlon,
        "navLog": total_log_base_nm + distance_nm,
        "tripLog": distance_nm,
    }


def build_sensor_sentences(scenario: Scenario, t: float) -> list[str]:
    """Generate one coherent NMEA sentence set for the current timestamp."""
    readings = scenario.readings(t)
    nav = navigation_state(readings, t)

    return [
        build_xdr("V", max(0.0, readings["fuel"]),       "L", "FUEL_FLOW"),
        build_xdr("A", max(0.0, readings["generator"]),  "A", "GEN_CURR"),
        build_xdr("V", max(0.0, readings["water"]),      "L", "WATER_USE"),
        build_xdr("C", readings["temperature"],           "C", "TEMP"),
        build_xdr("D", max(0.0, readings["depthBelowKeel"]), "M", "DEPTH_KEEL"),
        build_xdr("D", max(0.0, readings["depthBelowTransducer"]), "M", "DEPTH_TRANSDUCER"),
        build_xdr("C", readings["waterTemp"],             "C", "WATER_TEMP"),
        build_xdr("P", max(0.0, min(100.0, readings["waterLevel"])), "%", "WATER_LEVEL"),
        build_hdm(readings["heading"]),
        build_hdg(readings["heading"], readings["magVariation"]),
        build_mwv(readings["windAngle"], max(0.0, readings["windSpeed"])),
        build_vtg(readings["cog"], readings["sog"]),
        build_vhw(readings["stw"]),
        build_gga(
            nav["positionLat"],
            nav["positionLon"],
            readings["gnssSatellites"],
            readings["gnssDilution"],
            readings["gnssAltitude"],
        ),
        build_gll(nav["positionLat"], nav["positionLon"]),
        build_vlw(nav["navLog"], nav["tripLog"]),
    ]


# ─── UDP sender ───────────────────────────────────────────────────────────────

def send_sentences(
    sock: socket.socket,
    scenario: Scenario,
    host: str,
    port: int,
    t: float,
    jitter_ms: int = 10,
) -> int:
    """Generate and send one set of NMEA sentences for the current timestamp."""
    sentences = build_sensor_sentences(scenario, t)

    for sentence in sentences:
        data = (sentence + "\r\n").encode("ascii")
        sock.sendto(data, (host, port))
        # Inter-packet jitter avoids UDP receive-buffer overflow at 1 Hz across the sentence set.
        time.sleep(jitter_ms / 1000)

    return len(sentences)


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

            packet_count += send_sentences(sock, scenario, args.host, args.port, t)

            # Mirror to Signal K if configured
            if sk_target:
                sentences = build_sensor_sentences(scenario, t)
                for sentence in sentences:
                    sock.sendto((sentence + "\r\n").encode("ascii"), sk_target)
                packet_count += len(sentences)

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
