# Official Source Validation

Suvion reports are informational and do not certify regulatory compliance. The validation layer records which official sources informed the calculation and integration checks.

## IMO

Use IMO guidance for the calculation basis:

* MEPC.352(78), CII G1: operational carbon-intensity indicators and calculation methods.
* MEPC.308(73), as amended, and MEPC.364(79): fuel-to-CO2 conversion-factor references.

The app converts volume readings to mass using representative fuel-density assumptions, then applies the IMO mass-basis `Cf` values.

## Signal K

Signal K is used as an optional data-normalization source. The API subscribes to explicit own-vessel paths instead of `subscribe=all`.

Important unit handling:

* `environment.outside.temperature` and `environment.water.temperature` are Kelvin and converted to Celsius.
* `navigation.headingTrue` and related angles are radians and converted to degrees.
* `navigation.speedOverGround` is m/s and converted to knots.
* `tanks.freshWater.0.currentLevel` is a tank level ratio, not a water usage rate; the app exposes it as tank level and excludes it from water-usage reports.

## ABB

ABB Voyage Optimization APIs can validate whether a route/weather optimization result is directionally comparable with local report numbers. ABB results are not used as the source of truth for IMO formulas.

The API marks an ABB route response `not_comparable` unless compatible fuel or CO2 totals can be found in the response.

## Firecrawl

Firecrawl refreshes source evidence with official-domain filtering. If credentials are unavailable or the network fails, reports keep static source references and continue generation.

Default source cache path:

```text
/tmp/suvion-validation-sources.json
```

Override with:

```text
VALIDATION_SOURCE_CACHE_PATH=/path/to/cache.json
```
