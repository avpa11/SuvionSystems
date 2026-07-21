# Signal K Architecture Notes

## Current Local State

During inspection on July 8, 2026:

* No local API listener was visible on `4001`.
* No local NMEA UDP listener was visible on `10110`.
* No local Signal K listener was visible on `3000` or `3443`.
* Port `3000` was occupied by a Next server, not Signal K.

So there are multiple configured Signal K possibilities, but not two running Signal K servers in the active WSL environment.

## Intended Modes

### Default Development

```text
python3 simulation/nmea_generator.py -> UDP 127.0.0.1:10110 -> apps/api
```

This path does not require Signal K.

### Optional Signal K

Set:

```sh
SIGNALK_ENABLED=true
SIGNALK_URL=ws://localhost:3000/signalk/v1/stream
```

The API rewrites the stream URL to `subscribe=none` and sends explicit subscriptions for the paths it understands.

### Docker

`docker-compose.yml` starts a `signalk` service and configures the API with:

```sh
SIGNALK_ENABLED=true
SIGNALK_URL=ws://signalk:3000/signalk/v1/stream
```

Docker must be available in the active environment for this path to work.

## Python Simulator

The simulator sends directly to the API by default:

```sh
python3 simulation/nmea_generator.py
```

It emits XDR sensor sentences plus HDM/HDG, MWV, VTG, VHW, GGA, GLL, and VLW navigation
sentences. That feed drives dashboard COG, SOG, STW, magnetic variation, GNSS satellites,
HDOP, altitude, position, total log, and trip log.

It can also mirror NMEA sentences to a Signal K UDP target:

```sh
python3 simulation/nmea_generator.py --signalk-host localhost --signalk-port 3000
```

The mirror path requires Signal K to be configured to accept that UDP input.

## Data Semantics

Persisted report streams:

* `fuel`: fuel flow rate, `L/h`
* `water`: water usage rate, `L/h`
* `generator`: current, `A`
* `temperature`: ambient temperature, `C`

Broadcast-only streams include navigation, wind, battery, depth, and Signal K tank level.

`tanks.freshWater.0.currentLevel` is not water usage. It is rendered as `waterLevel` and excluded from water usage totals.
