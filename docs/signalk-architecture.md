# Signal K bridge

Signal K is optional. The default Python simulator sends directly to the API's
UDP listener at `127.0.0.1:10110`; it does not require a Signal K server.

## Connect a native server

Start and configure your Signal K server separately. Set these values in the root
`.env`, then restart the API:

```dotenv
SIGNALK_ENABLED=true
SIGNALK_URL=ws://localhost:3000/signalk/v1/stream
```

The API sets `subscribe=none` and sends explicit own-vessel subscriptions. It
ignores other-vessel contexts. If the upstream connection closes, restart the API;
automatic bridge reconnection is not implemented.

## Connect the optional Docker service

The profile uses the upstream image and stores its configuration in a separate
volume. The command overrides a root `.env` URL that might otherwise use localhost:

```sh
SIGNALK_ENABLED=true SIGNALK_URL=ws://signalk:3000/signalk/v1/stream \
  docker compose --profile signalk up -d
```

Configure upstream security and data connections through its local admin UI at
[localhost:3000](http://localhost:3000). Starting the container alone does not
configure a sensor feed. The default image uses `latest`; set `SIGNALK_IMAGE` to a
reviewed version or digest when repeatability is required.

Use a single fuel source. If the Signal K stream includes the same readings as the
Docker simulator, stop the direct simulator with `docker compose stop simulator`
and keep it stopped during that test. Starting the full stack again starts it too.

The optional upstream source checkout is excluded from core npm workspaces. To
inspect it, run `git submodule update --init apps/signalk-server`. It retains its
Apache-2.0 license and independent build instructions; core installation needs no
submodule initialization.

## Units and persistence

| Input                          | Internal interpretation                           |
| ------------------------------ | ------------------------------------------------- |
| `propulsion.0.fuel.rate`, m³/s | Fuel flow in L/h, multiplied by 3,600,000         |
| Outside/water temperature, K   | Celsius                                           |
| True heading and angles, rad   | Degrees; true heading retains the `°T` reference  |
| Speed, m/s                     | Knots for vessel speed; apparent wind remains m/s |
| Freshwater tank level, ratio   | Percentage; excluded from water-usage totals      |

The bridge uses its implemented paths, such as propulsion instance `0` and battery
instance `1`. Other vessel layouts need mapping changes. Direct simulator headings
are magnetic (`°M`); true and magnetic headings are labeled on the compass.

Only fuel flow, generator current, water-use rate, and ambient temperature sensor
streams are persisted, alongside calculated emissions. Navigation, wind, depth,
battery, and tank-level readings are live-only. See [architecture](architecture.md)
and [the API guide](api.md).

## Mirror simulator output

```sh
python3 simulation/nmea_generator.py --signalk-host localhost --signalk-port 3000
```

The upstream server must have a UDP input configured on that port. This command
also sends directly to the API by default; avoid ingesting both paths into Suvion
at the same time.
