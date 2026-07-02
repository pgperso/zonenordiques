import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { fetchRecentNews } from '@/lib/newsSearch';
import { BRAND } from '@/lib/brand';
import { normalizePollProposals } from '@/lib/pollProposals';

// AI call + news fetch can run ~15-30s.
export const maxDuration = 60;

const POLLS_PER_RUN = 3;
const MAX_OPTIONS = 4;

// The model returns its proposals through this tool, so Anthropic hands
// back a validated JSON object instead of free-form text to regex-parse.
const POLLS_TOOL: Anthropic.Tool = {
  name: 'submit_polls',
  description: 'Soumet les sondages proposés.',
  input_schema: {
    type: 'object',
    properties: {
      polls: {
        type: 'array',
        description: `Liste de ${POLLS_PER_RUN} sondages.`,
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: "Question d'opinion en français québécois.",
            },
            options: {
              type: 'array',
              description: `2 à ${MAX_OPTIONS} options de réponse courtes (1 à 6 mots).`,
              items: { type: 'string' },
            },
          },
          required: ['question', 'options'],
        },
      },
    },
    required: ['polls'],
  },
};

/** Pull the submit_polls tool input from a message, or null if absent. */
function extractPollInput(message: Anthropic.Message): unknown {
  const block = message.content.find((b) => b.type === 'tool_use');
  return block && block.type === 'tool_use' ? block.input : null;
}

/**
 * Verifies the caller is allowed to trigger generation: either the
 * Vercel cron (bearer CRON_SECRET) or an authenticated global owner
 * (manual trigger from the Vestiaire admin panel).
 */
async function authorize(request: Request): Promise<{ ok: boolean; mode: 'cron' | 'owner' | null }> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true, mode: 'cron' };
  }

  // Manual trigger — must be a logged-in global owner.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, mode: null };

  const { data: ownerRows } = await supabase
    .from('community_member_roles')
    .select('id, roles!inner(code)')
    .eq('member_id', user.id)
    .eq('roles.code', 'owner')
    .limit(1);

  if ((ownerRows as unknown[] | null)?.length) return { ok: true, mode: 'owner' };
  return { ok: false, mode: null };
}

/**
 * Shared handler. Reachable two ways:
 *  - GET  — the Vercel cron (1st & 15th); Vercel attaches the
 *           Authorization: Bearer CRON_SECRET header automatically.
 *  - POST — manual trigger by a logged-in owner from the admin panel.
 */
async function handleGenerate(request: Request) {
  try {
    const { ok } = await authorize(request);
    if (!ok) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Clé API Anthropic manquante' }, { status: 500 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) {
      return NextResponse.json({ error: 'Configuration Supabase manquante' }, { status: 500 });
    }

    // Recent Quebec sports headlines as raw material for the questions.
    const [newsA, newsB] = await Promise.all([
      fetchRecentNews('sport Québec actualité'),
      fetchRecentNews('Canadiens Montréal LNH hockey'),
    ]);
    const headlines = [...(newsA ?? []), ...(newsB ?? [])]
      .map((n) => `- ${n.title}`)
      .slice(0, 20)
      .join('\n');

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      tools: [POLLS_TOOL],
      tool_choice: { type: 'tool', name: POLLS_TOOL.name },
      messages: [{
        role: 'user',
        content: `Tu génères des sondages pour une plateforme de fans de sport québécoise (${BRAND.name}).

${headlines ? `Actualité sportive récente :\n${headlines}\n` : ''}
MISSION : propose ${POLLS_PER_RUN} sondages courts, engageants et qui suscitent le DÉBAT entre partisans.

RÈGLES :
- Chaque sondage : une QUESTION claire en français québécois + 2 à ${MAX_OPTIONS} options de réponse.
- Questions d'OPINION qui divisent (pronostics, débats, classements) — pas des questions factuelles.
- Ancre les sondages dans l'actualité récente ci-dessus quand c'est pertinent.
- Options courtes (1 à 6 mots), mutuellement exclusives.
- Pas de question sensible (politique, religion). Sport et culture sportive seulement.
- Varie les sujets (hockey, mais aussi baseball, football, etc. si pertinent).

Soumets les sondages avec l'outil submit_polls.`,
      }],
    });

    const proposals = normalizePollProposals(extractPollInput(message), MAX_OPTIONS);
    if (proposals.length === 0) {
      return NextResponse.json({ error: 'Aucun sondage généré. Réessayez.' }, { status: 502 });
    }

    // Service-role client: the cron has no user session, and even the
    // manual path needs to write pending_review rows that public RLS
    // hides. Inserts are trusted because the caller was authorized above.
    const admin = createServiceClient(supabaseUrl, serviceKey);

    let inserted = 0;
    for (const proposal of proposals) {
      const { data: pollRow, error: pollErr } = await admin
        .from('polls')
        .insert({ question: proposal.question, status: 'pending_review', created_by: 'ai' })
        .select('id')
        .single();

      if (pollErr || !pollRow) continue;

      const pollId = (pollRow as { id: number }).id;
      const optionRows = proposal.options.map((label, idx) => ({
        poll_id: pollId,
        label,
        sort_order: idx,
      }));
      await admin.from('poll_options').insert(optionRows);
      inserted++;
    }

    return NextResponse.json({ generated: inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export function GET(request: Request) {
  return handleGenerate(request);
}

export function POST(request: Request) {
  return handleGenerate(request);
}
