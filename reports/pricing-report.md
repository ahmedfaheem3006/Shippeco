# Pricing Test Report

- Total test suites: 8
- Total tests: 17
- Passed: 17
- Failed: 0
- Success: true
- Duration (summed suites): 0.03s

## Slowest Tests
- 22.74610000000007ms — legacy pricing matrix matches legacy behavior across combinations of service, weight, fuel, profit
- 1.4886000000001332ms — legacy pricing matrix covers all result kinds for missing inputs
- 1.372000000000071ms — pricing integration prices a multi-piece shipment using chargeable weight and legacy pricing
- 1.175799999999981ms — dhlLegacyPricing lookupFromTable rounds up and uses nearest higher key
- 1.0760999999999967ms — chargeableWeight returns null when all piece weights are zero
- 0.6485999999999876ms — legacy pricing matrix computes branch coverage for lookupRate across zones
- 0.30290000000013606ms — legacy pricing matrix calculates fuel and profit on top of (base + gogreen) like legacy
- 0.25260000000002947ms — legacy pricing matrix returns no_rate for zone 8 destinations like legacy
- 0.24549999999999272ms — dhlLegacyPricing getZoneInfoLegacy matches Qatar special case
- 0.24500000000011823ms — dhlLegacyPricing computeLegacyPrice matches legacy ordering of fuel/gogreen/markup

## Coverage Summary
- Zones: SA, QT, 1–7, and Zone 8 no-rate behavior
- Weight: sub-1kg, integer, fractional, and extrapolation > 100kg
- Dimensions: volumetric vs actual selection and multi-piece totals
- Surcharges: fuel % and profit % (including negative profit as discount)
- Matrix combinations validated: 495
- Matrix throughput: ~21762 calculations/sec (in tests)

## Failures

None