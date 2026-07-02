/**
 * Remove inactive imported accounts from Supabase
 *
 * Keeps:
 * - Accounts that signed in on fanstribune.com (last_sign_in_at IS NOT NULL)
 * - Accounts matching legacy active members (active since 2024 on old site)
 * - The bot account
 *
 * Usage:
 *   1. First, export active member IDs from phpMyAdmin:
 *      SELECT DISTINCT no_membre FROM log_acces WHERE date_heure_log >= '2024-01-01' AND no_membre > 0
 *   2. Set ACTIVE_LEGACY_IDS below with those IDs
 *   3. Run: npx tsx scripts/cleanup-inactive.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Load .env
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

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BOT_ID = '00000000-0000-0000-0000-000000000001';

// --- CSV parser (reuse from import script) ---

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ',') { result.push(current); current = ''; }
      else current += char;
    }
  }
  result.push(current);
  return result;
}

async function main() {
  // Step 1: Load legacy member CSV to map no_membre → email
  const memberCsvPath = resolve(__dirname, '..', 'membre.csv');
  const memberContent = readFileSync(memberCsvPath, 'utf-8');
  const memberLines = memberContent.split('\n');
  const memberHeaders = parseCsvLine(memberLines[0]);
  const noMembreIdx = memberHeaders.indexOf('no_membre');
  const courrielIdx = memberHeaders.indexOf('courriel');

  const legacyIdToEmail = new Map<string, string>();
  for (let i = 1; i < memberLines.length; i++) {
    const line = memberLines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const id = values[noMembreIdx];
    const email = values[courrielIdx]?.toLowerCase().trim();
    if (id && email && email.includes('@')) {
      legacyIdToEmail.set(id, email);
    }
  }
  console.log(`Loaded ${legacyIdToEmail.size} legacy member emails`);

  // Step 2: Active legacy IDs (from phpMyAdmin query)
  // SELECT DISTINCT no_membre FROM log_acces WHERE date_heure_log >= '2024-01-01' AND no_membre > 0
  // You need to paste these IDs here:
  const ACTIVE_LEGACY_IDS: string[] = [];

  // Auto-detect: read from active-ids.txt if it exists
  const activeIdsPath = resolve(__dirname, '..', 'active-ids.txt');
  try {
    const idsContent = readFileSync(activeIdsPath, 'utf-8');
    for (const line of idsContent.split('\n')) {
      const id = line.trim().replace(/"/g, '');
      if (id && /^\d+$/.test(id)) ACTIVE_LEGACY_IDS.push(id);
    }
  } catch {
    console.error('Missing active-ids.txt! Export active member IDs from phpMyAdmin first.');
    console.error('Run this in phpMyAdmin:');
    console.error("  SELECT DISTINCT no_membre FROM log_acces WHERE date_heure_log >= '2024-01-01' AND no_membre > 0");
    console.error('Save the result as active-ids.txt (one ID per line) in the project root.');
    process.exit(1);
  }

  console.log(`Active legacy members: ${ACTIVE_LEGACY_IDS.length}`);

  // Step 3: Build set of emails to KEEP
  const keepEmails = new Set<string>();
  for (const id of ACTIVE_LEGACY_IDS) {
    const email = legacyIdToEmail.get(id);
    if (email) keepEmails.add(email);
  }
  console.log(`Emails to keep (active legacy): ${keepEmails.size}`);

  // Step 4: Load ALL Supabase users (paginate)
  const allUsers: { id: string; email?: string; last_sign_in_at?: string | null }[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error('Error listing users:', error.message);
      break;
    }
    if (!data?.users || data.users.length === 0) break;
    allUsers.push(...data.users);
    console.log(`  Loaded page ${page}: ${data.users.length} users (total: ${allUsers.length})`);
    if (data.users.length < 1000) break;
    page++;
  }
  console.log(`Total Supabase users: ${allUsers.length}`);

  // Step 5: Decide who to delete
  const toDelete: { id: string; email: string }[] = [];
  let keptSignedIn = 0;
  let keptActive = 0;
  let keptBot = 0;

  for (const user of allUsers) {
    // Keep bot
    if (user.id === BOT_ID) { keptBot++; continue; }

    // Keep users who signed in on fanstribune.com
    if (user.last_sign_in_at) { keptSignedIn++; continue; }

    // Keep active legacy members
    const email = user.email?.toLowerCase() ?? '';
    if (keepEmails.has(email)) { keptActive++; continue; }

    // Delete the rest
    toDelete.push({ id: user.id, email });
  }

  console.log(`\nDecision:`);
  console.log(`  Keep (signed in on new site): ${keptSignedIn}`);
  console.log(`  Keep (active on old site): ${keptActive}`);
  console.log(`  Keep (bot): ${keptBot}`);
  console.log(`  TO DELETE: ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('\nNothing to delete!');
    return;
  }

  // Confirm
  console.log(`\nDeleting ${toDelete.length} inactive accounts...`);

  const log: string[] = [];
  let deleted = 0;
  let errors = 0;

  for (const user of toDelete) {
    try {
      // Delete from members tables first (cascade should handle it but just in case)
      await supabase.from('community_members').delete().eq('member_id', user.id);
      await supabase.from('members_private').delete().eq('member_id', user.id);
      await supabase.from('members').delete().eq('id', user.id);

      // Delete auth user
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) {
        log.push(`ERROR: ${user.email} — ${error.message}`);
        errors++;
      } else {
        log.push(`DELETED: ${user.email}`);
        deleted++;
      }

      if (deleted % 100 === 0 && deleted > 0) {
        console.log(`  ... ${deleted} deleted so far`);
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      log.push(`ERROR: ${user.email} — ${String(err)}`);
      errors++;
    }
  }

  console.log(`\nDone!`);
  console.log(`  Deleted: ${deleted}`);
  console.log(`  Errors: ${errors}`);

  const logPath = resolve(__dirname, '..', 'cleanup-results.log');
  writeFileSync(logPath, log.join('\n'), 'utf-8');
  console.log(`Full log: ${logPath}`);
}

main().catch(console.error);
