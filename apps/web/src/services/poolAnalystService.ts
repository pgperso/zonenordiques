import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arena/supabase-client';
import { BRAND } from '@/lib/brand';
import { sendBotDirect } from './botService';

/**
 * The tribune's armchair GM: a nightly read on how the poolers' bets actually
 * went.
 *
 * Everything it is allowed to assert comes from pool_daily_digest — facts
 * already computed in SQL against the real rows. A model handed raw tables
 * invents numbers that look plausible; a model handed a short list of computed
 * facts comments on them. That is the whole reason the digest exists.
 *
 * Same model as the translator: this is a few hundred words a night, not an
 * essay, and the quality that matters is restraint rather than eloquence.
 */
const MODEL = 'claude-haiku-4-5-20251001';

type AnyAdmin = SupabaseClient<Database>;

/**
 * The bank of angles. Three are drawn each night, so a reader gets a different
 * read on consecutive evenings instead of the same paragraph with new numbers.
 *
 * Each one names what to look at AND what makes it worth saying — an angle
 * with no tension produces filler.
 */
const ANGLES: Array<{ key: string; brief: string }> = [
  {
    key: 'value',
    brief:
      "Le rapport qualité-prix de la soirée. Qui a fait produire un joueur payé une fortune, et qui a vu un gros contrat rester muet. Compare des salaires à des points, pas des joueurs à des joueurs.",
  },
  {
    key: 'bargain',
    brief:
      "L'aubaine du soir : un joueur à petit salaire qui a produit autant qu'une vedette. Nomme son propriétaire — c'est lui qui mérite le crédit, pas le hasard.",
  },
  {
    key: 'stars',
    brief:
      "Les joueurs vedettes, dont les points comptent en double. Dis qui a vu son pari doubler, et qui a doublé un zéro. C'est le choix le plus lourd de conséquences du pool.",
  },
  {
    key: 'absent',
    brief:
      "Les joueurs qui n'ont pas sauté sur la glace alors qu'ils occupent une place et un salaire. Un alignement n'est pas qu'un choix de talent, c'est aussi une gestion de la disponibilité.",
  },
  {
    key: 'movement',
    brief:
      "Le mouvement au classement : qui a grimpé, qui a glissé, et de combien le meneur s'échappe ou se fait rattraper. Utilise rank et previous_rank.",
  },
  {
    key: 'crowd',
    brief:
      "Les joueurs que presque tout le monde possède. Quand un joueur est dans la moitié des équipes, sa soirée ne départage personne — ce sont les choix rares qui font les écarts.",
  },
  {
    key: 'defense',
    brief:
      "Les défenseurs, dont chaque point réel vaut plus qu'un point d'attaquant dans ce pool. Qui a compris la règle et en profite, qui l'a ignorée.",
  },
  {
    key: 'club',
    brief:
      "Les équipes de la LNH choisies, qui rapportent des points chaque soir indépendamment des joueurs. Un bon club peut porter une équipe ordinaire.",
  },
  {
    key: 'depth',
    brief:
      "La répartition de la masse salariale : une ou deux grosses vedettes entourées de profondeur à rabais, contre un alignement équilibré. Dis laquelle des deux approches a payé ce soir.",
  },
];

function pickAngles(seed: number, count: number): typeof ANGLES {
  // Rotates through the bank by day, so consecutive evenings never repeat and
  // every angle comes back eventually.
  const out: typeof ANGLES = [];
  for (let i = 0; i < count; i++) out.push(ANGLES[(seed * count + i) % ANGLES.length]);
  return out;
}

function buildPrompt(digest: unknown, angles: typeof ANGLES): string {
  return `Tu es « Le Gérant d'Estrade », l'analyste du pool de hockey de ${BRAND.name}. Tu écris en français québécois, pour une douzaine de participants qui se connaissent.

TON
- Tu ris des DÉCISIONS, jamais des personnes. « Payer 11 M$ pour un gars qui n'a pas joué, ça pique » : oui. Juger quelqu'un, l'insulter ou douter de son intelligence : jamais.
- Tu félicites franchement une bonne soirée ou un bon coup de flair.
- Tu nommes les équipes du pool telles qu'elles apparaissent dans les données.
- Pas de ponctuation excessive, pas de majuscules criées, au plus un emoji par paragraphe.

RÈGLE ABSOLUE
Tu n'écris QUE des chiffres et des noms présents dans les données ci-dessous. Tu ne calcules rien, tu n'estimes rien, tu n'inventes aucune statistique, aucun match et aucun nom. Si un angle n'a pas de matière dans les données, écris un paragraphe court là-dessus plutôt que de le remplir.

FORMAT
Exactement ${angles.length} paragraphes, séparés par une ligne vide. Chacun commence par un titre très court suivi de « — ». Deux à quatre phrases par paragraphe. Pas de liste à puces, pas de titre général, pas d'introduction ni de conclusion.

LES ${angles.length} ANGLES DE CE SOIR
${angles.map((a, i) => `${i + 1}. ${a.brief}`).join('\n')}

DONNÉES DE LA SOIRÉE
${JSON.stringify(digest, null, 2)}`;
}

/**
 * Write and post the night's analysis. Returns what happened, so the cron can
 * log it.
 *
 * Silent by design when there is nothing to say: no digest (no games, no
 * confirmed entry) means no post. An empty chat beats a daily "rien à
 * signaler".
 */
export async function postDailyPoolAnalysis(
  admin: AnyAdmin,
  seasonId: number,
  communityId: number,
): Promise<{ posted: boolean; reason?: string; gameDay?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { posted: false, reason: 'ANTHROPIC_API_KEY absente' };

  const db = admin as unknown as SupabaseClient;

  const { data: digest, error } = await db.rpc('pool_daily_digest' as never, {
    p_season_id: seasonId,
  } as never);
  if (error) return { posted: false, reason: `digest: ${error.message}` };
  if (!digest) return { posted: false, reason: 'aucun match à commenter' };

  const gameDay = (digest as { game_day?: string }).game_day;
  if (!gameDay) return { posted: false, reason: 'digest sans date' };

  // Claim the night before spending anything. The cron can be re-run and a
  // stat correction can trigger a second sync; the tribune must not get the
  // same analysis twice, and the insert losing the race is the proof.
  const { error: claimErr } = await db
    .from('pool_bot_digests')
    .insert({ season_id: seasonId, game_day: gameDay });
  if (claimErr) return { posted: false, reason: 'soirée déjà commentée', gameDay };

  try {
    const anthropic = new Anthropic({ apiKey });
    const seed = Math.floor(new Date(`${gameDay}T12:00:00Z`).getTime() / 86_400_000);
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: 'user', content: buildPrompt(digest, pickAngles(seed, 3)) }],
    });

    const block = res.content[0];
    const text = block && block.type === 'text' ? block.text.trim() : '';
    // A truncated reply would post half a sentence into the chat.
    if (!text || res.stop_reason === 'max_tokens') {
      throw new Error('réponse vide ou tronquée');
    }

    await sendBotDirect(admin, communityId, text);
    return { posted: true, gameDay };
  } catch (err) {
    // Release the claim so the next run can try again, rather than the night
    // being silently skipped forever because one call failed.
    await db.from('pool_bot_digests').delete()
      .eq('season_id', seasonId).eq('game_day', gameDay);
    return { posted: false, reason: err instanceof Error ? err.message : 'erreur inconnue', gameDay };
  }
}
