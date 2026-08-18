import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSchedule, MAX_DISPATCH_BATCH, normalizeBatchSize } from '../supabase/functions/_shared/scheduler.mjs';

test('dispatcher batch size is bounded', () => {
  assert.equal(normalizeBatchSize(undefined), 8);
  assert.equal(normalizeBatchSize(0), 8);
  assert.equal(normalizeBatchSize(4), 4);
  assert.equal(normalizeBatchSize(99), MAX_DISPATCH_BATCH);
});

test('source schedule advances from now when an old run is overdue', () => {
  const schedule = createSchedule(
    { id: 'kchs', next_fetch_at: '2026-08-15T00:00:00.000Z', interval_seconds: 300 },
    new Date('2026-08-15T01:00:00.000Z'),
  );
  assert.deepEqual(schedule, {
    sourceId: 'kchs',
    scheduledFor: '2026-08-15T00:00:00.000Z',
    nextFetchAt: '2026-08-15T01:05:00.000Z',
  });
});

test('invalid source schedules are rejected', () => {
  assert.throws(() => createSchedule({ id: 'kchs', next_fetch_at: 'bad', interval_seconds: 300 }), /Invalid source schedule/);
  assert.throws(() => createSchedule({ id: 'kchs', next_fetch_at: '2026-08-15T00:00:00Z', interval_seconds: 10 }), /Invalid source schedule/);
});

test('scheduler migration keeps jobs private and Cron credentials in Vault', async () => {
  const migrationUrl = new URL('../supabase/migrations/20260815042534_task_07_ingestion_scheduler.sql', import.meta.url);
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /unique \(source_id, scheduled_for\)/i);
  assert.match(migration, /alter table public\.ingestion_jobs enable row level security/i);
  assert.match(migration, /revoke all on table public\.ingestion_jobs from anon, authenticated/i);
  assert.match(migration, /vault\.decrypted_secrets/i);
  assert.match(migration, /cron\.schedule/i);
  assert.doesNotMatch(migration, /sb_secret_|service_role|nvapi-/i);
});

test('dispatcher rejects public keys before creating its backend client', async () => {
  const source = await readFile(new URL('../supabase/functions/ingest-dispatcher/index.ts', import.meta.url), 'utf8');
  assert.match(source, /startsWith\("sb_secret_"\)/);
  assert.doesNotMatch(source, /sb_publishable_/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/);
});
