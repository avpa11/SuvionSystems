# Background and calculation references

## Project context

- [BCIT: Computing capstone charts sustainable course for small vessels](https://www.bcit.ca/news/stories/computing-capstone-project-maritime-sustainability/),
  October 5, 2026. Background on Alina Pak's simulation-first capstone and its intended scope.

The project explores fuel, water, and generator monitoring for small-vessel
operators using synthetic data. See [architecture](architecture.md) for the current
scope and limitations. Academic submissions are kept outside the published tree;
they are not setup instructions or evidence for current behavior.

## Emissions method

| Fuel   | Cf, kg CO₂/kg fuel | Representative density, kg/L |
| ------ | -----------------: | ---------------------------: |
| Diesel |              3.206 |                        0.840 |
| MGO    |              3.206 |                        0.875 |
| MDO    |              3.206 |                        0.875 |
| HFO    |              3.114 |                        0.991 |
| LNG    |              2.750 |                        0.450 |

`CO₂ kg = volume L × density kg/L × Cf kg/kg`. Factors are mass-basis fuel-to-CO₂
conversion values. Densities are illustrative engineering assumptions; they are
not mandated by the cited IMO resolutions. Temperature, composition, and fuel
specification affect actual density. LNG calculations cover combustion CO₂ only,
not methane slip or lifecycle greenhouse-gas equivalence.

- [IMO MEPC.352(78): CII calculation guidelines](<https://wwwcdn.imo.org/localresources/en/OurWork/Environment/Documents/Air%20pollution/MEPC.352(78).pdf>)
  provides CII calculation context. A per-litre factor alone is not attained CII.
- [IMO MEPC.364(79): EEDI calculation guidelines](<https://wwwcdn.imo.org/localresources/en/OurWork/Environment/Documents/Air%20pollution/MEPC.364(79).pdf>)
  includes fuel-to-CO₂ conversion-factor references. The legacy MEPC.308(73), as
  amended, is also cited by the original engine documentation.
- [IMO Fourth GHG Study 2020](https://www.imo.org/en/OurWork/Environment/Pages/Fourth-IMO-Greenhouse-Gas-Study-2020.aspx)
  supplies historical sector context, including the report's 2018 shipping-share fact.

The 15 L/h fuel and 45 kg/h CO₂ thresholds, comparable-vessel targets, and display
ranges are **demo assumptions**, not IMO limits. Do not cite them as industry
benchmarks. The report router preserves legacy API names for compatibility while
the dashboard labels them as operational targets and threshold exceedances.

## Contextual equivalencies

- [EPA: Typical passenger vehicle emissions](https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle)
  supports the report's illustrative 4,600 kg CO₂ per vehicle-year comparison.
- [EPA: Equivalencies calculations and references](https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references)
  is the reference for gasoline/diesel gallon comparisons. These are contextual
  equivalencies; they do not replace marine fuel density and mass-factor calculations.

## Protocols and implementation

- [Signal K specification](https://signalk.org/specification/): marine data model and SI-unit conventions.
- [Signal K server unit preferences](https://github.com/SignalK/signalk-server/blob/master/docs/guides/unitpreferences.md):
  documents the base fuel-volume-rate unit (`m³/s`). Suvion converts to `L/h` with ×3,600,000.
- [Next.js October 14, 2026 security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026):
  basis for moving the dashboard to the maintained 15.5.28 release.

The report uses fixed numeric constants; a source refresh updates metadata, not
fuel factors, densities, thresholds, or equivalency values. Update code and
regression fixtures deliberately when changing those assumptions.

Source links establish provenance, not certification. The optional source-refresh
integration verifies returned HTTPS hostnames against an exact allowlist; it does
not prove that a report is correct or legally accepted.
