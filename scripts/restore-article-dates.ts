/**
 * Restore real historical dates for articles imported from legacy Zone Nordiques.
 *
 * Context: articles were imported with `published_at` set to the real historical
 * `creation_date` from chronique.csv — but some ended up at the import date
 * (2026-03-30) because the original CSV dates were empty/null or a previous
 * manual SQL update overwrote them. This script matches articles by title and
 * author, and restores the real `creation_date` (falling back to `etat_date`).
 *
 * Usage:
 *   npx tsx scripts/restore-article-dates.ts [--dry-run]
 *
 * Reads .env for SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
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
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- CSV Parser (copied from import-chroniques.ts) ---

interface ChroniqueRow {
  no_chronique: string;
  no_membre: string;
  chronique_titre: string;
  chronique_contenu: string;
  creation_date: string;
  etat: string;
  etat_date: string;
}

interface MembreRow {
  no_membre: string;
  nom_utilisateur: string;
  courriel: string;
}

function parseCsv<T>(content: string): T[] {
  const rows: T[] = [];
  const lines = content.split('\n');
  const headers = parseCsvLine(lines[0]);

  let currentLine = '';
  let inQuotes = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!inQuotes && currentLine === '') {
      currentLine = line;
    } else {
      currentLine += '\n' + line;
    }
    inQuotes = isInsideQuotes(currentLine);
    if (!inQuotes) {
      const values = parseCsvLine(currentLine);
      if (values.length >= headers.length) {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] ?? '';
        });
        rows.push(row as T);
      }
      currentLine = '';
    }
  }
  return rows;
}

function isInsideQuotes(line: string): boolean {
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (i + 1 < line.length && line[i + 1] === '"') i++;
      else count++;
    }
  }
  return count % 2 !== 0;
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

// --- Date normalization ---

function normalizeDate(raw: string): string | null {
  if (!raw || raw === 'NULL' || raw === '0000-00-00 00:00:00' || raw === '0000-00-00') {
    return null;
  }
  // MySQL formats: "2015-06-12 14:30:00" or "2015-06-12"
  const trimmed = raw.trim();
  const parsed = new Date(trimmed.replace(' ', 'T'));
  if (isNaN(parsed.getTime())) return null;
  // Reject obviously invalid dates (before 2000 or in the future)
  const year = parsed.getUTCFullYear();
  const now = new Date();
  if (year < 2000 || parsed > now) return null;
  return parsed.toISOString();
}

// --- Main ---

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE (will update DB)'}\n`);

  // 1. Parse CSVs
  const csvPath = resolve(__dirname, '..', 'chronique.csv');
  const rows = parseCsv<ChroniqueRow>(readFileSync(csvPath, 'utf-8'));
  console.log(`Parsed ${rows.length} chroniques from CSV`);

  const memberPath = resolve(__dirname, '..', 'membre.csv');
  const memberRows = parseCsv<MembreRow>(readFileSync(memberPath, 'utf-8'));
  console.log(`Parsed ${memberRows.length} members from CSV`);

  // 2. Build legacy no_membre → email map
  const legacyToEmail = new Map<string, string>();
  for (const m of memberRows) {
    if (m.courriel && m.courriel !== 'NULL' && m.courriel.includes('@')) {
      legacyToEmail.set(m.no_membre, m.courriel.toLowerCase().trim());
    }
  }

  // 3. Load Supabase auth users: email → UUID
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 10000 });
  const emailToUuid = new Map<string, string>();
  if (authUsers?.users) {
    for (const u of authUsers.users) {
      if (u.email) emailToUuid.set(u.email.toLowerCase(), u.id);
    }
  }

  // 4. Build CSV index: key (title + authorId) → best_date
  //    + fallback: title only → best_date (for articles where author resolution fails)
  const csvByTitleAndAuthor = new Map<string, string>();
  const csvByTitleOnly = new Map<string, { date: string; count: number }>();
  let csvUsable = 0;
  let csvSkippedNoTitle = 0;
  let csvSkippedNoDate = 0;

  for (const row of rows) {
    const title = row.chronique_titre?.trim();
    if (!title) { csvSkippedNoTitle++; continue; }

    // Prefer etat_date (publication date), fall back to creation_date
    const bestDate = normalizeDate(row.etat_date) ?? normalizeDate(row.creation_date);
    if (!bestDate) { csvSkippedNoDate++; continue; }

    const email = legacyToEmail.get(row.no_membre);
    const authorUuid = email ? emailToUuid.get(email) : undefined;

    if (authorUuid) {
      csvByTitleAndAuthor.set(`${title}||${authorUuid}`, bestDate);
    }

    // Also keep a title-only index (use earliest date if duplicate titles)
    const existing = csvByTitleOnly.get(title);
    if (!existing || new Date(bestDate) < new Date(existing.date)) {
      csvByTitleOnly.set(title, { date: bestDate, count: (existing?.count ?? 0) + 1 });
    } else {
      csvByTitleOnly.set(title, { ...existing, count: existing.count + 1 });
    }
    csvUsable++;
  }

  console.log(`\nCSV indexation:`);
  console.log(`  Usable chroniques: ${csvUsable}`);
  console.log(`  Skipped (no title): ${csvSkippedNoTitle}`);
  console.log(`  Skipped (no valid date): ${csvSkippedNoDate}`);
  console.log(`  Title+Author index size: ${csvByTitleAndAuthor.size}`);
  console.log(`  Title-only index size: ${csvByTitleOnly.size}`);

  // 5. Load all articles from DB
  const { data: articles, error: fetchErr } = await supabase
    .from('articles')
    .select('id, title, author_id, published_at, created_at')
    .eq('is_published', true)
    .eq('is_removed', false)
    .limit(10000);

  if (fetchErr) {
    console.error('Failed to fetch articles:', fetchErr);
    process.exit(1);
  }

  console.log(`\nLoaded ${articles?.length ?? 0} published articles from DB`);

  // 6. Match and prepare updates
  type Article = { id: number; title: string; author_id: string; published_at: string; created_at: string };
  const typedArticles = (articles ?? []) as Article[];

  const log: string[] = [];
  const updates: { id: number; newDate: string; oldDate: string; matchType: string }[] = [];
  let matchedByTitleAuthor = 0;
  let matchedByTitleOnly = 0;
  let noMatch = 0;
  let alreadyCorrect = 0;

  for (const a of typedArticles) {
    const key = `${a.title}||${a.author_id}`;
    const exactMatch = csvByTitleAndAuthor.get(key);
    const titleMatch = csvByTitleOnly.get(a.title);

    let newDate: string | null = null;
    let matchType = 'none';

    if (exactMatch) {
      newDate = exactMatch;
      matchType = 'title+author';
      matchedByTitleAuthor++;
    } else if (titleMatch && titleMatch.count === 1) {
      // Only use title-only match if unique (avoid wrong matches)
      newDate = titleMatch.date;
      matchType = 'title-only (unique)';
      matchedByTitleOnly++;
    } else {
      noMatch++;
      log.push(`NO MATCH: "${a.title.slice(0, 80)}" (author ${a.author_id})`);
      continue;
    }

    // Check if already correct (within 1 day)
    const currentDate = new Date(a.published_at).getTime();
    const targetDate = new Date(newDate).getTime();
    const diffDays = Math.abs(currentDate - targetDate) / (1000 * 60 * 60 * 24);

    if (diffDays < 1) {
      alreadyCorrect++;
      continue;
    }

    updates.push({
      id: a.id,
      newDate,
      oldDate: a.published_at,
      matchType,
    });
  }

  console.log(`\nMatching summary:`);
  console.log(`  Matched by title+author: ${matchedByTitleAuthor}`);
  console.log(`  Matched by title-only:   ${matchedByTitleOnly}`);
  console.log(`  No match:                ${noMatch}`);
  console.log(`  Already correct:         ${alreadyCorrect}`);
  console.log(`  → Need update:           ${updates.length}`);

  if (updates.length === 0) {
    console.log('\nNothing to update. Done.');
    return;
  }

  // 7. Show sample
  console.log(`\nSample of updates (first 5):`);
  for (const u of updates.slice(0, 5)) {
    console.log(`  [${u.id}] ${u.oldDate.slice(0, 10)} → ${u.newDate.slice(0, 10)} (${u.matchType})`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No DB writes performed.');
    const logPath = resolve(__dirname, '..', 'restore-article-dates.log');
    writeFileSync(logPath, log.join('\n'), 'utf-8');
    console.log(`Log of no-matches written to: ${logPath}`);
    return;
  }

  // 8. Apply updates in batches
  console.log(`\nApplying ${updates.length} updates...`);
  let done = 0;
  let errors = 0;

  for (const u of updates) {
    const { error } = await supabase
      .from('articles')
      .update({
        published_at: u.newDate,
        created_at: u.newDate,
        updated_at: u.newDate,
      })
      .eq('id', u.id);

    if (error) {
      log.push(`UPDATE ERROR [${u.id}]: ${error.message}`);
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
  console.log(`  Errors:  ${errors}`);

  const logPath = resolve(__dirname, '..', 'restore-article-dates.log');
  writeFileSync(logPath, log.join('\n'), 'utf-8');
  console.log(`Log: ${logPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
