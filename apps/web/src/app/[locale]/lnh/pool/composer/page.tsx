import type { Metadata } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { getActiveSeason, getEntryRosterPlayers, getPlayerPool, getTeamChoices, type SlotPick, type PoolPosition } from '@/services/poolService';
import { PoolComposer } from './PoolComposer';
import { BRAND } from '@/lib/brand';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'fr' ? `Composer mon équipe | ${BRAND.name}` : `Build my team | ${BRAND.nameEn}`;
  // The tool itself isn't an SEO/ad surface; keep it out of the index.
  return { title: { absolute: title }, robots: { index: false, follow: false } };
}

/**
 * When the season's first counted game starts, or null if none is scheduled.
 *
 * Preseason games sit in the same table, so the pool's own game_types decide
 * what counts -- otherwise an exhibition match in September would close
 * composition weeks early.
 */
async function firstGameStart(
  db: SupabaseClient,
  nhlSeason: number,
  gameTypes: number[],
): Promise<string | null> {
  const { data } = await db
    .from('nhl_games')
    .select('start_time_utc')
    .eq('season', nhlSeason)
    .in('game_type', gameTypes)
    .order('start_time_utc', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { start_time_utc: string } | null)?.start_time_utc ?? null;
}

export default async function ComposerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/lnh/pool/composer');

  const season = await getActiveSeason(supabase);
  if (!season) redirect('/lnh/pool');

  // Pool tables aren't in the generated Database type — write through a loose client.
  const db = supabase as unknown as SupabaseClient;

  // Ensure the member has an entry (create one with a sensible default name).
  const ENTRY_COLS = 'id, is_locked, team_pick, is_confirmed, confirmed_at, transactions_used, star_forward_id, star_defense_id';
  let { data: entry } = await db
    .from('pool_entries')
    .select(ENTRY_COLS)
    .eq('season_id', season.id)
    .eq('member_id', user.id)
    .maybeSingle();

  if (!entry) {
    const { data: member } = await db.from('members').select('username').eq('id', user.id).single();
    const username = (member as { username: string } | null)?.username;
    const tPool = await getTranslations('pool');
    const teamName = username ? tPool('defaultTeamName', { username }) : tPool('defaultTeamNameFallback');
    // Team names are unique per season (00122), so the default can collide —
    // with another member who has no username, or with someone who happened to
    // name their team exactly this. Without the second attempt that insert
    // fails, the fallback read below finds nothing, and the member is bounced
    // back to /lnh/pool with no way in and nothing explaining why.
    type EntryRow = {
      id: number; is_locked: boolean; team_pick: string | null; is_confirmed: boolean;
      confirmed_at: string | null;
      transactions_used: number; star_forward_id: number | null; star_defense_id: number | null;
    };
    let created: EntryRow | null = null;
    for (const name of [teamName, `${teamName} ${user.id.slice(0, 4)}`]) {
      const { data } = await db
        .from('pool_entries')
        .insert({ season_id: season.id, member_id: user.id, team_name: name })
        .select(ENTRY_COLS)
        .single();
      if (data) { created = data as unknown as EntryRow; break; }
    }
    // If the insert lost a race on the UNIQUE(season_id, member_id) constraint
    // (e.g. two tabs), fall back to reading the row that won.
    if (created) {
      entry = created as unknown as typeof entry;
    } else {
      const { data: existing } = await db
        .from('pool_entries')
        .select(ENTRY_COLS)
        .eq('season_id', season.id)
        .eq('member_id', user.id)
        .maybeSingle();
      entry = existing;
    }
  }
  if (!entry) redirect('/lnh/pool');
  const entryRow = entry as unknown as { id: number; is_locked: boolean; team_pick: string | null; is_confirmed: boolean; confirmed_at: string | null; transactions_used: number; star_forward_id: number | null; star_defense_id: number | null };

  const [poolPlayers, rosterPlayers, teams, firstGame] = await Promise.all([
    getPlayerPool(supabase, season.id),
    getEntryRosterPlayers(supabase, season.id, entryRow.id),
    getTeamChoices(supabase, season.id),
    firstGameStart(db, season.nhlSeason, season.gameTypes),
  ]);

  // Free composition ends at lock_at when the commissioner set one, otherwise
  // at the season's first game (00130). An entry never confirmed once is
  // exempt and keeps one chance to finish (00131).
  //
  // Computed here from plain table reads rather than through an RPC. Asking a
  // helper function meant that, in the window where the function did not exist
  // yet, the call failed, the page fell back to "open", and a member was shown
  // Retirer on a roster pool_save_roster would then refuse. The server stays
  // the authority; this just has to never contradict it.
  const closed =
    entryRow.is_locked ||
    (entryRow.confirmed_at !== null &&
      (season.lockAt
        ? new Date(season.lockAt) <= new Date()
        : firstGame !== null && new Date(firstGame) <= new Date()));

  // A player the member already has must appear even if he is no longer
  // draftable, or his row renders nothing while still filling one of his
  // owner's slots. The pool entry wins on duplicates: it is the same row.
  const byId = new Map(poolPlayers.map((p) => [p.playerId, p]));
  for (const p of rosterPlayers) if (!byId.has(p.playerId)) byId.set(p.playerId, p);
  const players = [...byId.values()];

  const { data: slots } = await db
    .from('pool_roster_slots')
    .select('player_id, slot_position')
    .eq('entry_id', entryRow.id)
    .is('effective_to', null);
  const initialPicks: SlotPick[] = ((slots ?? []) as Array<{ player_id: number; slot_position: PoolPosition }>).map(
    (s) => ({ playerId: s.player_id, slotPosition: s.slot_position }),
  );

  return (
    <PoolComposer
      entryId={entryRow.id}
      isLocked={closed}
      isConfirmed={entryRow.is_confirmed}
      budgetCents={season.budgetCents}
      need={{ F: season.rosterF, D: season.rosterD, G: season.rosterG }}
      rosterTeams={season.rosterTeams}
      players={players}
      teams={teams}
      initialPicks={initialPicks}
      initialTeam={entryRow.team_pick}
      transactionsEnabled={season.transactionsEnabled}
      maxTransactions={season.maxTransactions}
      transactionsUsed={entryRow.transactions_used}
      starsEnabled={season.starsEnabled}
      initialStarForward={entryRow.star_forward_id}
      initialStarDefense={entryRow.star_defense_id}
    />
  );
}
