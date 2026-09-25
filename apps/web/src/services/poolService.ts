import type { SupabaseClient } from '@supabase/supabase-js';
import { parseSalaryFile, type SalaryFileLayout } from '@/lib/poolSalaryFile';
import { normalizeTeamAbbrev } from '@/lib/nhlTeamAliases';
import type { Database } from '@arena/supabase-client';
import { poolPosition } from './nhlService';

// Pool tables were added in migration 00067 — the generated Database type
// doesn't know them yet, so queries are cast through unknown (same pattern
// as pollService / nhlService).
type AnyClient = SupabaseClient<Database>;
type Db = SupabaseClient;

export type PoolPosition = 'F' | 'D' | 'G';

export interface PoolSeason {
  id: number;
  nhlSeason: number;
  name: string;
  budgetCents: number;
  rosterF: number;
  rosterD: number;
  rosterG: number;
  rosterTeams: number;
  lockAt: string | null;
  status: 'draft' | 'open' | 'locked' | 'final';
  transactionsEnabled: boolean;
  maxTransactions: number;
  transactionDeadline: string | null;
  tiebreaker: 'fewest_games' | 'none';
  isPublic: boolean;
  timezone: string;
  teamBasePoints: number;
  teamGfCoef: number;
  teamGaCoef: number;
  starsEnabled: boolean;
}

/** A single barème line: how many points a stat is worth this season. */
export interface ScoringRule {
  statKey: string;
  appliesTo: 'skater' | 'goalie';
  coefficient: number;
}

/** Every configurable stat, in display order, with FR labels for the admin UI. */
export const SCORING_CATALOG: Array<{ key: string; appliesTo: 'skater' | 'goalie'; label: string }> = [
  { key: 'goals', appliesTo: 'skater', label: 'But' },
  { key: 'assists', appliesTo: 'skater', label: 'Passe' },
  { key: 'plus_minus', appliesTo: 'skater', label: 'Différentiel (+/-)' },
  { key: 'pim', appliesTo: 'skater', label: 'Minute de pénalité' },
  { key: 'shots', appliesTo: 'skater', label: 'Tir au but' },
  { key: 'pp_goals', appliesTo: 'skater', label: 'But en avantage numérique' },
  { key: 'hits', appliesTo: 'skater', label: 'Mise en échec' },
  { key: 'blocked_shots', appliesTo: 'skater', label: 'Tir bloqué' },
  { key: 'takeaways', appliesTo: 'skater', label: 'Revirement provoqué' },
  { key: 'giveaways', appliesTo: 'skater', label: 'Revirement causé' },
  { key: 'win', appliesTo: 'goalie', label: 'Victoire' },
  { key: 'loss', appliesTo: 'goalie', label: 'Défaite' },
  { key: 'ot_loss', appliesTo: 'goalie', label: 'Défaite en prolongation' },
  { key: 'shutout', appliesTo: 'goalie', label: 'Blanchissage' },
  { key: 'save', appliesTo: 'goalie', label: 'Arrêt' },
  { key: 'goal_against', appliesTo: 'goalie', label: 'But alloué' },
];

export interface PoolPlayer {
  playerId: number;
  fullName: string;
  position: PoolPosition;
  teamAbbrev: string | null;
  priceCents: number;
  projPoints: number;
  /** Projected points per million $ — the default "bargain" sort. */
  value: number;
}

export interface StandingRow {
  entryId: number;
  teamName: string;
  teamLogo: string | null;
  memberId: string;
  ownerName: string | null;
  ownerAvatar: string | null;
  fantasyPoints: number;
  rank: number | null;
  gamesCounted: number;
  pointsLastDay: number;
  /** Rank at the previous nightly refresh — to show ▲/▼ movement (null if new). */
  previousRank: number | null;
}

/** One of a team's two official goalies — salary + season stats. */
export interface TeamGoalie {
  playerId: number;
  fullName: string;
  priceCents: number;
  gp: number;
  wins: number;
  losses: number;
  otLosses: number;
  saves: number;
  shotsAgainst: number;
  goalsAgainst: number;
  toiSeconds: number;
  shutouts: number;
  fantasyPoints: number;
}

/** An NHL team as a draftable pool "slot": its price (= its two goalies' cap hits) + season stats. */
export interface NhlTeamChoice {
  abbrev: string;
  name: string;
  priceCents: number;
  gp: number;
  gf: number;
  ga: number;
  wins: number;
  losses: number;
  teamPoints: number;
  /** The two official goalies (top-2 cap hits) whose salaries make the team price. */
  goalies: TeamGoalie[];
}

type SeasonRow = {
  id: number;
  nhl_season: number;
  name: string;
  budget_cents: number;
  roster_f: number;
  roster_d: number;
  roster_g: number;
  roster_teams: number;
  lock_at: string | null;
  status: PoolSeason['status'];
  transactions_enabled: boolean;
  max_transactions: number;
  transaction_deadline: string | null;
  tiebreaker: PoolSeason['tiebreaker'];
  is_public: boolean;
  timezone: string;
  team_base_points: number;
  team_gf_coef: number;
  team_ga_coef: number;
  stars_enabled: boolean;
};

const SEASON_COLS =
  'id, nhl_season, name, budget_cents, roster_f, roster_d, roster_g, roster_teams, lock_at, status, ' +
  'transactions_enabled, max_transactions, transaction_deadline, tiebreaker, is_public, timezone, ' +
  'team_base_points, team_gf_coef, team_ga_coef, stars_enabled';

function mapSeason(r: SeasonRow): PoolSeason {
  return {
    id: r.id,
    nhlSeason: r.nhl_season,
    name: r.name,
    budgetCents: r.budget_cents,
    rosterF: r.roster_f,
    rosterD: r.roster_d,
    rosterG: r.roster_g,
    rosterTeams: r.roster_teams,
    lockAt: r.lock_at,
    status: r.status,
    transactionsEnabled: r.transactions_enabled,
    maxTransactions: r.max_transactions,
    transactionDeadline: r.transaction_deadline,
    tiebreaker: r.tiebreaker,
    isPublic: r.is_public,
    timezone: r.timezone,
    teamBasePoints: Number(r.team_base_points),
    teamGfCoef: Number(r.team_gf_coef),
    teamGaCoef: Number(r.team_ga_coef),
    starsEnabled: Boolean(r.stars_enabled),
  };
}

/** The single active pool season (most recent non-final, else most recent). */
export async function getActiveSeason(client: AnyClient): Promise<PoolSeason | null> {
  const db = client as unknown as Db;
  const { data } = await db
    .from('pool_seasons')
    .select(SEASON_COLS)
    .order('nhl_season', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapSeason(data as unknown as SeasonRow) : null;
}

/** The barème for a season, as configured rows (admin reads/edits these). */
export async function getScoringRules(client: AnyClient, seasonId: number): Promise<ScoringRule[]> {
  const db = client as unknown as Db;
  const { data } = await db
    .from('pool_scoring_rules')
    .select('stat_key, applies_to, coefficient')
    .eq('season_id', seasonId);
  return ((data ?? []) as unknown as Array<{ stat_key: string; applies_to: 'skater' | 'goalie'; coefficient: number }>).map(
    (r) => ({ statKey: r.stat_key, appliesTo: r.applies_to, coefficient: Number(r.coefficient) }),
  );
}

/**
 * The draftable player pool for a season: prices joined with player identity,
 * pre-computed `value` (proj points per M$) for the default bargain sort.
 * The full list (~700 players) is small enough to ship to the client and
 * filter/sort there for an instant builder UX.
 */
export async function getPlayerPool(client: AnyClient, seasonId: number): Promise<PoolPlayer[]> {
  const db = client as unknown as Db;
  const { data } = await db
    .from('pool_player_prices')
    .select(
      'player_id, price_cents, position, proj_points, is_draftable, nhl_players!inner(full_name, team_abbrev)',
    )
    .eq('season_id', seasonId)
    .eq('is_draftable', true);

  const rows = (data ?? []) as unknown as Array<{
    player_id: number;
    price_cents: number;
    position: PoolPosition;
    proj_points: number;
    nhl_players: { full_name: string; team_abbrev: string | null };
  }>;

  return rows.map((r) => ({
    playerId: r.player_id,
    fullName: r.nhl_players.full_name,
    position: r.position,
    teamAbbrev: r.nhl_players.team_abbrev,
    priceCents: r.price_cents,
    projPoints: r.proj_points,
    value: r.price_cents > 0 ? r.proj_points / (r.price_cents / 1_000_000_00) : 0,
  }));
}

/**
 * Public standings for a season. Driven by ENTRIES (not the materialized
 * standings table) so a team appears the moment it's built — points come from
 * pool_standings when the nightly refresh has run, else 0. Rank is computed
 * here (ties share a rank) so it's consistent before and after the refresh.
 * Only teams that have actually built a roster (spent > 0) are listed.
 */
export async function getStandings(client: AnyClient, seasonId: number): Promise<StandingRow[]> {
  const db = client as unknown as Db;
  const { data } = await db
    .from('pool_entries')
    .select('id, team_name, team_logo, member_id, members(username, avatar_url), pool_standings(fantasy_points, games_counted, points_last_day, previous_rank)')
    .eq('season_id', seasonId)
    .eq('is_confirmed', true);

  type MemberEmbed = { username: string | null; avatar_url: string | null };
  type StandingEmbed = { fantasy_points: number; games_counted: number; points_last_day: number; previous_rank: number | null };
  const raw = (data ?? []) as unknown as Array<{
    id: number;
    team_name: string;
    team_logo: string | null;
    member_id: string;
    members: MemberEmbed | MemberEmbed[] | null;
    pool_standings: StandingEmbed[] | StandingEmbed | null;
  }>;

  const rows: StandingRow[] = raw.map((e) => {
    const st = Array.isArray(e.pool_standings) ? e.pool_standings[0] : e.pool_standings;
    const m = Array.isArray(e.members) ? e.members[0] : e.members;
    return {
      entryId: e.id,
      teamName: e.team_name,
      teamLogo: e.team_logo,
      memberId: e.member_id,
      ownerName: m?.username ?? null,
      ownerAvatar: m?.avatar_url ?? null,
      fantasyPoints: Number(st?.fantasy_points ?? 0),
      gamesCounted: st?.games_counted ?? 0,
      pointsLastDay: Number(st?.points_last_day ?? 0),
      previousRank: st?.previous_rank ?? null,
      rank: null,
    };
  });

  rows.sort((a, b) => b.fantasyPoints - a.fantasyPoints || a.teamName.localeCompare(b.teamName));
  let rank = 0;
  let seen = 0;
  let prev: number | null = null;
  for (const r of rows) {
    seen++;
    if (r.fantasyPoints !== prev) {
      rank = seen;
      prev = r.fantasyPoints;
    }
    r.rank = rank;
  }
  return rows;
}

/**
 * The 32 NHL teams as draftable "slots" for a season: price (= the two
 * official goalies' cap hits, counted in the budget) plus season stats
 * (GP/GF/GA/W/L), the pool points the team has produced, and the two goalies
 * (top-2 cap hits) with their stats. Shipped to the composer like the player pool.
 */
export async function getTeamChoices(client: AnyClient, seasonId: number): Promise<NhlTeamChoice[]> {
  const db = client as unknown as Db;

  const [{ data: teamData }, goaliesByTeam] = await Promise.all([
    db
      .from('pool_team_season')
      .select('team_abbrev, name, price_cents, gp, gf, ga, wins, losses, team_points')
      .eq('pool_season_id', seasonId)
      .order('name'),
    getTeamGoaliesByTeam(db, seasonId),
  ]);

  return ((teamData ?? []) as unknown as Array<{
    team_abbrev: string;
    name: string;
    price_cents: number;
    gp: number;
    gf: number;
    ga: number;
    wins: number;
    losses: number;
    team_points: number;
  }>).map((t) => ({
    abbrev: t.team_abbrev,
    name: t.name,
    priceCents: Number(t.price_cents),
    gp: Number(t.gp),
    gf: Number(t.gf),
    ga: Number(t.ga),
    wins: Number(t.wins),
    losses: Number(t.losses),
    teamPoints: Number(t.team_points),
    goalies: goaliesByTeam.get(t.team_abbrev) ?? [],
  }));
}

/**
 * The two official goalies per team (top-2 cap hits) with their season stats,
 * keyed by team abbrev. Their salaries are what make up the team price, so the
 * "top 2 by cap hit" rule here must match pool_team_price() in SQL.
 */
async function getTeamGoaliesByTeam(db: Db, seasonId: number): Promise<Map<string, TeamGoalie[]>> {
  const { data: priceData } = await db
    .from('pool_player_prices')
    .select('player_id, price_cents, nhl_players!inner(full_name, team_abbrev)')
    .eq('season_id', seasonId)
    .eq('position', 'G');
  const rows = (priceData ?? []) as unknown as Array<{
    player_id: number;
    price_cents: number;
    nhl_players: { full_name: string; team_abbrev: string | null };
  }>;

  // Group by team, keep the two highest cap hits.
  const byTeam = new Map<string, Array<{ playerId: number; fullName: string; priceCents: number }>>();
  for (const r of rows) {
    const team = r.nhl_players.team_abbrev;
    if (!team) continue;
    const arr = byTeam.get(team) ?? [];
    arr.push({ playerId: r.player_id, fullName: r.nhl_players.full_name, priceCents: Number(r.price_cents) });
    byTeam.set(team, arr);
  }
  for (const [team, arr] of byTeam) {
    byTeam.set(team, arr.sort((a, b) => b.priceCents - a.priceCents).slice(0, 2));
  }

  // Fetch season stats for just those goalies.
  const ids = [...byTeam.values()].flat().map((g) => g.playerId);
  const statMap = new Map<number, Record<string, number>>();
  if (ids.length > 0) {
    const { data: statData } = await db
      .from('pool_player_season_stats')
      .select('*')
      .eq('pool_season_id', seasonId)
      .in('player_id', ids);
    for (const r of (statData ?? []) as Array<Record<string, number>>) statMap.set(r.player_id as number, r);
  }

  const n = (v: unknown) => Number(v ?? 0);
  const result = new Map<string, TeamGoalie[]>();
  for (const [team, arr] of byTeam) {
    result.set(
      team,
      arr.map((g) => {
        const st = statMap.get(g.playerId);
        return {
          playerId: g.playerId,
          fullName: g.fullName,
          priceCents: g.priceCents,
          gp: n(st?.gp),
          wins: n(st?.wins),
          losses: n(st?.losses),
          otLosses: n(st?.ot_losses),
          saves: n(st?.saves),
          shotsAgainst: n(st?.shots_against),
          goalsAgainst: n(st?.goals_against),
          toiSeconds: n(st?.toi_seconds),
          shutouts: n(st?.shutouts),
          fantasyPoints: n(st?.fantasy_points),
        };
      }),
    );
  }
  return result;
}

/** Set the caller's team name + logo (allowed any time, even post-lock). */
export async function setIdentity(
  client: AnyClient,
  entryId: number,
  name: string,
  logo: string | null,
): Promise<{ error: string | null }> {
  const db = client as unknown as Db;
  const { error } = await db.rpc('pool_set_identity' as never, {
    p_entry_id: entryId,
    p_name: name,
    p_logo: logo,
  } as never);
  return { error: error?.message ?? null };
}

/** Create the caller's entry for a season (one per member, enforced by UNIQUE). */
export async function createEntry(
  client: AnyClient,
  seasonId: number,
  memberId: string,
  teamName: string,
): Promise<{ entryId: number | null; error: string | null }> {
  const db = client as unknown as Db;
  const { data, error } = await db
    .from('pool_entries')
    .insert({ season_id: seasonId, member_id: memberId, team_name: teamName })
    .select('id')
    .single();
  if (error) return { entryId: null, error: error.message };
  return { entryId: (data as { id: number }).id, error: null };
}

export interface SlotPick {
  playerId: number;
  slotPosition: PoolPosition;
}

/** A roster player with their season stat totals + fantasy points (0 pre-season). */
export interface RosterPlayerStats {
  playerId: number;
  fullName: string;
  teamAbbrev: string | null;
  slotPosition: PoolPosition;
  priceCents: number;
  gp: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  pim: number;
  shots: number;
  ppGoals: number;
  hits: number;
  blockedShots: number;
  toiSeconds: number;
  wins: number;
  losses: number;
  otLosses: number;
  shutouts: number;
  saves: number;
  shotsAgainst: number;
  goalsAgainst: number;
  fantasyPoints: number;
  /** True if the pooler designated this player as their star (points count double). */
  isStar: boolean;
}

/** An entry's active roster with each player's season stats, for the stat tables. */
export async function getRosterWithStats(
  client: AnyClient,
  seasonId: number,
  entryId: number,
): Promise<RosterPlayerStats[]> {
  const db = client as unknown as Db;

  const { data: starData } = await db
    .from('pool_entries')
    .select('star_forward_id, star_defense_id')
    .eq('id', entryId)
    .maybeSingle();
  const stars = starData as { star_forward_id: number | null; star_defense_id: number | null } | null;
  const starIds = new Set([stars?.star_forward_id, stars?.star_defense_id].filter((v): v is number => v != null));

  const { data: slotData } = await db
    .from('pool_roster_slots')
    .select('player_id, slot_position, price_cents, nhl_players!inner(full_name, team_abbrev)')
    .eq('entry_id', entryId)
    .is('effective_to', null);
  const slots = (slotData ?? []) as unknown as Array<{
    player_id: number;
    slot_position: PoolPosition;
    price_cents: number;
    nhl_players: { full_name: string; team_abbrev: string | null };
  }>;
  if (slots.length === 0) return [];

  const ids = slots.map((s) => s.player_id);
  const { data: statData } = await db
    .from('pool_player_season_stats')
    .select('*')
    .eq('pool_season_id', seasonId)
    .in('player_id', ids);
  const statMap = new Map<number, Record<string, number>>(
    ((statData ?? []) as Array<Record<string, number>>).map((r) => [r.player_id as number, r]),
  );

  const n = (v: unknown) => Number(v ?? 0);
  return slots.map((s) => {
    const st = statMap.get(s.player_id);
    return {
      playerId: s.player_id,
      fullName: s.nhl_players.full_name,
      teamAbbrev: s.nhl_players.team_abbrev,
      slotPosition: s.slot_position,
      priceCents: s.price_cents,
      gp: n(st?.gp),
      goals: n(st?.goals),
      assists: n(st?.assists),
      points: n(st?.points),
      plusMinus: n(st?.plus_minus),
      pim: n(st?.pim),
      shots: n(st?.shots),
      ppGoals: n(st?.pp_goals),
      hits: n(st?.hits),
      blockedShots: n(st?.blocked_shots),
      toiSeconds: n(st?.toi_seconds),
      wins: n(st?.wins),
      losses: n(st?.losses),
      otLosses: n(st?.ot_losses),
      shutouts: n(st?.shutouts),
      saves: n(st?.saves),
      shotsAgainst: n(st?.shots_against),
      goalsAgainst: n(st?.goals_against),
      fantasyPoints: n(st?.fantasy_points),
      isStar: starIds.has(s.player_id),
    };
  });
}

/**
 * Replace the entry's roster (pre-lock). Goes through the pool_save_roster
 * RPC so the whole replace is one atomic transaction with budget/cap checks
 * under a row lock — a failed insert can never wipe the prior roster.
 */
export async function saveRoster(
  client: AnyClient,
  entryId: number,
  picks: SlotPick[],
): Promise<{ error: string | null }> {
  const db = client as unknown as Db;
  const { error } = await db.rpc('pool_save_roster' as never, {
    p_entry_id: entryId,
    p_picks: picks.map((p) => ({ player_id: p.playerId, slot_position: p.slotPosition })),
  } as never);
  return { error: error?.message ?? null };
}

/** Lock the entry for the season (validates 12/6/2 + budget atomically). */
export async function lockEntry(client: AnyClient, entryId: number): Promise<{ error: string | null }> {
  const db = client as unknown as Db;
  const { error } = await db.rpc('pool_lock_entry' as never, { p_entry_id: entryId } as never);
  return { error: error?.message ?? null };
}

/** Set the entry's NHL team pick (the slot replacing goalies). Un-confirms. */
export async function setTeam(
  client: AnyClient,
  entryId: number,
  teamAbbrev: string | null,
): Promise<{ error: string | null }> {
  const db = client as unknown as Db;
  const { error } = await db.rpc('pool_set_team' as never, {
    p_entry_id: entryId,
    p_team: teamAbbrev,
  } as never);
  return { error: error?.message ?? null };
}

/** Set the entry's star forward + defenseman (points count double). Un-confirms. */
export async function setStars(
  client: AnyClient,
  entryId: number,
  forwardId: number | null,
  defenseId: number | null,
): Promise<{ error: string | null }> {
  const db = client as unknown as Db;
  const { error } = await db.rpc('pool_set_stars' as never, {
    p_entry_id: entryId,
    p_forward: forwardId,
    p_defense: defenseId,
  } as never);
  return { error: error?.message ?? null };
}

/** Confirm (activate) the entry — requires the exact roster + team + budget. */
export async function confirmEntry(client: AnyClient, entryId: number): Promise<{ error: string | null }> {
  const db = client as unknown as Db;
  const { error } = await db.rpc('pool_confirm_entry' as never, { p_entry_id: entryId } as never);
  return { error: error?.message ?? null };
}

export interface TradeEligibility {
  playerId: number;
  /** Games dressed for since joining THIS roster. */
  gamesPlayed: number;
  gamesRequired: number;
  /** Dressed for none of his club's last N games — the exception (00115). */
  isOut: boolean;
  canTrade: boolean;
}

/**
 * Who on this roster may be traded, and why not.
 *
 * pool_make_transaction enforces the rule server-side regardless; this exists
 * so the composer can grey a player out and say what is missing, instead of
 * teaching the rule through a rejection after the fact.
 */
export async function getTradeEligibility(client: AnyClient, entryId: number): Promise<TradeEligibility[]> {
  const db = client as unknown as Db;
  const { data, error } = await db.rpc('pool_trade_eligibility' as never, {
    p_entry_id: entryId,
  } as never);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{
    player_id: number; games_played: number; games_required: number;
    is_out: boolean; can_trade: boolean;
  }>).map((r) => ({
    playerId: Number(r.player_id),
    gamesPlayed: Number(r.games_played),
    gamesRequired: Number(r.games_required),
    isOut: Boolean(r.is_out),
    canTrade: Boolean(r.can_trade),
  }));
}

/** Make an in-season transaction: drop one player, add another (post-lock). */
export async function makeTransaction(
  client: AnyClient,
  entryId: number,
  dropPlayerId: number,
  addPlayerId: number,
): Promise<{ error: string | null }> {
  const db = client as unknown as Db;
  const { error } = await db.rpc('pool_make_transaction' as never, {
    p_entry_id: entryId,
    p_drop_player: dropPlayerId,
    p_add_player: addPlayerId,
  } as never);
  return { error: error?.message ?? null };
}

/**
 * "Équipe instantanée" — autopick a valid, on-budget roster the user can then
 * tweak. The antidote to blank-roster paralysis (top UX priority).
 *
 * Greedy by value (proj points per $), but every pick is guarded so we can
 * still afford the cheapest fill of all remaining slots — guaranteeing the
 * result is always a legal, within-budget 12F/6D/2G roster. A little
 * variation (skipping the very top pick sometimes) keeps teams from being
 * identical for everyone; the caller passes a `seed` (e.g. entry id) so it's
 * deterministic per user.
 */
export function buildQuickLineup(
  players: PoolPlayer[],
  need: { F: number; D: number; G: number },
  budgetCents: number,
  seed = 0,
): SlotPick[] {
  const byPos: Record<PoolPosition, PoolPlayer[]> = { F: [], D: [], G: [] };
  for (const p of players) byPos[p.position]?.push(p);
  // Cheapest-first per position, used to reserve budget for unfilled slots.
  const cheapest: Record<PoolPosition, PoolPlayer[]> = {
    F: [...byPos.F].sort((a, b) => a.priceCents - b.priceCents),
    D: [...byPos.D].sort((a, b) => a.priceCents - b.priceCents),
    G: [...byPos.G].sort((a, b) => a.priceCents - b.priceCents),
  };
  // Best-value-first per position, the order we try to draft from.
  const byValue: Record<PoolPosition, PoolPlayer[]> = {
    F: [...byPos.F].sort((a, b) => b.value - a.value),
    D: [...byPos.D].sort((a, b) => b.value - a.value),
    G: [...byPos.G].sort((a, b) => b.value - a.value),
  };

  const chosen = new Set<number>();
  const remaining: Record<PoolPosition, number> = { F: need.F, D: need.D, G: need.G };

  // Cheapest cost to fill `count` more slots at `pos`, excluding chosen players.
  const reserveFor = (pos: PoolPosition, count: number): number => {
    let sum = 0;
    let n = 0;
    for (const p of cheapest[pos]) {
      if (n >= count) break;
      if (chosen.has(p.playerId)) continue;
      sum += p.priceCents;
      n++;
    }
    return sum;
  };

  const picks: SlotPick[] = [];
  let spent = 0;
  const order: PoolPosition[] = ['G', 'D', 'F']; // scarcest pools first

  for (const pos of order) {
    let skip = seed % 2; // tiny per-user variation on the top pick
    for (const cand of byValue[pos]) {
      if (remaining[pos] === 0) break;
      if (chosen.has(cand.playerId)) continue;
      // Budget left after this pick must still cover the cheapest fill of all
      // other still-empty slots (this position minus one, plus other positions).
      const others =
        reserveFor(pos, remaining[pos] - 1) +
        (['F', 'D', 'G'] as PoolPosition[])
          .filter((o) => o !== pos)
          .reduce((acc, o) => acc + reserveForExcluding(o, remaining[o], cand.playerId), 0);
      if (spent + cand.priceCents + others > budgetCents) continue;
      if (skip > 0) {
        skip--;
        continue;
      }
      chosen.add(cand.playerId);
      picks.push({ playerId: cand.playerId, slotPosition: pos });
      spent += cand.priceCents;
      remaining[pos]--;
    }
    // Safety net: if value-guarding left slots unfilled, fill cheapest available
    // — still budget-guarded so we never hand back an over-cap roster.
    for (const p of cheapest[pos]) {
      if (remaining[pos] === 0) break;
      if (chosen.has(p.playerId)) continue;
      const others =
        reserveFor(pos, remaining[pos] - 1) +
        (['F', 'D', 'G'] as PoolPosition[])
          .filter((o) => o !== pos)
          .reduce((acc, o) => acc + reserveForExcluding(o, remaining[o], p.playerId), 0);
      if (spent + p.priceCents + others > budgetCents) continue;
      chosen.add(p.playerId);
      picks.push({ playerId: p.playerId, slotPosition: pos });
      spent += p.priceCents;
      remaining[pos]--;
    }
  }

  // reserveFor variant that also excludes a candidate being considered.
  function reserveForExcluding(pos: PoolPosition, count: number, excludeId: number): number {
    let sum = 0;
    let n = 0;
    for (const p of cheapest[pos]) {
      if (n >= count) break;
      if (chosen.has(p.playerId) || p.playerId === excludeId) continue;
      sum += p.priceCents;
      n++;
    }
    return sum;
  }

  return picks;
}

// ===========================================================================
// Salary CSV import — set real cap-hit prices from a snapshot we compile
// ourselves (the numbers are facts; we never scrape or redistribute a feed).
// The risky part is matching CSV names to NHL player_ids, so matching is
// accent/punctuation tolerant and reports anything it can't resolve rather
// than guessing.
// ===========================================================================

/** Normalize a name for matching: strip accents, punctuation, suffixes, case. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .toLowerCase()
    .replace(/[.,'’`\-]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "$12,500,000" / "12500000" / "12.5M" / "925000" → integer cents. */
export function parseMoneyCents(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[$,\s]/g, '');
  if (!s) return null;
  const m = s.match(/^([\d.]+)(m)?$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (Number.isNaN(num)) return null;
  const dollars = m[2] === 'm' ? num * 1_000_000 : num;
  return Math.round(dollars * 100);
}

/** Quote-aware split of a single CSV line. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export interface SalaryCsvRow {
  name: string;
  team: string;
  capHit: string;
  /** Set by parseSalaryFile, which knows the column's unit. Takes precedence
   *  over parsing `capHit` here: '12.50' means 12.5 MILLION in the real file,
   *  and parseMoneyCents would read it as twelve dollars fifty. */
  capHitCents?: number | null;
  /** The salary cell verbatim, for reporting a row that could not be priced.
   *  Never parsed — see the note on `capHit`. */
  capHitRaw?: string;
  /** Projected points from the same spreadsheet, when present. */
  projPoints?: number | null;
  /** The file's own position cell. The last resort for telling apart two
   *  players who share a name AND a team — the two Elias Petterssons are both
   *  on Vancouver and only the C/D differs. */
  position?: string | null;
  /** 1-based line in the source file, for error messages. */
  line?: number;
}

/**
 * The file's position cell as F/D/G, or null when it says nothing usable.
 *
 * Deliberately NOT poolPosition(), which answers 'F' for every input it does
 * not recognise — including an empty cell. Here an unreadable cell must
 * disqualify itself rather than vote for the forward.
 */
function csvPoolPosition(raw: string | null | undefined): PoolPosition | null {
  const v = (raw ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z]/g, '');
  if (!v) return null;
  if (['D', 'DEF', 'DEFENSE', 'DEFENSEMAN', 'DEFENSEUR'].includes(v)) return 'D';
  if (['G', 'GK', 'GOALIE', 'GOALTENDER', 'GARDIEN'].includes(v)) return 'G';
  if (['C', 'CEN', 'CENTRE', 'CENTER', 'L', 'LW', 'AG', 'R', 'RW', 'AD', 'W', 'AIL', 'AILIER',
       'F', 'FORWARD', 'A', 'ATT', 'ATTAQUANT'].includes(v)) return 'F';
  return null;
}

/** Parse CSV text into rows. Accepts headers: name/player, team, cap_hit/salary. */
export function parseSalaryCsv(text: string): SalaryCsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const ni = idx('name', 'player', 'joueur');
  const ti = idx('team', 'equipe', 'équipe', 'tm');
  const ci = idx('cap_hit', 'caphit', 'salary', 'salaire', 'cap');
  return lines.slice(1).map((line) => {
    const c = splitCsvLine(line);
    return { name: (c[ni] ?? '').trim(), team: (c[ti] ?? '').trim(), capHit: (c[ci] ?? '').trim() };
  });
}

export interface MatchablePlayer {
  playerId: number;
  fullName: string;
  teamAbbrev: string | null;
  position: string;
}

export interface SalaryMatchResult {
  matched: Array<{ playerId: number; priceCents: number; position: PoolPosition; name: string; projPoints: number | null }>;
  unmatched: SalaryCsvRow[];
  ambiguous: Array<{ row: SalaryCsvRow; candidates: number }>;
  /** Rows the file left without a readable salary. The player is resolved
   *  anyway — the price they keep is what the operator has to be told, and
   *  that cannot be looked up without an id. */
  invalidPrice: Array<{ row: SalaryCsvRow; playerId: number | null }>;
}

/**
 * Match CSV salary rows to NHL players. Pure + unit-testable. Strategy, in
 * order: exact normalized full name (unique) → full name disambiguated by
 * team → unique last-name + team, with the file's position as a last-resort
 * tiebreak. Anything still unresolved is reported, never guessed.
 */
export function matchSalaryRows(players: MatchablePlayer[], rows: SalaryCsvRow[]): SalaryMatchResult {
  const byFull = new Map<string, MatchablePlayer[]>();
  const byLastTeam = new Map<string, MatchablePlayer[]>();
  const push = (m: Map<string, MatchablePlayer[]>, k: string, p: MatchablePlayer) => {
    const a = m.get(k);
    if (a) a.push(p);
    else m.set(k, [p]);
  };
  for (const p of players) {
    const nf = normalizeName(p.fullName);
    push(byFull, nf, p);
    const last = nf.split(' ').slice(1).join(' ');
    if (last) push(byLastTeam, `${last}|${normalizeTeamAbbrev(p.teamAbbrev)}`, p);
  }

  const res: SalaryMatchResult = { matched: [], unmatched: [], ambiguous: [], invalidPrice: [] };

  // "Last, First" → "First Last", then normalize. Precompute per row so we can
  // count duplicate names: a name listed twice in the snapshot means real
  // homonyms (e.g. the two Sebastian Ahos), for which we must NOT match on
  // name alone — otherwise a row for the twin who isn't on a roster would
  // hijack the one who is. Those require an exact team match.
  const normOf = (name: string) =>
    normalizeName(name.includes(',') ? name.split(',').map((s) => s.trim()).reverse().join(' ') : name);
  const nameCount = new Map<string, number>();
  for (const r of rows) nameCount.set(normOf(r.name), (nameCount.get(normOf(r.name)) ?? 0) + 1);

  for (const row of rows) {
    const norm = normOf(row.name);
    const team = normalizeTeamAbbrev(row.team);
    const isHomonym = (nameCount.get(norm) ?? 0) > 1 || (byFull.get(norm)?.length ?? 0) > 1;

    let candidates = byFull.get(norm) ?? [];
    if (isHomonym) {
      // Disambiguate strictly by team; no team match → don't guess.
      candidates = team ? candidates.filter((c) => normalizeTeamAbbrev(c.teamAbbrev) === team) : [];
    } else if (candidates.length === 0) {
      const last = norm.split(' ').slice(1).join(' ');
      candidates = byLastTeam.get(`${last}|${team}`) ?? [];
    }

    // Same name AND same team still happens: both Elias Petterssons play for
    // Vancouver. The file's own position cell is then the only thing left that
    // separates them — and only when it is readable, so an empty cell reports
    // the homonym instead of silently picking one.
    if (candidates.length > 1) {
      const rowPos = csvPoolPosition(row.position);
      if (rowPos) {
        const byPos = candidates.filter((c) => poolPosition(c.position) === rowPos);
        if (byPos.length === 1) candidates = byPos;
      }
    }

    // The price is checked only now: a row with no salary still has to name
    // its player, because "keep the last known salary" is only auditable if
    // the report can say WHICH price is being kept.
    const priceCents = row.capHitCents ?? parseMoneyCents(row.capHit);
    if (priceCents === null || priceCents <= 0) {
      res.invalidPrice.push({
        row,
        playerId: candidates.length === 1 ? candidates[0].playerId : null,
      });
      continue;
    }

    if (candidates.length === 1) {
      const p = candidates[0];
      res.matched.push({
        playerId: p.playerId,
        priceCents,
        position: poolPosition(p.position),
        name: p.fullName,
        projPoints: row.projPoints ?? null,
      });
    } else if (candidates.length > 1) {
      res.ambiguous.push({ row, candidates: candidates.length });
    } else {
      res.unmatched.push(row);
    }
  }
  return res;
}

export interface SalaryImportReport {
  total: number;
  matched: number;
  unmatched: SalaryCsvRow[];
  ambiguous: Array<{ row: SalaryCsvRow; candidates: number }>;
  invalidPrice: Array<{ row: SalaryCsvRow; playerId: number | null }>;
  /** One entry per row the file left without a salary: the price that player
   *  therefore keeps, and whether it was ever a real cap hit. `importedAt`
   *  null with a price means a derived placeholder — a number nobody
   *  verified, in a pool where every other price is real. */
  keptPrices: Array<{
    name: string;
    line?: number;
    priceCents: number | null;
    importedAt: string | null;
    draftable: boolean;
  }>;
  budgetCents: number | null;
  /** What the reader detected: which columns, and the salary unit. */
  layout: SalaryFileLayout;
  /** Team codes in the file that match no NHL club. */
  unknownTeams: string[];
  /** Columns the reader could not find at all. */
  missingColumns: string[];
  /** Lines skipped as blank or separator rows. */
  skippedLines: number[];
  /** True when nothing was written (preview mode). */
  dryRun: boolean;
  /** Echo of the fullSnapshot flag, so the UI can refuse to apply a preview
   *  that was computed under a different setting. */
  fullSnapshot: boolean;
  /** Players currently draftable that this snapshot would retire. */
  delistCount: number;
  /** How many of those are already on at least one member's roster — the
   *  number that actually hurts. */
  delistDrafted: number;
  /** A few names from delistDrafted, to make the number concrete. */
  delistDraftedSample: string[];
  /** Open entries whose stored salary mass moved because prices changed.
   *  null in preview mode — nothing was recomputed. */
  repricedEntries: number | null;
  /** Open entries now above the cap after the reprice. These members have to
   *  drop someone before they can save again. */
  overBudgetEntries: number | null;
  /** Confirmed entries handed back to their owner because the price change
   *  put them over the cap. */
  unconfirmedEntries: number | null;
  /** Sample of matched rows, for the preview table. */
  sample: Array<{ name: string; priceCents: number; position: PoolPosition; projPoints: number | null }>;
}

/**
 * Import a salary snapshot into pool_player_prices for a season. Idempotent.
 *
 * Two modes:
 *  - incremental (default): only the listed players are upserted — safe for a
 *    post-trade touch-up that updates a handful of salaries.
 *  - fullSnapshot: every other priced player for the season is first marked
 *    non-draftable, so a complete season snapshot can't leave stale players
 *    draftable. Use this for the start-of-season load.
 *
 * Optionally sets the season budget to the real NHL cap.
 */
export async function importSalaries(
  client: AnyClient,
  seasonId: number,
  csvText: string,
  opts: { budgetCents?: number; fullSnapshot?: boolean; dryRun?: boolean } = {},
): Promise<SalaryImportReport> {
  const db = client as unknown as Db;
  const parsed = parseSalaryFile(csvText);
  const rows: SalaryCsvRow[] = parsed.rows.map((r) => ({
    name: r.name,
    team: r.team,
    // capHit stays empty on purpose: matchSalaryRows falls back to parsing it
    // when capHitCents is null, and that generic parser does not know the
    // file's unit — it would read a rejected "12.50" as twelve dollars fifty.
    // The raw cell travels in capHitRaw, for display only.
    capHit: '',
    capHitRaw: r.capHitRaw,
    capHitCents: r.capHitCents,
    projPoints: r.projPoints,
    position: r.position,
    line: r.line,
  }));

  // Refuse rather than guess: a salary column we could not denominate would
  // write every price out by a factor of a million, and nothing downstream
  // would flag it.
  if (parsed.layout.capUnit === 'unknown') {
    throw new Error(`Colonne de salaire illisible : ${parsed.layout.capUnitReason}`);
  }

  const PAGE = 1000;
  const playerRows: Array<{ player_id: number; full_name: string; team_abbrev: string | null; position: string }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('nhl_players')
      .select('player_id, full_name, team_abbrev, position')
      .order('player_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`lecture des joueurs : ${error.message}`);
    const batch = (data ?? []) as unknown as typeof playerRows;
    playerRows.push(...batch);
    if (batch.length < PAGE) break;
  }
  const playersData = playerRows;
  const players: MatchablePlayer[] = (
    (playersData ?? []) as unknown as Array<{
      player_id: number;
      full_name: string;
      team_abbrev: string | null;
      position: string;
    }>
  ).map((r) => ({
    playerId: r.player_id,
    fullName: r.full_name,
    teamAbbrev: r.team_abbrev,
    position: r.position,
  }));
  const result = matchSalaryRows(players, rows);

  // De-dupe by player_id (two CSV rows can resolve to the same player, e.g. a
  // player listed twice, or a homonym whose twin isn't on a current roster).
  // Last occurrence wins; Postgres upsert rejects a batch that touches the
  // same conflict key twice, so this must happen before the write.
  const byPlayer = new Map<number, (typeof result.matched)[number]>();
  for (const m of result.matched) byPlayer.set(m.playerId, m);
  const deduped = [...byPlayer.values()];

  const stampedAt = new Date().toISOString();
  if (deduped.length > 0 && !opts.dryRun) {
    const priceRows = deduped.map((m) => ({
      season_id: seasonId,
      player_id: m.playerId,
      price_cents: m.priceCents,
      position: m.position,
      is_draftable: true,
      // Always present: proj_points is NOT NULL, and postgrest-js derives the
      // column list from the union of keys across the batch — so omitting it
      // on one row sends NULL for that row and 400s the entire upsert. A
      // single blank Pts cell (a goalie, an em-dash) was enough.
      proj_points: m.projPoints ?? 0,
      // Provenance. A price with no stamp was never a real cap hit — it is
      // seedPoolSeason's derivation, and the report has to be able to say so.
      imported_at: stampedAt,
    }));
    const { error } = await db.from('pool_player_prices').upsert(priceRows, { onConflict: 'season_id,player_id' });
    if (error) throw new Error(`upsert prices: ${error.message}`);
  }


  // What the rows with no salary end up keeping. Read in every mode: the
  // preview is where the operator decides whether "keep the last known
  // salary" is acceptable, and that turns on whether the kept price is real.
  const keptPrices: SalaryImportReport['keptPrices'] = [];
  if (result.invalidPrice.length > 0) {
    const ids = [...new Set(result.invalidPrice.map((x) => x.playerId).filter((id): id is number => id !== null))];
    const known = new Map<number, { price_cents: number; imported_at: string | null; is_draftable: boolean }>();
    for (let i = 0; i < ids.length; i += PAGE) {
      const { data, error } = await db
        .from('pool_player_prices')
        .select('player_id, price_cents, imported_at, is_draftable')
        .eq('season_id', seasonId)
        .in('player_id', ids.slice(i, i + PAGE));
      if (error) throw new Error(`lecture des prix conservés : ${error.message}`);
      for (const r of (data ?? []) as Array<{
        player_id: number; price_cents: number; imported_at: string | null; is_draftable: boolean;
      }>) {
        known.set(r.player_id, { price_cents: r.price_cents, imported_at: r.imported_at, is_draftable: r.is_draftable });
      }
    }
    for (const x of result.invalidPrice) {
      const k = x.playerId === null ? undefined : known.get(x.playerId);
      keptPrices.push({
        name: x.row.name,
        line: x.row.line,
        priceCents: k?.price_cents ?? null,
        importedAt: k?.imported_at ?? null,
        draftable: k?.is_draftable ?? false,
      });
    }
  }

  // What a full snapshot would retire — computed in every mode, because the
  // preview has to be able to show the cost of the destructive option BEFORE
  // it is taken. Previously the dry run was byte-identical with the checkbox
  // on or off, so its most dangerous effect was the one thing it never showed.
  let delistCount = 0;
  let delistDrafted = 0;
  let delistDraftedSample: string[] = [];
  let protectedIds: number[] = [];
  if (opts.fullSnapshot) {
    const keep = new Set(deduped.map((m) => m.playerId));
    const { data: priced } = await db
      .from('pool_player_prices')
      .select('player_id')
      .eq('season_id', seasonId)
      .eq('is_draftable', true);
    const losing = ((priced ?? []) as Array<{ player_id: number }>)
      .map((r) => r.player_id)
      .filter((id) => !keep.has(id));
    delistCount = losing.length;

    if (losing.length > 0) {
      const { data: entries } = await db.from('pool_entries').select('id').eq('season_id', seasonId);
      const entryIds = ((entries ?? []) as Array<{ id: number }>).map((e) => e.id);
      if (entryIds.length > 0) {
        const { data: slots } = await db
          .from('pool_roster_slots')
          .select('player_id')
          .in('entry_id', entryIds)
          .in('player_id', losing);
        const draftedIds = [
          ...new Set(((slots ?? []) as Array<{ player_id: number }>).map((r) => r.player_id)),
        ];
        delistDrafted = draftedIds.length;
        protectedIds = draftedIds;
        if (draftedIds.length > 0) {
          const { data: names } = await db
            .from('nhl_players')
            .select('full_name')
            .in('player_id', draftedIds.slice(0, 10));
          delistDraftedSample = ((names ?? []) as Array<{ full_name: string }>).map((r) => r.full_name);
        }
      }
    }
  }

  if (opts.fullSnapshot && !opts.dryRun) {
    // Refuse a snapshot that matched almost nothing. A truncated export, a
    // mis-detected delimiter or a stale player table all produce "0 appariées",
    // and de-drafting the whole season on that basis is unrecoverable from the
    // file — the file is what failed.
    if (deduped.length < 50) {
      throw new Error(
        `Instantané complet refusé : seulement ${deduped.length} joueur(s) appariés. ` +
        'Corrige le fichier, ou décoche « Instantané complet » pour une retouche.',
      );
    }

    // Never retire a player someone already has on their roster.
    const spare = [...deduped.map((m) => m.playerId), ...protectedIds];
    let q = db.from('pool_player_prices').update({ is_draftable: false }).eq('season_id', seasonId);
    if (spare.length > 0) q = q.not('player_id', 'in', `(${spare.join(',')})`);
    const { error } = await q;
    if (error) throw new Error(`retrait des joueurs absents : ${error.message}`);
  }
  if (opts.budgetCents && !opts.dryRun) {
    const { error } = await db
      .from('pool_seasons')
      .update({ budget_cents: opts.budgetCents })
      .eq('id', seasonId);
    if (error) throw new Error(`plafond salarial : ${error.message}`);
  }

  // Prices just moved. A roster slot's price is a snapshot taken when the slot
  // was inserted, so every open entry's stored salary mass is now stale —
  // "le prix du jour, pour tous" only holds if the stored value follows the
  // price. Runs after the budget update so the over-cap count uses the new
  // ceiling. Locked entries stay frozen, by design (00067).
  let repricedEntries: number | null = null;
  let overBudgetEntries: number | null = null;
  let unconfirmedEntries: number | null = null;
  if (!opts.dryRun) {
    const { data, error } = await db.rpc('pool_reprice_open_entries' as never, {
      p_season_id: seasonId,
    } as never);
    if (error) throw new Error(`recalcul des masses salariales : ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { entries_repriced: number; entries_over_budget: number; entries_unconfirmed: number }
      | undefined;
    repricedEntries = row?.entries_repriced ?? 0;
    overBudgetEntries = row?.entries_over_budget ?? 0;
    unconfirmedEntries = row?.entries_unconfirmed ?? 0;
  }

  return {
    total: rows.length,
    matched: deduped.length,
    unmatched: result.unmatched,
    ambiguous: result.ambiguous,
    invalidPrice: result.invalidPrice,
    keptPrices,
    budgetCents: opts.budgetCents ?? null,
    layout: parsed.layout,
    unknownTeams: parsed.unknownTeams,
    missingColumns: parsed.missingColumns,
    skippedLines: parsed.skippedLines,
    dryRun: Boolean(opts.dryRun),
    fullSnapshot: Boolean(opts.fullSnapshot),
    delistCount,
    delistDrafted,
    delistDraftedSample,
    repricedEntries,
    overBudgetEntries,
    unconfirmedEntries,
    sample: deduped.slice(0, 8).map((m) => ({
      name: m.name,
      priceCents: m.priceCents,
      position: m.position,
      projPoints: m.projPoints,
    })),
  };
}
