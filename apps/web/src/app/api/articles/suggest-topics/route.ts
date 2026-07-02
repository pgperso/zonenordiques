import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { fetchRecentNews } from '@/lib/newsSearch';
import { fetchUrlContent, extractUrls } from '@/lib/fetchUrlContent';
import { sanitizeArticleText } from '@/lib/sanitizeArticleHtml';

// Un appel Anthropic + fetch news — rarement plus de 15s, on met 30s pour marge.
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    // Authenticate
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const communityName = (body.communityName ?? 'sport').trim();
    const directives = (typeof body.directives === 'string' ? body.directives : '').trim().slice(0, 1000);
    const isTaverne = body.isTaverne === true;

    // Extract URLs and text from directives
    const directiveUrls = directives ? extractUrls(directives) : [];
    const directiveText = directives.replace(/https?:\/\/[^\s,;)}\]"'<>]+/g, '').trim();

    // Extract keywords from URL slugs (e.g. "patrick-roy-est-renvoye-par-les-islanders" → search terms)
    const urlKeywords = directiveUrls
      .map((url) => {
        try {
          const path = new URL(url).pathname;
          const slug = path.split('/').pop() ?? '';
          return slug.replace(/[-_]/g, ' ').replace(/\d{4}/g, '').trim();
        } catch { return ''; }
      })
      .filter((k) => k.length > 5)
      .join(' ');

    // When directives exist, use their content for news search (not communityName)
    const hasDirectiveContent = directiveText || urlKeywords;
    const searchTerm = hasDirectiveContent
      ? `${directiveText} ${urlKeywords}`.trim()
      : (isTaverne ? 'actualité Québec Canada' : communityName);

    const [news, newsX, ...urlContents] = await Promise.all([
      searchTerm ? fetchRecentNews(searchTerm) : Promise.resolve(null),
      searchTerm ? fetchRecentNews(`${searchTerm} site:x.com OR site:twitter.com`) : Promise.resolve(null),
      ...directiveUrls.slice(0, 3).map((url) => fetchUrlContent(url)),
    ]);

    // Build URL context from fetched pages
    const urlContext = urlContents
      .map((content, i) => content ? `--- Contenu de ${directiveUrls[i]} ---\n${content}` : null)
      .filter(Boolean)
      .join('\n\n');

    if ((news === null || news.length === 0) && (newsX === null || newsX.length === 0) && !directives) {
      return NextResponse.json(
        { error: 'Aucune nouvelle récente trouvée. Réessayez.' },
        { status: 503 },
      );
    }

    const allItems = [
      ...(news ?? []).map((n, i) => `${i + 1}. ${n.title} (${n.pubDate})`),
      ...(newsX ?? []).map((n, i) => `[X/Twitter] ${n.title} (${n.pubDate})`),
    ];
    const newsContext = allItems.join('\n');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Clé API Anthropic manquante' }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });

    const directivesBlock = directives
      ? `\nDIRECTIVES PRIORITAIRES de l'utilisateur :\n${directives}\n${urlContext ? `\nContenu des liens fournis :\n${urlContext}` : ''}\n\nCes directives sont PRIORITAIRES. Les suggestions doivent d'abord répondre à ces directives, puis compléter avec les nouvelles récentes si pertinent.`
      : '';

    const message = await client.messages.create({
      // Topic brainstorming — short output; Sonnet is the right tier
      // (Opus adds nothing for a list of topic strings).
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `${directives ? '' : `Voici les nouvelles récentes pour "${communityName}" :\n\n${newsContext}\n\n`}${directives ? `${directivesBlock}\n\n${newsContext ? `Nouvelles récentes pour contexte :\n${newsContext}\n\n` : ''}` : ''}Propose exactement 4 angles d'article d'opinion ${isTaverne ? '' : 'sportive '}en français québécois.
Pour chaque angle, donne un titre accrocheur et une description de 1-2 phrases de l'angle éditorial.
Choisis les sujets les plus intéressants, controversés ou d'actualité brûlante.

Réponds UNIQUEMENT en JSON valide :
[
  {"title":"Titre accrocheur","description":"Description de l'angle","topic":"mots-clés pour recherche"},
  ...
]
N'utilise PAS de guillemets doubles dans le texte, utilise « » à la place.`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Réponse IA invalide' }, { status: 500 });
    }

    let str = textBlock.text.trim();
    if (str.startsWith('```')) {
      str = str.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Extract array — try multiple strategies
    let topics: { title: string; description: string; topic: string }[] = [];

    // Strategy 1: direct parse
    try {
      topics = JSON.parse(str);
    } catch { /* fall through */ }

    // Strategy 2: extract array with regex
    if (!Array.isArray(topics) || topics.length === 0) {
      const arrMatch = str.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try {
          topics = JSON.parse(arrMatch[0]);
        } catch { /* fall through */ }
      }
    }

    // Strategy 3: extract individual objects
    if (!Array.isArray(topics) || topics.length === 0) {
      const objRegex = /\{[^{}]*"title"[^{}]*\}/g;
      let objMatch;
      const extracted: typeof topics = [];
      while ((objMatch = objRegex.exec(str)) !== null) {
        try {
          extracted.push(JSON.parse(objMatch[0]));
        } catch { /* skip malformed */ }
      }
      if (extracted.length > 0) topics = extracted;
    }

    if (!Array.isArray(topics) || topics.length === 0) {
      return NextResponse.json({ error: 'Format invalide. Réessayez.' }, { status: 500 });
    }

    // Validate + sanitize each field (strip any HTML that could come from prompt injection)
    const valid = topics
      .filter((t) => t.title && t.description && t.topic)
      .slice(0, 4)
      .map((t) => ({
        title: sanitizeArticleText(t.title),
        description: sanitizeArticleText(t.description),
        topic: sanitizeArticleText(t.topic),
      }));

    if (valid.length === 0) {
      return NextResponse.json({ error: 'Aucun sujet trouvé. Réessayez.' }, { status: 500 });
    }

    return NextResponse.json({ topics: valid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
