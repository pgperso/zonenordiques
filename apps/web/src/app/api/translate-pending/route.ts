import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { ORIGINAL_CONTENT_CUTOFF } from '@arena/shared';
import { createClient } from '@/lib/supabase/server';

// One Claude call per item; a batch of articles can take a while.
export const maxDuration = 60;

const ARTICLE_BATCH = 6;
const PODCAST_BATCH = 8;
const MODEL = 'claude-haiku-4-5-20251001';

/**
 * Allow the Vercel cron (bearer CRON_SECRET) or any signed-in member —
 * the publish flow pokes this endpoint so a fresh article is translated
 * within seconds. The work is a bounded, idempotent batch: once content
 * is translated it is skipped, so repeated calls cost nothing.
 */
async function authorize(request: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return Boolean(user);
}

function langName(code: string): string {
  return code === 'en' ? 'English' : 'French (Québec)';
}

/** Pull a JSON object out of Claude's reply, tolerating code fences. */
function extractJson(text: string): Record<string, string> | null {
  const stripped = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const candidate = stripped.match(/\{[\s\S]*\}/)?.[0] ?? stripped;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/** Translate a set of named fields; returns the same keys, or null on failure. */
async function translateFields(
  client: Anthropic,
  sourceLang: string,
  fields: Record<string, string>,
): Promise<Record<string, string> | null> {
  const target = sourceLang === 'fr' ? 'en' : 'fr';
  const prompt = `You are a professional translator for a Québec sports community website. Translate the JSON values below from ${langName(sourceLang)} to ${langName(target)}. Keep sports terminology, team names and a natural journalistic tone. Any value containing HTML must keep every tag and attribute exactly — translate only the human-readable text. Return ONLY a valid JSON object with the exact same keys, nothing else.

${JSON.stringify(fields, null, 2)}`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  // A truncated reply would store a half-translated body — skip it instead.
  if (res.stop_reason === 'max_tokens') return null;
  const block = res.content[0];
  if (!block || block.type !== 'text') return null;
  return extractJson(block.text);
}

async function handle(request: Request) {
  try {
    if (!(await authorize(request))) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!apiKey || !serviceKey || !supabaseUrl) {
      return NextResponse.json({ error: 'Configuration manquante' }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });
    const admin = createServiceClient(supabaseUrl, serviceKey);

    let articlesDone = 0;
    let podcastsDone = 0;

    // ── Articles ──
    // Only Fans Tribune's own content — legacy Zone Nordiques imports
    // (published before the cutoff) are noindex and never translated.
    const { data: articles } = await admin
      .from('articles')
      .select('id, source_lang, title, excerpt, body')
      .eq('is_published', true)
      .eq('is_removed', false)
      .gte('published_at', ORIGINAL_CONTENT_CUTOFF)
      .is('translated_at', null)
      .order('published_at', { ascending: false })
      .limit(ARTICLE_BATCH);

    for (const a of (articles ?? []) as {
      id: number; source_lang: string | null; title: string; excerpt: string | null; body: string;
    }[]) {
      const fields: Record<string, string> = { title: a.title, body: a.body };
      if (a.excerpt) fields.excerpt = a.excerpt;
      const out = await translateFields(client, a.source_lang ?? 'fr', fields);
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
    const { data: podcasts } = await admin
      .from('podcasts')
      .select('id, source_lang, title, description')
      .is('translated_at', null)
      .order('created_at', { ascending: false })
      .limit(PODCAST_BATCH);

    for (const p of (podcasts ?? []) as {
      id: number; source_lang: string | null; title: string; description: string | null;
    }[]) {
      const fields: Record<string, string> = { title: p.title };
      if (p.description) fields.description = p.description;
      const out = await translateFields(client, p.source_lang ?? 'fr', fields);
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
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
