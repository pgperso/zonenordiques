import type { Metadata } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { getActiveSeason, getPlayerPool, getTeamChoices, type SlotPick, type PoolPosition } from '@/services/poolService';
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
  return { title, robots: { index: false, follow: false } };
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
  const ENTRY_COLS = 'id, is_locked, team_pick, is_confirmed, transactions_used, star_forward_id, star_defense_id';
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
    const { data: created } = await db
      .from('pool_entries')
      .insert({ season_id: season.id, member_id: user.id, team_name: teamName })
      .select(ENTRY_COLS)
      .single();
    // If the insert lost a race on the UNIQUE(season_id, member_id) constraint
    // (e.g. two tabs), fall back to reading the row that won.
    if (created) {
      entry = created;
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
  const entryRow = entry as unknown as { id: number; is_locked: boolean; team_pick: string | null; is_confirmed: boolean; transactions_used: number; star_forward_id: number | null; star_defense_id: number | null };

  const [players, teams] = await Promise.all([
    getPlayerPool(supabase, season.id),
    getTeamChoices(supabase, season.id),
  ]);

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
      isLocked={Boolean(season.lockAt && new Date(season.lockAt) <= new Date())}
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
