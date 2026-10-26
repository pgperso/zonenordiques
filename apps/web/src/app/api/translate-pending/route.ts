import { NextResponse } from 'next/server';
import { getBrandCommunityIds } from '@/lib/brandScope';
import Anthropic from '@anthropic-ai/sdk';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { TRANSLATION_CUTOFF } from '@arena/shared';
import { createClient } from '@/lib/supabase/server';
import { consumeRateLimit } from '@/lib/rateLimit';
import { isCronRequest, isSameOrigin, CROSS_SITE_REFUSED } from '@/lib/requestGuards';

// One Claude call per field (see translateText). Long bodies can take 20-40s, so the
// batch is kept small and the loops honour a soft time budget (below) that
// stops cleanly before Vercel kills the function — no more 504 timeouts.
export const maxDuration = 120;

// Stop starting new items once this much wall-clock has elapsed, leaving room
// for the in-flight Claude call to finish well under maxDuration. Each call
// still saves its result before the next begins, so a stopped batch simply
// resumes on the next invocation (translated items are skipped).
const TIME_BUDGET_MS = 90_000;

const ARTICLE_BATCH = 3;
const PODCAST_BATCH = 4;
const MODEL = 'claude-haiku-4-5-20251001';

/**
 * Allow the Vercel cron (bearer CRON_SECRET) or any signed-in member —
 * the publish flow pokes this endpoint so a fresh article is translated
 * within seconds. The work is a bounded, idempotent batch: once content
 * is translated it is skipped, so repeated calls cost nothing.
 */
async function authorize(request: Request): Promise<{ ok: boolean; userId: string | null }> {
  if (isCronRequest(request)) return { ok: true, userId: null };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { ok: Boolean(user), userId: user?.id ?? null };
}

function langName(code: string): string {
  return code === 'en' ? 'English' : 'French (Québec)';
}

const looksLikeHtml = (s: string) => /<[a-z][^>]*>/i.test(s);

/** A paragraph with no visible text (`<p> </p>`, `<p>&nbsp;</p>`, `<p><br></p>`). */
const EMPTY_PARAGRAPH = /<p\b[^>]*>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/p>/gi;

/** Tag names in document order (`p`, `/p`, `strong`, …) — the HTML skeleton. */
function tagSkeleton(html: string): string[] {
  return Array.from(html.matchAll(/<(\/?[a-z][a-z0-9]*)/gi), (m) => m[1].toLowerCase());
}

/**
 * Translate one field as plain text; null when the result can't be trusted.
 *
 * Each field is its own call with the translation as the whole reply. The
 * previous design asked for every field inside one JSON object and parsed
 * it, which broke on any article quoting someone: the English text came back
 * with unescaped `"` and JSON.parse failed, so those articles were skipped
 * forever without a trace. Forcing JSON with structured outputs fixed the
 * parse but made Haiku stop long bodies a third of the way through while
 * still reporting end_turn. Plain text has neither failure mode.
 */
async function translateText(
  client: Anthropic,
  sourceLang: string,
  text: string,
  label: string,
): Promise<string | null> {
  const target = sourceLang === 'fr' ? 'en' : 'fr';
  const html = looksLikeHtml(text);
  let system = `You translate content for a Québec sports community website from ${langName(sourceLang)} to ${langName(target)}. Keep sports terminology, team names and a natural journalistic tone. Translate the whole input — never summarize, shorten, or add commentary. Reply with the translation only.`;
  if (html) {
    system += ' The input is an HTML fragment: keep every tag and attribute exactly as is and translate only the human-readable text.';
  }

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: text }],
  });

  if (res.stop_reason !== 'end_turn') {
    console.warn(`[translate-pending] ${label}: stop_reason ${res.stop_reason}, skipped`);
    return null;
  }
  let out = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  if (!out) {
    console.warn(`[translate-pending] ${label}: empty translation, skipped`);
    return null;
  }
  if (html) {
    // Haiku sometimes inserts a blank paragraph before a heading (seen on
    // article 658, every run). That is not lost content, so empty paragraphs
    // don't count in the comparison; any it added are removed so the English
    // layout matches the French one.
    if (!EMPTY_PARAGRAPH.test(text)) out = out.replace(EMPTY_PARAGRAPH, '');
    EMPTY_PARAGRAPH.lastIndex = 0;
    const skeleton = (h: string) => tagSkeleton(h.replace(EMPTY_PARAGRAPH, '')).join(' ');
    // A dropped, added or mangled tag means lost or broken content — don't store it.
    if (skeleton(out) !== skeleton(text)) {
      console.warn(`[translate-pending] ${label}: HTML structure changed, skipped`);
      return null;
    }
  }
  return out;
}

/** Translate a set of named fields; returns the same keys, or null if any field fails. */
async function translateFields(
  client: Anthropic,
  sourceLang: string,
  fields: Record<string, string>,
  label: string,
): Promise<Record<string, string> | null> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const translated = await translateText(client, sourceLang, value, `${label}.${key}`);
    if (translated === null) return null;
    out[key] = translated;
  }
  return out;
}

async function handle(request: Request) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // The Vercel cron (no userId) is trusted; a user-triggered call (the publish
    // poke, or a manual hit) is rate-limited so it can't be scripted to spend
    // Anthropic credits in a loop. The batch is idempotent, so being throttled
    // just defers to the next poke / the daily cron.
    if (auth.userId) {
      const { allowed } = await consumeRateLimit(`translate-pending:${auth.userId}`, 20, 60 * 60);
      if (!allowed) {
        return NextResponse.json({ ok: true, articlesDone: 0, podcastsDone: 0, throttled: true });
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!apiKey || !serviceKey || !supabaseUrl) {
      return NextResponse.json({ error: 'Configuration manquante' }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });
    const admin = createServiceClient(supabaseUrl, serviceKey);

    // Scope the backlog to this brand's tribunes.
    //
    // vercel.json ships with the codebase, so all three deployments register
    // the same 06:00 cron. Unscoped, the three ran the same deterministic
    // query, picked the SAME three articles, and each paid Anthropic to
    // translate them — 3x the bill for no extra throughput, with the last
    // writer's output winning. Scoping also makes each site responsible for
    // its own backlog instead of racing for a shared one.
    const brandIds = await getBrandCommunityIds(admin as never);
    if (brandIds.length === 0) {
      return NextResponse.json({ ok: true, articlesDone: 0, podcastsDone: 0, noBrandScope: true });
    }

    const startedAt = Date.now();
    const outOfTime = () => Date.now() - startedAt > TIME_BUDGET_MS;

    let articlesDone = 0;
    let podcastsDone = 0;

    // ── Articles ──
    // Gated by TRANSLATION_CUTOFF (migration boundary), NOT the visibility
    // cutoff: the ~631 legacy imports stay visible everywhere but are never
    // machine-translated. Only articles written on the new platform (published
    // from 2026-07-07 on) are eligible here.
    const { data: articles } = await admin
      .from('articles')
      .select('id, source_lang, title, excerpt, body')
      .in('community_id', brandIds)
      .eq('is_published', true)
      .eq('is_removed', false)
      .gte('published_at', TRANSLATION_CUTOFF)
      .is('translated_at', null)
      .order('published_at', { ascending: false })
      .limit(ARTICLE_BATCH);

    for (const a of (articles ?? []) as {
      id: number; source_lang: string | null; title: string; excerpt: string | null; body: string;
    }[]) {
      if (outOfTime()) break;
      const fields: Record<string, string> = { title: a.title, body: a.body };
      if (a.excerpt) fields.excerpt = a.excerpt;
      const out = await translateFields(client, a.source_lang ?? 'fr', fields, `article ${a.id}`);
      if (!out || !out.title || !out.body) continue;
      await admin
        .from('articles')
        .update({
          title_translated: out.title,
          excerpt_translated: out.excerpt ?? null,
          body_translated: out.body,
          translated_at: new Date().toISOString(),
        })
        .eq('id', a.id);
      articlesDone++;
    }

    // ── Podcasts ──
    // Same migration boundary as articles: legacy imported podcasts (created
    // during the 2026-07-06 migration) are left untranslated; only podcasts
    // added on the new platform are eligible. Gated on created_at since
    // podcasts have no published_at column.
    const { data: podcasts } = await admin
      .from('podcasts')
      .select('id, source_lang, title, description')
      .in('community_id', brandIds)
      .is('translated_at', null)
      .gte('created_at', TRANSLATION_CUTOFF)
      .order('created_at', { ascending: false })
      .limit(PODCAST_BATCH);

    for (const p of (podcasts ?? []) as {
      id: number; source_lang: string | null; title: string; description: string | null;
    }[]) {
      if (outOfTime()) break;
      const fields: Record<string, string> = { title: p.title };
      if (p.description) fields.description = p.description;
      const out = await translateFields(client, p.source_lang ?? 'fr', fields, `podcast ${p.id}`);
      if (!out || !out.title) continue;
      await admin
        .from('podcasts')
        .update({
          title_translated: out.title,
          description_translated: out.description ?? null,
          translated_at: new Date().toISOString(),
        })
        .eq('id', p.id);
      podcastsDone++;
    }

    return NextResponse.json({ ok: true, articlesDone, podcastsDone });
  } catch (err) {
    console.error('[translate-pending]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}

// Refuse cross-site initiations (CSRF via top-level GET with the Lax cookie);
// allow the cron bearer or same-origin / user-initiated requests.
function guard(request: Request) {
  return isCronRequest(request) || isSameOrigin(request);
}
export function GET(request: Request) {
  if (!guard(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });
  return handle(request);
}

export function POST(request: Request) {
  if (!guard(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });
  return handle(request);
}
