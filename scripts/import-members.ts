/**
 * Import members from legacy Zone Nordiques MySQL export (membre.csv)
 *
 * Usage:
 *   1. Set env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   2. Run: npx tsx scripts/import-members.ts
 *
 * What it does:
 *   - Reads membre.csv
 *   - Creates Supabase Auth users (email_confirm: true, random password)
 *   - The handle_new_user() trigger auto-creates the members row
 *   - After creation, updates members with legacy username
 *   - Skips banned users and users without email
 *   - Logs results to import-results.log
 *
 * Users will need to use "Forgot password" on first login.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Load .env from project root
const envPath = resolve(__dirname, '..', '.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
} catch { /* no .env file */ }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface CsvRow {
  no_membre: string;
  nom_utilisateur: string;
  courriel: string;
  prenom: string;
  nom: string;
  bannie: string;
  description: string;
  avatar: string;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row as unknown as CsvRow);
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
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

function generatePassword(): string {
  return `Import_${crypto.randomUUID().slice(0, 12)}!`;
}

function cleanUsername(raw: string): string {
  let clean = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  if (clean.length < 3) clean = `user_${raw.slice(0, 8)}`;
  return clean.slice(0, 50);
}

async function main() {
  const csvPath = resolve(__dirname, '..', 'membre.csv');
  const content = readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(content);

  console.log(`Parsed ${rows.length} rows from CSV`);

  const log: string[] = [];
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const email = row.courriel?.trim().toLowerCase();
    const username = row.nom_utilisateur?.trim();
    const banned = row.bannie?.trim();

    // Skip banned, no email, no username
    if (banned === '1') {
      log.push(`SKIP (banned): ${username} <${email}>`);
      skipped++;
      continue;
    }
    if (!email || email === 'null' || !email.includes('@')) {
      log.push(`SKIP (no email): ${username}`);
      skipped++;
      continue;
    }
    if (!username || username === 'NULL') {
      log.push(`SKIP (no username): ${email}`);
      skipped++;
      continue;
    }

    const cleanName = cleanUsername(username);
    const password = generatePassword();

    try {
      // Create auth user
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username: cleanName },
      });

      if (error) {
        if (error.message.includes('already been registered')) {
          log.push(`SKIP (exists): ${cleanName} <${email}>`);
          skipped++;
        } else {
          log.push(`ERROR: ${cleanName} <${email}> — ${error.message}`);
          errors++;
        }
        continue;
      }

      // Update member row with original username (trigger creates with cleanName)
      if (data.user) {
        await supabase
          .from('members')
          .update({ username: cleanName })
          .eq('id', data.user.id);
      }

      log.push(`OK: ${cleanName} <${email}>`);
      created++;

      // Rate limiting — Supabase free tier: ~30 req/s
      if (created % 25 === 0) {
        console.log(`  ... ${created} created so far`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err) {
      log.push(`ERROR: ${cleanName} <${email}> — ${String(err)}`);
      errors++;
    }
  }

  console.log(`\nDone!`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors:  ${errors}`);

  const logPath = resolve(__dirname, '..', 'import-results.log');
  writeFileSync(logPath, log.join('\n'), 'utf-8');
  console.log(`\nFull log: ${logPath}`);
}

main().catch(console.error);
