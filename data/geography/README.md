# Geography data

Generated artifacts are committed so the UI works offline. Raw OSM extracts and downloaded PDFs are not committed.

## Rebuild

```powershell
npm run geodata:boundary -- --source C:\path\to\tajikistan.poly
npm run geodata:locations -- --osm C:\path\to\osm-urban-places.json --boundary src\data\geography\tajikistan-boundary-high.geojson
npm run geodata:validate
```

- Country geometry: OpenStreetMap extract distributed by Geofabrik, ODbL 1.0.
- Official names/status/hierarchy: Statistics Agency publication for 1 January 2025 and ADLIA.
- Coordinates: OpenStreetMap; any unresolved match remains `null` and appears in the reconciliation report.
- The source publication's aggregate and named lists currently disagree. See `reconciliation-report.md`; never fill gaps by guessing.
