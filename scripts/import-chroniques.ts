/**
 * Import chroniques (articles) from legacy Zone Nordiques MySQL export (chronique.csv)
 *
 * Usage:
 *   npx tsx scripts/import-chroniques.ts
 *
 * Reads .env for SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
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

// --- CSV Parser (handles multi-line quoted fields) ---

interface ChroniqueRow {
  no_chronique: string;
  no_membre: string;
  chronique_titre: string;
  chronique_contenu: string;
  creation_date: string;
  etat: string;
  etat_date: string;
}

function parseCsv(content: string): ChroniqueRow[] {
  const rows: ChroniqueRow[] = [];
  const lines = content.split('\n');

  // Get headers from first line
  const headers = parseCsvLine(lines[0]);

  let currentLine = '';
  let inQuotes = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    if (!inQuotes && currentLine === '') {
      // Start of a new record
      currentLine = line;
    } else {
      // Continuation of a multi-line field
      currentLine += '\n' + line;
    }

    // Count unescaped quotes to determine if we're still inside a quoted field
    inQuotes = isInsideQuotes(currentLine);

    if (!inQuotes) {
      // We have a complete record
      const values = parseCsvLine(currentLine);
      if (values.length >= headers.length) {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] ?? '';
        });
        rows.push(row as unknown as ChroniqueRow);
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
      if (i + 1 < line.length && line[i + 1] === '"') {
        i++; // Skip escaped quote
      } else {
        count++;
      }
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

// --- Slug generator ---

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// --- HTML cleanup ---

function cleanHtml(html: string): string {
  // Decode HTML entities
  let clean = html
    .replace(/&agrave;/g, 'à').replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è')
    .replace(/&ecirc;/g, 'ê').replace(/&ocirc;/g, 'ô').replace(/&ucirc;/g, 'û')
    .replace(/&iuml;/g, 'ï').replace(/&ccedil;/g, 'ç').replace(/&Agrave;/g, 'À')
    .replace(/&Eacute;/g, 'É').replace(/&Egrave;/g, 'È').replace(/&Ecirc;/g, 'Ê')
    .replace(/&Ocirc;/g, 'Ô').replace(/&Ucirc;/g, 'Û').replace(/&Ccedil;/g, 'Ç')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&laquo;/g, '"').replace(/&raquo;/g, '"')
    .replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"').replace(/&ldquo;/g, '"')
    .replace(/&ndash;/g, "-").replace(/&mdash;/g, "-")
    .replace(/&hellip;/g, "...");

  // Remove legacy CSS classes
  clean = clean.replace(/ class="[^"]*"/g, '');

  // Wrap in paragraph if no tags
  if (!clean.includes('<p') && !clean.includes('<div')) {
    clean = `<p>${clean}</p>`;
  }

  return clean.trim();
}

function extractExcerpt(html: string): string {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 155);
}

// --- Main ---

async function main() {
  const csvPath = resolve(__dirname, '..', 'chronique.csv');
  const content = readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(content);

  console.log(`Parsed ${rows.length} chroniques from CSV`);

  // Load member mapping: legacy no_membre → email → Supabase UUID
  const memberCsvPath = resolve(__dirname, '..', 'membre.csv');
  const memberContent = readFileSync(memberCsvPath, 'utf-8');
  const memberRows = parseCsv(memberContent) as unknown as { no_membre: string; courriel: string; nom_utilisateur: string }[];

  // Build legacy ID → email map
  const legacyToEmail = new Map<string, string>();
  for (const m of memberRows) {
    if (m.courriel && m.courriel !== 'NULL' && m.courriel.includes('@')) {
      legacyToEmail.set(m.no_membre, m.courriel.toLowerCase().trim());
    }
  }

  // Load Supabase users: email → UUID
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 10000 });
  const emailToUuid = new Map<string, string>();
  if (authUsers?.users) {
    for (const u of authUsers.users) {
      if (u.email) emailToUuid.set(u.email.toLowerCase(), u.id);
    }
  }
  console.log(`Loaded ${emailToUuid.size} Supabase users`);

  // Get community ID for nordiques-quebec
  const { data: community } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', 'nordiques-quebec')
    .single();

  if (!community) {
    console.error('Community nordiques-quebec not found!');
    process.exit(1);
  }
  const communityId = (community as { id: number }).id;
  console.log(`Target community: nordiques-quebec (ID: ${communityId})`);

  // Find your own UUID as fallback author
  const { data: fallbackUser } = await supabase
    .from('members')
    .select('id')
    .eq('username', 'QcFan')
    .single();
  const fallbackAuthorId = (fallbackUser as { id: string } | null)?.id;
  console.log(`Fallback author: QcFan (${fallbackAuthorId})`);

  const log: string[] = [];
  let created = 0;
  let skipped = 0;
  let errors = 0;
  const usedSlugs = new Set<string>();

  for (const row of rows) {
    const title = row.chronique_titre?.trim();
    if (!title) {
      log.push(`SKIP (no title): chronique #${row.no_chronique}`);
      skipped++;
      continue;
    }

    if (row.etat !== 'publie') {
      log.push(`SKIP (not published): "${title}"`);
      skipped++;
      continue;
    }

    const body = cleanHtml(row.chronique_contenu || '');
    if (!body || body.length < 10) {
      log.push(`SKIP (no content): "${title}"`);
      skipped++;
      continue;
    }

    // Resolve author
    const legacyMemberId = row.no_membre;
    const email = legacyToEmail.get(legacyMemberId);
    let authorId = email ? emailToUuid.get(email) : undefined;
    if (!authorId) authorId = fallbackAuthorId;
    if (!authorId) {
      log.push(`SKIP (no author): "${title}" (legacy member #${legacyMemberId})`);
      skipped++;
      continue;
    }

    // Generate unique slug
    let slug = slugify(title);
    if (!slug) slug = `chronique-${row.no_chronique}`;
    if (usedSlugs.has(slug)) {
      slug = `${slug}-${row.no_chronique}`;
    }
    usedSlugs.add(slug);

    // Parse date
    const publishedAt = row.etat_date || row.creation_date || new Date().toISOString();
    const excerpt = extractExcerpt(body);

    try {
      const { error } = await supabase.from('articles').insert({
        community_id: communityId,
        author_id: authorId,
        title,
        slug,
        excerpt,
        body,
        cover_image_url: null,
        is_published: true,
        published_at: publishedAt,
        is_removed: false,
      } as never);

      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          log.push(`SKIP (duplicate slug): "${title}" (${slug})`);
          skipped++;
        } else {
          log.push(`ERROR: "${title}" — ${error.message}`);
          errors++;
        }
        continue;
      }

      log.push(`OK: "${title}" (${slug}) → ${publishedAt}`);
      created++;

      if (created % 50 === 0) {
        console.log(`  ... ${created} created so far`);
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      log.push(`ERROR: "${title}" — ${String(err)}`);
      errors++;
    }
  }

  console.log(`\nDone!`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors:  ${errors}`);

  const logPath = resolve(__dirname, '..', 'import-chroniques.log');
  writeFileSync(logPath, log.join('\n'), 'utf-8');
  console.log(`\nFull log: ${logPath}`);
}

main().catch(console.error);
