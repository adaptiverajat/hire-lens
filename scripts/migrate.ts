/**
 * Applies supabase/migrations/*.sql in filename order.
 *
 *   npm run db:migrate
 *
 * Requires SUPABASE_DB_URL in .env.local (Supabase dashboard ->
 * Project Settings -> Database -> Connection string -> URI).
 *
 * Each file runs inside a transaction and is recorded in
 * public._hirelens_migrations, so re-running only applies new files.
 * Pass --force to re-apply everything.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local' });
config({ path: '.env' });

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');
const force = process.argv.includes('--force');

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error(
      'SUPABASE_DB_URL is not set.\n' +
        'Add it to .env.local, e.g.\n' +
        'SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
    );
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  await client.query(`
    create table if not exists public._hirelens_migrations (
      name text primary key,
      applied_at timestamptz not null default timezone('utc', now())
    );
  `);

  const applied = new Set<string>();
  if (!force) {
    const { rows } = await client.query<{ name: string }>(
      'select name from public._hirelens_migrations'
    );
    rows.forEach((r) => applied.add(r.name));
  }

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }

    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');

    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        'insert into public._hirelens_migrations (name) values ($1) on conflict (name) do nothing',
        [file]
      );
      await client.query('commit');
      console.log(`  ok    ${file}`);
      count += 1;
    } catch (error) {
      await client.query('rollback');
      console.error(`  FAIL  ${file}`);
      console.error(error instanceof Error ? error.message : error);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log(`\nApplied ${count} migration(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
