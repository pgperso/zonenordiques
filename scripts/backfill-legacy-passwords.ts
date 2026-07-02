/**
 * Backfills members_private.legacy_password_hash from the legacy Zone Nordiques
 * membre.csv export.
 *
 * The old site stored raw MD5 hashes (32 hex chars, no salt). This script
 * reads each row from membre.csv, matches it to an existing auth.users row
 * by email, and writes the legacy hash into members_private.
 *
 * After the hash is in place, /api/auth/legacy-login can verify a login
 * attempt against it, then migrate the user to a bcrypt password via the
 * Supabase admin API and clear the legacy hash.
 *
 * Usage:
 *   npx tsx scripts/backfill-legacy-passwords.ts [--dry-run]
 *
 * Reads .env for SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(__dirname, '..', '.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
} catch { /* no .env */ }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface MembreRow {
  no_membre: string;
  nom_utilisateur: string;
  mot_passe: string;
  courriel: string;
  bannie: string;
}

function parseCsv(content: string): MembreRow[] {
  const lines = content.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: MembreRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row as unknown as MembreRow);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else current += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ',') {
        result.push(current);
        current = '';
      } else current += char;
    }
  }
  result.push(current);
  return result;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will update DB)'}\n`);

  const csvPath = resolve(__dirname, '..', 'membre.csv');
  const content = readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(content);
  console.log(`Parsed ${rows.length} rows from membre.csv`);

  // Load member emails from members_private (bypasses the listUsers 1000-row
  // pagination cap and avoids a second admin API call we don't need).
  const emailToUuid = new Map<string, string>();
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data: page, error: pageErr } = await supabase
      .from('members_private')
      .select('member_id, email')
      .not('email', 'is', null)
      .range(offset, offset + pageSize - 1);

    if (pageErr) {
      console.error(`Failed to load members_private page at offset ${offset}:`, pageErr);
      process.exit(1);
    }
    if (!page || page.length === 0) break;

    for (const row of page as { member_id: string; email: string | null }[]) {
      if (row.email) emailToUuid.set(row.email.toLowerCase().trim(), row.member_id);
    }

    if (page.length < pageSize) break;
    offset += pageSize;
  }
  console.log(`Loaded ${emailToUuid.size} member emails from members_private\n`);

  const log: string[] = [];
  let toUpdate = 0;
  let noHash = 0;
  let noMatch = 0;
  let banned = 0;
  let errors = 0;
  let done = 0;
  const updates: { member_id: string; username: string; email: string; hash: string }[] = [];

  // Prepare all updates
  for (const row of rows) {
    const email = row.courriel?.trim().toLowerCase();
    const username = row.nom_utilisateur?.trim();
    const hash = row.mot_passe?.trim();

    if (row.bannie === '1') { banned++; continue; }
    if (!hash || hash === 'NULL' || !/^[a-f0-9]{32}$/i.test(hash)) {
      noHash++;
      continue;
    }
    if (!email || email === 'null' || !email.includes('@')) continue;

    const uuid = emailToUuid.get(email);
    if (!uuid) {
      noMatch++;
      log.push(`NO MATCH: ${username} <${email}>`);
      continue;
    }

    updates.push({ member_id: uuid, username, email, hash: hash.toLowerCase() });
    toUpdate++;
  }

  console.log(`Plan:`);
  console.log(`  To update: ${toUpdate}`);
  console.log(`  Banned (skipped): ${banned}`);
  console.log(`  No hash in CSV: ${noHash}`);
  console.log(`  No auth.users match: ${noMatch}`);
  console.log(`\nSample of first 5 updates:`);
  for (const u of updates.slice(0, 5)) {
    console.log(`  [${u.member_id.slice(0, 8)}...] ${u.username} <${u.email}> → ${u.hash.slice(0, 8)}…`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No DB writes performed.');
    const logPath = resolve(__dirname, '..', 'backfill-legacy-passwords.log');
    writeFileSync(logPath, log.join('\n'), 'utf-8');
    console.log(`\nNo-match log: ${logPath}`);
    return;
  }

  // Apply updates in batches
  console.log(`\nApplying ${updates.length} updates to members_private...`);
  for (const u of updates) {
    const { error } = await supabase
      .from('members_private')
      .upsert(
        {
          member_id: u.member_id,
          email: u.email,
          legacy_password_hash: u.hash,
          password_migrated: false,
        },
        { onConflict: 'member_id' },
      );

    if (error) {
      log.push(`ERROR [${u.username}]: ${error.message}`);
      errors++;
    } else {
      done++;
    }
    if ((done + errors) % 50 === 0) {
      console.log(`  ... ${done + errors}/${updates.length} processed`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(`\nDone!`);
  console.log(`  Updated: ${done}`);
  console.log(`  Errors: ${errors}`);

  const logPath = resolve(__dirname, '..', 'backfill-legacy-passwords.log');
  writeFileSync(logPath, log.join('\n'), 'utf-8');
  console.log(`\nLog: ${logPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
