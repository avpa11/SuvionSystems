# Source verification

Suvion stores reference metadata to make calculation assumptions traceable.
Reports are informational; the cache does not establish regulatory compliance.
See [calculation references](../references.md) for source links and density assumptions.

## Static references and refresh

`GET /validation/sources` reads the local metadata cache or falls back to the
built-in source definitions. Report generation does not require a network lookup.
`POST /validation/sources/refresh` optionally invokes Firecrawl for fixed searches
covering IMO, EPA, and Signal K references.

Returned URLs must use HTTPS and exactly match a hostname allowed for that source.
For example, `imo.org.attacker.example` does not match `imo.org`. This checks URL
provenance, not the scientific accuracy, currency, or applicability of a publication.

| Source status | Meaning                                                  |
| ------------- | -------------------------------------------------------- |
| `reference`   | Built-in reference, or refresh found no matching result  |
| `verified`    | Refresh found a result on an allowed HTTPS hostname      |
| `unavailable` | Refresh was requested without a configured Firecrawl key |
| `error`       | The provider request failed                              |

Static URLs remain available when refresh is unavailable or fails. A previously
written cache can remain visible until another refresh; use `fetchedAt` and
`refreshedAt` to assess age. The term `verified` does not certify a report or vessel.

## Cache configuration

The default path is `suvion-validation-sources.json` in the operating system's
temporary directory (`/tmp` in the Linux container). It is not durable reference
storage. `VALIDATION_SOURCE_CACHE_PATH` can override it in the API environment;
see [advanced integration configuration](../integrations.md#advanced-native-configuration)
for container forwarding requirements.

## Unit conventions

Signal K supplies SI units. The bridge converts fuel volume rate from m³/s to L/h,
Kelvin to Celsius, vessel speed to knots, angles to degrees, and tank ratios to
percentages. A tank level is not a water-use rate. These are code-level mappings,
covered by parser/unit tests; see [the bridge guide](../signalk-architecture.md).
