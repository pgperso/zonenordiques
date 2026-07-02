/**
 * Fix article authors — map legacy no_membre to Supabase UUID via email
 *
 * Usage: npx tsx scripts/fix-article-authors.ts
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

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- CSV helpers ---

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

function parseCsvMultiline(content: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines = content.split('\n');
  const headers = parseCsvLine(lines[0]);

  let currentLine = '';
  let inQuotes = false;

  for (let i = 1; i < lines.length; i++) {
    if (!inQuotes && currentLine === '') {
      currentLine = lines[i];
    } else {
      currentLine += '\n' + lines[i];
    }
    inQuotes = isInsideQuotes(currentLine);

    if (!inQuotes) {
      const values = parseCsvLine(currentLine);
      if (values.length >= headers.length) {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
        rows.push(row);
      }
      currentLine = '';
    }
  }
  return rows;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function main() {
  // Step 1: Load membre.csv — map no_membre → email
  const memberContent = readFileSync(resolve(__dirname, '..', 'membre.csv'), 'utf-8');
  const memberLines = memberContent.split('\n');
  const memberHeaders = parseCsvLine(memberLines[0]);
  const noMembreIdx = memberHeaders.indexOf('no_membre');
  const courrielIdx = memberHeaders.indexOf('courriel');
  const nomUtilIdx = memberHeaders.indexOf('nom_utilisateur');

  const legacyIdToEmail = new Map<string, string>();
  const legacyIdToUsername = new Map<string, string>();
  for (let i = 1; i < memberLines.length; i++) {
    const line = memberLines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const id = values[noMembreIdx];
    const email = values[courrielIdx]?.toLowerCase().trim();
    const username = values[nomUtilIdx]?.trim();
    if (id && email && email.includes('@')) legacyIdToEmail.set(id, email);
    if (id && username) legacyIdToUsername.set(id, username);
  }
  console.log(`Loaded ${legacyIdToEmail.size} legacy member emails`);

  // Step 2: Load chronique.csv — map slug → no_membre
  const chroniqueContent = readFileSync(resolve(__dirname, '..', 'chronique.csv'), 'utf-8');
  const chroniques = parseCsvMultiline(chroniqueContent);
  console.log(`Loaded ${chroniques.length} chroniques`);

  // Build slug → legacy author mapping
  const slugToLegacyId = new Map<string, string>();
  const usedSlugs = new Set<string>();
  for (const c of chroniques) {
    if (c.etat !== 'publie') continue;
    const title = c.chronique_titre?.trim();
    if (!title) continue;
    let slug = slugify(title);
    if (!slug) slug = `chronique-${c.no_chronique}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${c.no_chronique}`;
    usedSlugs.add(slug);
    slugToLegacyId.set(slug, c.no_membre);
  }
  console.log(`Mapped ${slugToLegacyId.size} slugs to legacy authors`);

  // Step 3: For each unique legacy email, find UUID in Supabase via members_private
  const emailToUuid = new Map<string, string>();
  const uniqueEmails = new Set<string>();
  for (const [, email] of legacyIdToEmail) uniqueEmails.add(email);

  console.log(`Looking up ${uniqueEmails.size} unique emails...`);

  // Query in batches of 50
  const emailArray = Array.from(uniqueEmails);
  for (let i = 0; i < emailArray.length; i += 50) {
    const batch = emailArray.slice(i, i + 50);
    const { data } = await supabase
      .from('members_private')
      .select('member_id, email')
      .in('email', batch);

    if (data) {
      for (const row of data) {
        const r = row as { member_id: string; email: string };
        emailToUuid.set(r.email.toLowerCase(), r.member_id);
      }
    }
  }
  console.log(`Found ${emailToUuid.size} Supabase UUIDs by email`);

  // Step 4: Load all articles with QcFan as author
  const QCFAN_ID = '63bfde89-d4a6-486f-91a4-8ab896fa49d7';
  const { data: articles } = await supabase
    .from('articles')
    .select('id, slug, author_id')
    .eq('author_id', QCFAN_ID)
    .limit(1000);

  if (!articles) {
    console.log('No articles found');
    return;
  }
  console.log(`Found ${articles.length} articles to fix`);

  // Step 5: Update each article
  const log: string[] = [];
  let updated = 0;
  let skipped = 0;

  for (const article of articles) {
    const a = article as { id: number; slug: string; author_id: string };
    const legacyId = slugToLegacyId.get(a.slug);
    if (!legacyId) {
      log.push(`SKIP (no legacy mapping): ${a.slug}`);
      skipped++;
      continue;
    }

    const email = legacyIdToEmail.get(legacyId);
    if (!email) {
      log.push(`SKIP (no email): ${a.slug} (legacy #${legacyId})`);
      skipped++;
      continue;
    }

    const uuid = emailToUuid.get(email);
    if (!uuid) {
      // Use author_name_override instead
      const username = legacyIdToUsername.get(legacyId);
      if (username) {
        await supabase
          .from('articles')
          .update({ author_name_override: username } as never)
          .eq('id', a.id);
        log.push(`OVERRIDE: ${a.slug} → ${username} (no Supabase account)`);
        updated++;
      } else {
        log.push(`SKIP (no UUID, no username): ${a.slug}`);
        skipped++;
      }
      continue;
    }

    // Don't update if it's already QcFan and the real author IS QcFan
    if (uuid === QCFAN_ID) {
      log.push(`OK (already correct): ${a.slug}`);
      skipped++;
      continue;
    }

    await supabase
      .from('articles')
      .update({ author_id: uuid } as never)
      .eq('id', a.id);

    log.push(`UPDATED: ${a.slug} → ${email} (${uuid})`);
    updated++;

    if (updated % 50 === 0) {
      console.log(`  ... ${updated} updated so far`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(`\nDone!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);

  writeFileSync(resolve(__dirname, '..', 'fix-authors.log'), log.join('\n'), 'utf-8');
  console.log('Full log: fix-authors.log');
}

main().catch(console.error);
