import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { sanitizeArticleHtml, sanitizeArticleText } from '@/lib/sanitizeArticleHtml';

// Un seul appel Anthropic mais peut générer 4k tokens ; on laisse 60s de marge.
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const title = (body.title ?? '').trim().slice(0, 200);
    const excerpt = (body.excerpt ?? '').trim().slice(0, 200);
    const articleBody = (body.body ?? '').trim().slice(0, 15000);
    const instructions = (body.instructions ?? '').trim().slice(0, 1000);
    const isTaverne = body.isTaverne === true;

    if (!articleBody || !instructions) {
      return NextResponse.json({ error: 'Article et instructions requis' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Clé API Anthropic manquante' }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      // Refine rewrites published-bound prose — runs on Opus, the
      // strongest model, for the best editorial quality.
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Tu es un éditeur ${isTaverne ? '' : 'sportif '}québécois. Voici un article à améliorer.

ARTICLE ACTUEL :
Titre : ${title}
Résumé : ${excerpt}
Corps : ${articleBody}

INSTRUCTIONS DE L'UTILISATEUR (PRIORITAIRES) :
${instructions}

MISSION :
- Applique les instructions de l'utilisateur à la lettre
- Garde le contenu factuel existant sauf si l'utilisateur demande de changer
- Garde le même ton et style général sauf si l'utilisateur demande de changer
- Utilise des guillemets français « » jamais des guillemets doubles
- N'utilise JAMAIS le tiret cadratin (—) ni le tiret demi-cadratin (–)
- HTML : <p>, <h2>, <h3>, <strong>, <em>, <ul>, <li>, <blockquote>
- PAS de <h1>, pas de <html>/<head>/<body>
- NE PAS ajouter de section sources ni de mention IA

Réponds UNIQUEMENT en JSON valide :
{"title":"...","excerpt":"Résumé SEO 120-155 car","body":"<p>...</p>"}`,
      }],
    });

    const block = message.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') {
      return NextResponse.json({ error: 'Réponse IA invalide' }, { status: 500 });
    }

    let str = block.text.trim();
    if (str.startsWith('```')) str = str.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    let parsed: { title?: string; excerpt?: string; body?: string } | null = null;
    try {
      parsed = JSON.parse(str);
    } catch { /* fall through */ }

    if (!parsed) {
      const match = str.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
      }
    }

    if (!parsed || !parsed.title || !parsed.body) {
      return NextResponse.json({ error: 'Amélioration échouée. Réessayez.' }, { status: 500 });
    }

    const cleanBody = sanitizeArticleHtml(parsed.body.replace(/[—–]/g, '-'));
    const cleanTitle = sanitizeArticleText(parsed.title.replace(/[—–]/g, '-'));
    const cleanExcerpt = sanitizeArticleText((parsed.excerpt ?? '').replace(/[—–]/g, '-'));

    return NextResponse.json({ title: cleanTitle, excerpt: cleanExcerpt, body: cleanBody });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
