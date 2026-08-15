# Reconciliation report

Generated: 2026-08-14T08:31:37.870Z

## Machine checks

- Records: 130
- Regions: 5
- Districts: 47
- Cities: 18
- Explicitly named inhabited towns in the 2025 population table: 60
- Coordinates matched from OSM: 78
- Errors: 0
- Warnings: 0

## Official-source discrepancy

The Statistics Agency publication for 1 January 2025 contains internally inconsistent totals: the administrative table states 68 towns and six without official residents, while the population grouping and the region totals do not resolve to one complete named list. This dataset therefore includes only the 60 towns explicitly named in the population table. Missing registry-only names must be imported from the official settlement registration register or a later corrected publication; they must not be guessed from OSM.

This is why the dataset is marked `draft_reconciled`. The UI must not claim that the unresolved register-only settlements are already displayed.

## Errors

- None

## Warnings requiring review

- None

## Sources

- Statistics Agency, population as of 1 January 2025: https://www.stat.tj/wp-content/uploads/2025/12/machmuai-shumorai-aholi-to-1.01.2025.pdf
- ADLIA administrative-territorial law: https://mmih.adlia.tj/Search/DocumentView?DocumentId=118856
- OpenStreetMap extract: https://download.geofabrik.de/asia/tajikistan.html (ODbL 1.0)
