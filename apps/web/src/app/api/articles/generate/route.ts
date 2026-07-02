import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { fetchRecentNews } from '@/lib/newsSearch';
import { fetchUrlContent, extractUrls } from '@/lib/fetchUrlContent';
import { sanitizeArticleHtml, sanitizeArticleText } from '@/lib/sanitizeArticleHtml';
import { consumeRateLimit, retryAfterSeconds } from '@/lib/rateLimit';
import { sanitizePromptInput, escapeForPrompt, deduplicateNews } from '@/lib/promptSafety';
import { MIN_QUALITY_WORD_COUNT } from '@arena/shared';

// Target a comfortable margin above the indexability floor so the
// finished article never lands under MIN_QUALITY_WORD_COUNT (Google
// drops shorter pages as "thin content").
const TARGET_MIN_WORDS = MIN_QUALITY_WORD_COUNT + 100; // 600
const TARGET_MAX_WORDS = MIN_QUALITY_WORD_COUNT + 250; // 750

// Model split. The research agent only compiles facts from headlines —
// a Sonnet-class extraction task where Opus adds nothing. The three
// prose agents (write / verify / polish) carry the article's voice,
// originality and editorial finesse, so they run on Opus, the strongest
// model, for the best possible writing quality.
const MODEL_RESEARCH = 'claude-sonnet-4-6';
const MODEL_PROSE = 'claude-opus-4-7';

// 4 séquences Anthropic + fetch news/URLs = peut dépasser 30s.
// Vercel Hobby coupe à 10s, Pro permet jusqu'à 60s via maxDuration.
export const maxDuration = 60;

// ─── Rate Limiting ───
// 10 generations per hour per user, enforced through the shared
// `rate_limits` table so the ceiling holds across serverless instances.
const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60 * 60;

// ─── Structured output ───
// The three prose agents return the article through this tool. Forcing
// tool_choice means Anthropic hands back the fields as a validated JSON
// object — no fragile regex parsing of free-form model text.
interface ArticleDraft {
  title: string;
  excerpt: string;
  body: string;
}

const ARTICLE_TOOL: Anthropic.Tool = {
  name: 'submit_article',
  description: "Soumet l'article finalisé. Tous les champs sont obligatoires.",
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Titre accrocheur, max 200 caractères, sans HTML.',
      },
      excerpt: {
        type: 'string',
        description: 'Résumé SEO de 120 à 155 caractères, sans HTML.',
      },
      body: {
        type: 'string',
        description:
          "Corps de l'article en HTML (<p>, <h2>, <h3>, <strong>, <em>, <ul>, <li>, <blockquote>). Jamais de <h1>.",
      },
    },
    required: ['title', 'excerpt', 'body'],
  },
};

const FORCE_ARTICLE_TOOL = { type: 'tool' as const, name: ARTICLE_TOOL.name };

// ─── Helpers ───

function extractText(message: Anthropic.Message): string {
  const block = message.content.find((b) => b.type === 'text');
  return block?.type === 'text' ? block.text.trim() : '';
}

/** Pull the submit_article tool input from a message, or null if absent/invalid. */
function extractArticle(message: Anthropic.Message): ArticleDraft | null {
  const block = message.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') return null;

  const input = block.input as Record<string, unknown>;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const excerpt = typeof input.excerpt === 'string' ? input.excerpt.trim() : '';

  // A truncated reply (max_tokens) can drop body — treat as a failed stage.
  if (!title || !body) return null;
  return { title, excerpt, body };
}

// ─── AGENT 1: RECHERCHISTE ───
async function agentResearch(
  client: Anthropic,
  communityName: string,
  directives: string,
  directiveUrlContents: string,
  newsLines: string[],
  isTaverne: boolean,
): Promise<string> {
  const hasUrlContent = directiveUrlContents.length > 0;
  const directivesBlock = directives
    ? `\nDIRECTIVES PRIORITAIRES de l'utilisateur :\n${escapeForPrompt(directives)}\n${hasUrlContent ? `\nContenu des liens fournis par l'utilisateur (SOURCE PRINCIPALE DE FAITS) :\n${directiveUrlContents}\n\nATTENTION : Le contenu ci-dessus est ta SOURCE PRINCIPALE ET FIABLE de faits. Base ton dossier PRINCIPALEMENT sur ces informations. Les nouvelles récentes ci-dessous ne sont que du CONTEXTE COMPLÉMENTAIRE - ne les utilise PAS comme source de faits si elles contredisent le contenu du lien fourni.` : '\nCes directives sont ta SOURCE PRINCIPALE. Utilise-les en priorité pour orienter ton dossier. Les nouvelles récentes ci-dessous servent de complément.'}\n`
    : '';

  const newsBlock = newsLines.length > 0
    ? `\n${hasUrlContent ? 'Contexte complémentaire (NE PAS utiliser comme source de faits si contredit le lien ci-dessus)' : 'Nouvelles récentes (français et anglais)'} :\n${newsLines.join('\n')}`
    : '';

  const message = await client.messages.create({
    model: MODEL_RESEARCH,
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Tu es un RECHERCHISTE ${isTaverne ? '' : 'sportif '}pour une tribune sur le sujet suivant : ${escapeForPrompt(communityName)}.
${directivesBlock}${newsBlock}

MISSION :
- Compile un dossier de recherche structuré en français
- Extrais les FAITS VÉRIFIABLES : dates, scores, noms, événements
- REFORMULE TOUT dans tes propres mots. Ne recopie JAMAIS les titres ou phrases des sources. Résume les faits, ne cite pas.
- Traduis les informations anglaises en français
- Les sources [X/Twitter] contiennent des réactions et opinions en temps réel - note les prises de position intéressantes, controverses et débats chauds
- Identifie l'angle le plus intéressant pour un article d'opinion
- Note les SOURCES avec leurs liens (mais PAS leurs titres exacts)
- Si une info est incertaine ou provient UNIQUEMENT des nouvelles récentes (pas du lien fourni), marque-la comme « à vérifier »
- N'invente AUCUN fait, citation ou statistique
- Ne MÉLANGE PAS les faits de différentes sources comme s'ils faisaient partie du même événement
- Si un lien a été fourni par l'utilisateur, les faits de ce lien sont PRIORITAIRES et FIABLES

Format : texte structuré avec sections (Faits clés, Contexte, Réactions X/Twitter, Angle suggéré, Sources)
Ne fais PAS d'article, juste le dossier de recherche.`,
    }],
  });

  return extractText(message);
}

// ─── AGENT 2: REDACTEUR ───
async function agentWrite(
  client: Anthropic,
  research: string,
  authorName: string,
  authorStyle: string,
  communityName: string,
  directives: string,
  isTaverne: boolean,
): Promise<ArticleDraft | null> {
  const escapedDirectives = directives ? escapeForPrompt(directives) : '';

  const message = await client.messages.create({
    model: MODEL_PROSE,
    max_tokens: 3200,
    tools: [ARTICLE_TOOL],
    tool_choice: FORCE_ARTICLE_TOOL,
    messages: [{
      role: 'user',
      content: `Tu es le RÉDACTEUR ${authorName ? `« ${escapeForPrompt(authorName)} »` : ''} pour une tribune sur ${escapeForPrompt(communityName)}.
${authorStyle ? `\nTon style éditorial : ${authorStyle}` : `\nTon style : chroniqueur ${isTaverne ? '' : 'sportif '}québécois engagé.`}
${escapedDirectives ? `\nDIRECTIVES PRIORITAIRES de l'utilisateur :\n${escapedDirectives}\n\nCes directives sont PRIORITAIRES. L'article DOIT respecter ces consignes (angle, sujet, ton, éléments à inclure). Combine-les avec les faits du dossier de recherche.` : ''}

Voici le dossier de recherche :
---
${research}
---

MISSION :
- Écris un article d'OPINION original de ${TARGET_MIN_WORDS} à ${TARGET_MAX_WORDS} mots en français québécois
- LONGUEUR CRITIQUE : le corps de l'article DOIT faire AU MINIMUM ${MIN_QUALITY_WORD_COUNT} mots. En dessous, Google ne l'indexe pas (« contenu de faible valeur »). Vise ${TARGET_MIN_WORDS}+ mots. Développe chaque argument avec du contexte, des exemples concrets et des nuances — pas de remplissage creux, de la vraie analyse.
- Adapte le ton à ta personnalité d'auteur
- Varie tes tournures (pas toujours les mêmes débuts de paragraphe)
- Base-toi UNIQUEMENT sur les faits du dossier, n'invente RIEN
- Si un fait est marqué « à vérifier », ne l'inclus pas
- N'ajoute PAS de détails, dates, scores ou noms qui ne sont pas dans le dossier

ORIGINALITÉ (CRITIQUE) :
- JAMAIS de phrase copiée d'une source. Reformule TOUT avec ta propre voix.
- N'utilise AUCUN titre de nouvelle comme titre ou phrase de ton article.
- Maximum 3 mots consécutifs identiques à une source. Au-delà, reformule.
- Écris comme un chroniqueur qui a digéré l'info et donne SON opinion, pas comme un journaliste qui rapporte.
- Évite les formulations journalistiques génériques (« force est de constater », « il va sans dire », « à l'heure où »).

FORMAT :
- Utilise des guillemets français « » jamais des guillemets doubles
- N'utilise JAMAIS le tiret cadratin (—) ni le tiret demi-cadratin (–). Utilise uniquement le tiret court (-) ou reformule la phrase
- HTML : <p>, <h2>, <h3>, <strong>, <em>, <ul>, <li>, <blockquote>
- PAS de <h1>, pas de <html>/<head>/<body>
- NE PAS ajouter de section sources ni de mention IA à la fin de l'article
- L'article doit se terminer naturellement par une conclusion éditoriale forte

Soumets l'article avec l'outil submit_article.`,
    }],
  });

  return extractArticle(message);
}

// ─── AGENT 3: VERIFICATEUR ───
async function agentVerify(
  client: Anthropic,
  article: ArticleDraft,
  research: string,
  newsTitles: string[],
  authorName: string,
  authorStyle: string,
): Promise<ArticleDraft | null> {
  const sourceTitles = newsTitles.length > 0
    ? `\nTITRES ORIGINAUX DES SOURCES (pour comparaison anti-plagiat) :\n${newsTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n`
    : '';

  const styleBlock = authorStyle
    ? `\nAUTEUR : ${escapeForPrompt(authorName || 'chroniqueur')}\nSTYLE ATTENDU : ${authorStyle}\n`
    : '';

  const message = await client.messages.create({
    model: MODEL_PROSE,
    max_tokens: 3200,
    tools: [ARTICLE_TOOL],
    tool_choice: FORCE_ARTICLE_TOOL,
    messages: [{
      role: 'user',
      content: `Tu es un VÉRIFICATEUR anti-plagiat STRICT et qualité.

ARTICLE SOUMIS :
${JSON.stringify(article)}

DOSSIER DE RECHERCHE :
${research}
${sourceTitles}${styleBlock}
MISSION :
1. PLAGIAT (PRIORITÉ ABSOLUE) :
   - Compare chaque phrase de l'article avec les titres des sources ci-dessus.
   - Si plus de 3 mots consécutifs sont identiques à un titre source, REFORMULE la phrase complètement.
   - Le titre de l'article ne doit ressembler à AUCUN titre source. Change-le si c'est le cas.
   - L'article doit sonner comme une OPINION PERSONNELLE, pas comme un résumé de nouvelles.
   - Élimine les formulations journalistiques clichées.
2. FAITS : Retire tout fait absent du dossier de recherche. Aucune invention.
2b. LONGUEUR : le corps doit faire AU MINIMUM ${MIN_QUALITY_WORD_COUNT} mots (cible ${TARGET_MIN_WORDS}+). S'il est plus court, DÉVELOPPE les arguments existants avec du contexte, des exemples et des nuances tirés du dossier de recherche. Ne descends jamais sous ${MIN_QUALITY_WORD_COUNT} mots.
3. STYLE DE L'AUTEUR (IMPORTANT) :
   - L'article DOIT correspondre au style de l'auteur décrit ci-dessus.
   - Si le ton ne correspond pas (ex: un article trop sérieux pour Rex Paquette qui doit être provocateur), RÉÉCRIS les passages pour coller au personnage.
   - Le vocabulaire, le niveau de langue et l'attitude doivent refléter la personnalité de l'auteur.
4. QUALITÉ : Améliore les transitions, supprime les répétitions.
5. Dans le texte, utilise les guillemets français « » jamais des guillemets doubles.

Soumets l'article corrigé avec l'outil submit_article.`,
    }],
  });

  return extractArticle(message);
}

// ─── AGENT 4: EDITEUR ───
async function agentPolish(
  client: Anthropic,
  article: ArticleDraft,
  authorName: string,
  authorStyle: string,
  isTaverne: boolean,
): Promise<ArticleDraft | null> {
  const message = await client.messages.create({
    model: MODEL_PROSE,
    max_tokens: 3200,
    tools: [ARTICLE_TOOL],
    tool_choice: FORCE_ARTICLE_TOOL,
    messages: [{
      role: 'user',
      content: `Tu es l'ÉDITEUR EN CHEF. Passe finale.

ARTICLE :
${JSON.stringify(article)}

AUTEUR : ${escapeForPrompt(authorName || 'chroniqueur')}
STYLE ATTENDU : ${authorStyle || `éditorial ${isTaverne ? '' : 'sportif '}québécois`}

MISSION :
1. VOIX DE L'AUTEUR (PRIORITÉ) : Relis le style attendu ci-dessus. L'article doit SONNER comme cet auteur. Si Rex Paquette est provocateur et sarcastique, l'article doit être provocateur et sarcastique. Si Maika Blitz est passionnée et émotionnelle, l'article doit vibrer d'émotion. Ajuste le vocabulaire, les tournures et l'attitude pour coller au personnage.
2. ORIGINALITÉ : L'article sonne-t-il comme une chronique personnelle ou comme un résumé de nouvelles ? Si c'est trop « journalistique », injecte plus de personnalité et d'opinion dans le style de l'auteur.
3. Le titre est-il accrocheur, original et < 200 caractères ? Il doit refléter le ton de l'auteur (provocateur, analytique, passionné, critique selon le cas).
4. L'excerpt SEO fait-il 120-155 caractères ? Ajuste.
5. L'ouverture accroche dès la première phrase ? Renforce si faible.
6. La conclusion est mémorable ? Améliore si plate.
7. Le vocabulaire est varié ? Remplace les mots répétés et les clichés journalistiques.
8. Le HTML est propre ? Pas de balises vides.
9. LONGUEUR FINALE : compte les mots du corps. Il doit faire au moins ${MIN_QUALITY_WORD_COUNT} mots (cible ${TARGET_MIN_WORDS}+). Si c'est plus court, étoffe les paragraphes avec de la vraie analyse (contexte, nuances, conséquences) — jamais de remplissage creux. Ne retourne JAMAIS un article sous ${MIN_QUALITY_WORD_COUNT} mots.
10. Dans le texte, utilise les guillemets français « » jamais des guillemets doubles.

Soumets l'article FINAL avec l'outil submit_article.`,
    }],
  });

  return extractArticle(message);
}

// ─── MAIN ROUTE ───

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { allowed, remaining, resetAt } = await consumeRateLimit(
      `article-gen:${user.id}`,
      RATE_LIMIT,
      RATE_WINDOW_SECONDS,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: `Limite atteinte (${RATE_LIMIT}/heure). Réessayez plus tard.` },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSeconds(resetAt) || RATE_WINDOW_SECONDS) },
        },
      );
    }

    const body = await request.json();
    const topic = sanitizePromptInput(body.topic ?? '', 200);
    const directives = sanitizePromptInput(body.directives ?? body.instructions ?? '', 1000);
    const communityName = sanitizePromptInput(body.communityName ?? 'Sport', 100);
    const authorStyle = typeof body.authorStyle === 'string' ? body.authorStyle.slice(0, 500) : '';
    const authorName = sanitizePromptInput(body.authorName ?? '', 100);
    const isTaverne = body.isTaverne === true;

    if (topic.length < 2) {
      return NextResponse.json({ error: 'Sujet requis (min 2 caractères)' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Clé API Anthropic manquante' }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });

    // Fetch URL content from directives in parallel
    const directiveUrls = directives ? extractUrls(directives) : [];
    const urlContents = await Promise.all(
      directiveUrls.slice(0, 3).map((url) => fetchUrlContent(url)),
    );
    const directiveUrlContents = urlContents
      .map((content, i) => content ? `--- ${directiveUrls[i]} ---\n${content}` : null)
      .filter(Boolean)
      .join('\n\n');

    // Fetch all news sources in parallel (used by recherchiste + vérificateur)
    const [newsFr, newsEn, newsX] = await Promise.all([
      fetchRecentNews(topic),
      fetchRecentNews(`${topic} latest news`),
      fetchRecentNews(`${topic} site:x.com OR site:twitter.com`),
    ]);

    if (newsFr === null && newsEn === null && newsX === null && !directives) {
      return NextResponse.json({ error: 'Service de nouvelles indisponible.' }, { status: 503 });
    }

    const allNewsLines = [
      ...(newsFr ?? []).map((n) => `[FR] ${n.title} (${n.pubDate}) — ${n.link}`),
      ...(newsEn ?? []).map((n) => `[EN] ${n.title} (${n.pubDate}) — ${n.link}`),
      ...(newsX ?? []).map((n) => `[X/Twitter] ${n.title} (${n.pubDate}) — ${n.link}`),
    ];
    const uniqueNews = deduplicateNews(allNewsLines).slice(0, 15);

    const newsTitles = [
      ...(newsFr ?? []).map((n) => n.title),
      ...(newsEn ?? []).map((n) => n.title),
      ...(newsX ?? []).map((n) => n.title),
    ].slice(0, 20);

    if (uniqueNews.length === 0 && !directives) {
      return NextResponse.json({ error: 'Aucune nouvelle trouvée pour ce sujet.' }, { status: 404 });
    }

    // Agent 1: Recherchiste
    const research = await agentResearch(client, communityName, directives, directiveUrlContents, uniqueNews, isTaverne);

    // Agent 2: Rédacteur
    const draft = await agentWrite(client, research, authorName, authorStyle, communityName, directives, isTaverne);
    if (!draft) {
      return NextResponse.json({ error: 'Génération échouée. Réessayez.' }, { status: 500 });
    }

    // Agent 3: Vérificateur — Agent 4: Éditeur. Each stage may fail to
    // return a usable draft; fall back to the best earlier stage.
    const verified = await agentVerify(client, draft, research, newsTitles, authorName, authorStyle);
    const polished = verified
      ? await agentPolish(client, verified, authorName, authorStyle, isTaverne)
      : null;
    const article = polished ?? verified ?? draft;

    // Strip em/en dashes that AI overuses, then sanitize HTML server-side
    const cleanBody = sanitizeArticleHtml(article.body.replace(/[—–]/g, '-'));
    const cleanTitle = sanitizeArticleText(article.title.replace(/[—–]/g, '-'));
    const cleanExcerpt = sanitizeArticleText(article.excerpt.replace(/[—–]/g, '-'));

    return NextResponse.json(
      { title: cleanTitle, excerpt: cleanExcerpt, body: cleanBody },
      { headers: { 'X-RateLimit-Remaining': String(remaining) } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
