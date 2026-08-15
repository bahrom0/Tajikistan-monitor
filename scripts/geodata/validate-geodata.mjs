import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const inputPath = resolve(process.argv[2] ?? 'src/data/geography/locations.json');
const reportPath = resolve(process.argv[3] ?? 'data/geography/reconciliation-report.md');
const dataset = JSON.parse(await readFile(inputPath, 'utf8'));
const rows = dataset.locations;
const errors = [];
const warnings = [];
const ids = new Set();
const nameKeys = new Set();
const byId = new Map(rows.map((row) => [row.id, row]));

for (const row of rows) {
  if (!/^(region|district|city|town)-[a-z0-9-]+$/.test(row.id)) errors.push(`${row.id}: invalid stable ID`);
  if (ids.has(row.id)) errors.push(`${row.id}: duplicate ID`);
  ids.add(row.id);
  if (!row.name_ru || !row.name_tg) errors.push(`${row.id}: missing RU/TJ name`);
  if (row.parent_id && !byId.has(row.parent_id)) errors.push(`${row.id}: parent ${row.parent_id} does not exist`);
  const nameKey = `${row.parent_id}|${row.type}|${row.name_tg.toLocaleLowerCase('tg-TJ')}`;
  if (nameKeys.has(nameKey)) errors.push(`${row.id}: duplicate name inside the same parent/type`);
  nameKeys.add(nameKey);
  if (['city', 'town'].includes(row.type)) {
    if (!Number.isFinite(row.longitude) || !Number.isFinite(row.latitude)) warnings.push(`${row.id}: OSM coordinate was not matched`);
    else if (row.longitude < 67.2 || row.longitude > 75.3 || row.latitude < 36.6 || row.latitude > 41.1) errors.push(`${row.id}: coordinate outside Tajikistan bbox`);
  }
}

for (const row of rows) {
  const seen = new Set([row.id]);
  let parent = row.parent_id ? byId.get(row.parent_id) : undefined;
  while (parent) {
    if (seen.has(parent.id)) errors.push(`${row.id}: parent cycle detected`);
    seen.add(parent.id);
    parent = parent.parent_id ? byId.get(parent.parent_id) : undefined;
  }
}

const counts = Object.fromEntries(['region', 'district', 'city', 'town'].map((type) => [type, rows.filter((row) => row.type === type).length]));
for (const [type, expected] of Object.entries({ region: 5, district: 47, city: 18, town: 60 })) {
  if (counts[type] !== expected) errors.push(`${type}: expected ${expected} explicitly named rows, found ${counts[type]}`);
}

const report = `# Reconciliation report\n\nGenerated: ${new Date().toISOString()}\n\n## Machine checks\n\n- Records: ${rows.length}\n- Regions: ${counts.region}\n- Districts: ${counts.district}\n- Cities: ${counts.city}\n- Explicitly named inhabited towns in the 2025 population table: ${counts.town}\n- Coordinates matched from OSM: ${rows.filter((row) => Number.isFinite(row.longitude)).length}\n- Errors: ${errors.length}\n- Warnings: ${warnings.length}\n\n## Official-source discrepancy\n\nThe Statistics Agency publication for 1 January 2025 contains internally inconsistent totals: the administrative table states 68 towns and six without official residents, while the population grouping and the region totals do not resolve to one complete named list. This dataset therefore includes only the 60 towns explicitly named in the population table. Missing registry-only names must be imported from the official settlement registration register or a later corrected publication; they must not be guessed from OSM.\n\nThis is why the dataset is marked \`draft_reconciled\`. The UI must not claim that the unresolved register-only settlements are already displayed.\n\n## Errors\n\n${errors.length ? errors.map((item) => `- ${item}`).join('\n') : '- None'}\n\n## Warnings requiring review\n\n${warnings.length ? warnings.map((item) => `- ${item}`).join('\n') : '- None'}\n\n## Sources\n\n- Statistics Agency, population as of 1 January 2025: https://www.stat.tj/wp-content/uploads/2025/12/machmuai-shumorai-aholi-to-1.01.2025.pdf\n- ADLIA administrative-territorial law: https://mmih.adlia.tj/Search/DocumentView?DocumentId=118856\n- OpenStreetMap extract: https://download.geofabrik.de/asia/tajikistan.html (ODbL 1.0)\n`;

await writeFile(reportPath, report, 'utf8');
console.log(JSON.stringify({ counts, errors: errors.length, warnings: warnings.length, report: reportPath }, null, 2));
if (errors.length) process.exitCode = 1;
