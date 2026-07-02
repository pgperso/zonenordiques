import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arena/supabase-client';
import { BOT_MEMBER_ID } from '@arena/shared';
import { BRAND } from '@/lib/brand';

// ── Join announcements (already used in communityService) ──

const JOIN_ANNOUNCEMENTS = [
  (u: string, c: string) => `🏟️ ${u} débarque dans ${c} ! La foule est en délire !`,
  (u: string, c: string) => `🔥 ${u} vient de rejoindre ${c}. Ça va chauffer !`,
  (u: string, c: string) => `📢 Attention ! ${u} entre dans l'arène de ${c} !`,
  (u: string, c: string) => `💪 ${u} s'amène dans ${c}. Un de plus dans la tribune !`,
  (u: string, c: string) => `🎯 ${u} a rejoint ${c}. Bienvenue dans la tribune !`,
  (u: string, c: string) => `⚡ ${u} est maintenant dans ${c}. Let's go !`,
  (u: string, c: string) => `🏒 ${u} saute sur la glace de ${c} !`,
  (u: string, c: string) => `📣 ${u} prend place dans les estrades de ${c} !`,
  (u: string, c: string) => `🙌 ${u} rejoint la gang de ${c}. On est de plus en plus !`,
  (u: string, c: string) => `🚨 Nouveau fan alert ! ${u} est dans ${c} !`,
  (u: string, c: string) => `👊 ${u} embarque avec ${c}. Ça va brasser !`,
  (u: string, c: string) => `🎙️ ${u} a son siège dans ${c}. Fais-toi entendre !`,
  (u: string, c: string) => `🔔 ${u} vient d'arriver dans ${c}. La tribune s'agrandit !`,
  (u: string, c: string) => `💥 Boom ! ${u} est officiellement dans ${c} !`,
  (u: string, c: string) => `🏆 ${u} rejoint l'équipe de ${c}. Champion !`,
];

// ── Article announcements ──

const GALLERY_URL = `${BRAND.url}/fr`;

const ARTICLE_ANNOUNCEMENTS = [
  (u: string, c: string, t: string, url: string) => `📰 Nouvel article dans ${c} : "${t}" par ${u}. À lire dans la Galerie de presse ! ${url}`,
  (u: string, c: string, t: string, url: string) => `✍️ ${u} vient de publier "${t}" dans ${c}. Disponible dans la Galerie de presse ! ${url}`,
  (u: string, c: string, t: string, url: string) => `📝 "${t}" — nouvel article de ${u}. Retrouvez-le dans la Galerie de presse ! ${url}`,
  (u: string, c: string, t: string, url: string) => `🗞️ ${u} a écrit "${t}" dans ${c}. Direction la Galerie de presse ! ${url}`,
  (u: string, c: string, t: string, url: string) => `💡 Nouvel article signé ${u} : "${t}" — en vedette dans la Galerie de presse ! ${url}`,
];

// ── Podcast announcements ──

const PODCAST_ANNOUNCEMENTS = [
  (u: string, c: string, t: string, url: string) => `🎙️ Nouveau podcast dans ${c} : "${t}" par ${u}. Disponible dans la Galerie de presse ! ${url}`,
  (u: string, c: string, t: string, url: string) => `🎧 ${u} a sorti un nouveau podcast : "${t}". Écoutez-le dans la Galerie de presse ! ${url}`,
  (u: string, c: string, t: string, url: string) => `🔊 "${t}" — nouveau podcast de ${u}. Retrouvez-le dans la Galerie de presse ! ${url}`,
  (u: string, c: string, t: string, url: string) => `📻 ${u} est au micro dans ${c} : "${t}". Direction la Galerie de presse ! ${url}`,
  (u: string, c: string, t: string, url: string) => `🎤 Nouveau épisode dans ${c} ! "${t}" par ${u}. Dans la Galerie de presse ! ${url}`,
];

// ── Live announcements ──

const LIVE_ANNOUNCEMENTS = [
  (c: string, t: string) => `🔴 EN DIRECT dans ${c} : "${t}" — Rejoignez le live maintenant !`,
  (c: string, t: string) => `🔴 Ça commence ! "${t}" est en direct dans ${c} !`,
  (c: string, t: string) => `🔴 Live en cours dans ${c} : "${t}". Venez jaser en direct !`,
  (c: string, t: string) => `🔴 "${t}" — le live est parti dans ${c} ! On vous attend !`,
  (c: string, t: string) => `🔴 C'est live ! "${t}" dans ${c}. Manquez pas ça !`,
];

// ── Milestone announcements ──

const MILESTONE_ANNOUNCEMENTS = [
  (c: string, n: number) => `🎉 ${c} atteint ${n} membres ! La communauté grandit !`,
  (c: string, n: number) => `🙌 ${n} fans dans ${c} ! On lâche pas !`,
  (c: string, n: number) => `🏟️ ${c} a maintenant ${n} membres. L'arène se remplit !`,
  (c: string, n: number) => `🔥 ${n} dans ${c} ! Ça chauffe en estrade !`,
  (c: string, n: number) => `💪 ${c} vient de passer le cap des ${n} membres !`,
];

const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Public API ──

/**
 * Send a bot message into ONE tribune via the SECURITY DEFINER RPC.
 * All announcements below are scoped to the source community: a join,
 * article, podcast, live or milestone never leaks into unrelated
 * tribunes. The original broadcastBot helper that fanned out to every
 * active community has been removed — quiet tribunes were filling up
 * with bot messages about events happening elsewhere on the site,
 * which is exactly what users reported as a dead "bot wall".
 */
async function sendBotToTribune(
  supabase: SupabaseClient<Database>,
  communityId: number,
  content: string,
) {
  await supabase.rpc('send_bot_message' as never, {
    p_community_id: communityId,
    p_content: content,
  } as never);
}

/** Announce a new member joined — only in the tribune they joined. */
export async function announceJoin(
  supabase: SupabaseClient<Database>,
  communityId: number,
  username: string,
  communityName: string,
) {
  const message = pick(JOIN_ANNOUNCEMENTS)(username, communityName);
  await sendBotToTribune(supabase, communityId, message);
}

/** Announce a new article — only in the tribune it was published to. */
export async function announceArticle(
  supabase: SupabaseClient<Database>,
  communityId: number,
  username: string,
  communityName: string,
  articleTitle: string,
  articleUrl: string,
) {
  const message = pick(ARTICLE_ANNOUNCEMENTS)(username, communityName, articleTitle, articleUrl);
  await sendBotToTribune(supabase, communityId, message);
}

/** Announce a new podcast — only in the tribune it was published to. */
export async function announcePodcast(
  supabase: SupabaseClient<Database>,
  communityId: number,
  username: string,
  communityName: string,
  podcastTitle: string,
  podcastUrl: string,
) {
  const message = pick(PODCAST_ANNOUNCEMENTS)(username, communityName, podcastTitle, podcastUrl);
  await sendBotToTribune(supabase, communityId, message);
}

/** Announce a live started — only in the tribune hosting the live. */
export async function announceLive(
  supabase: SupabaseClient<Database>,
  communityId: number,
  communityName: string,
  liveTitle: string,
) {
  const message = pick(LIVE_ANNOUNCEMENTS)(communityName, liveTitle);
  await sendBotToTribune(supabase, communityId, message);
}

/** Delete bot announcement messages for a removed article (all tribunes) */
export async function cleanupArticleBotMessages(
  supabase: SupabaseClient<Database>,
  articleSlug: string,
) {
  await supabase
    .from('chat_messages')
    .delete()
    .eq('member_id', BOT_MEMBER_ID)
    .like('content', `%/articles/${articleSlug}%`);
}

// ── Pool announcements ──
//
// These run from server contexts that use the SERVICE ROLE (the admin save
// route, the nightly cron), where auth.uid() is null — so send_bot_message
// (which no-ops without auth.uid()) can't be used. We insert directly into
// chat_messages as the bot; the service role bypasses RLS.

const POOL_URL = `${BRAND.url}/fr/lnh/pool`;

const POOL_OPEN_ANNOUNCEMENTS = [
  (url: string) => `Le Pool LNH est ouvert ! Compose ton équipe à plafond salarial et grimpe au classement : ${url}`,
  (url: string) => `🚨 Pool LNH ouvert ! Choisis tes 20 joueurs et défie la tribune : ${url}`,
  (url: string) => `C'est parti — le Pool LNH est lancé ! À toi de jouer : ${url}`,
];

const POOL_LEADER_ANNOUNCEMENTS = [
  (n: string, p: string, url: string) => `Pool LNH — ${n} mène avec ${p} pts ! Rattrape-le : ${url}`,
  (n: string, p: string, url: string) => `📊 Au sommet du Pool LNH : ${n} (${p} pts). Et toi, où es-tu rendu ? ${url}`,
  (n: string, p: string, url: string) => `🔥 ${n} domine le Pool LNH avec ${p} pts. Le classement : ${url}`,
];

/** Insert a bot message directly (service-role path; no auth.uid() needed). */
export async function sendBotDirect(
  admin: SupabaseClient<Database>,
  communityId: number,
  content: string,
) {
  await admin.from('chat_messages').insert({
    community_id: communityId,
    member_id: BOT_MEMBER_ID,
    content,
  });
}

/** Announce that the pool just opened — once, in the LNH tribune. */
export async function announcePoolOpen(admin: SupabaseClient<Database>, communityId: number) {
  await sendBotDirect(admin, communityId, pick(POOL_OPEN_ANNOUNCEMENTS)(POOL_URL));
}

/** Announce the current pool leader — the daily-return hook, in the LNH tribune. */
export async function announcePoolLeader(
  admin: SupabaseClient<Database>,
  communityId: number,
  leaderName: string,
  points: string,
) {
  await sendBotDirect(admin, communityId, pick(POOL_LEADER_ANNOUNCEMENTS)(leaderName, points, POOL_URL));
}

/** Check and announce member milestone — only in the community that hit it. */
export async function checkMilestone(
  supabase: SupabaseClient<Database>,
  communityId: number,
  communityName: string,
) {
  const { count } = await supabase
    .from('community_members')
    .select('id', { count: 'exact', head: true })
    .eq('community_id', communityId);

  if (count === null) return;

  if (MILESTONES.includes(count)) {
    const message = pick(MILESTONE_ANNOUNCEMENTS)(communityName, count);
    await sendBotToTribune(supabase, communityId, message);
  }
}
