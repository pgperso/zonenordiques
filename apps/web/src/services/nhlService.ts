import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeTeamAbbrev } from '@/lib/nhlTeamAliases';
import type { Database } from '@arena/supabase-client';

// NHL data tables were added in migration 00054 — the generated Database
// type doesn't know them yet, so writes are cast through unknown.
type AnyClient = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// NHL API client
//
// Two public, key-less JSON APIs:
//   - api-web.nhle.com/v1     → live data (scores, boxscores, rosters)
//   - api.nhle.com/stats/rest → aggregate stats
//
// We only need the web API for the pool. All shapes below mirror real
// responses (confirmed against live endpoints), trimmed to the fields we use.
// ---------------------------------------------------------------------------

const WEB_API = 'https://api-web.nhle.com/v1';

/** A named value the API returns as `{ default: string, fr?: string }`. */
interface LocalizedName {
  default: string;
  fr?: string;
}

interface ScoreTeam {
  id: number;
  abbrev: string;
  name: LocalizedName;
  score?: number;
  logo?: string;
}

interface ScoreGame {
  id: number;
  season: number;
  gameType: number;
  gameDate: string; // YYYY-MM-DD
  startTimeUTC?: string;
  gameState: string; // FUT | PRE | LIVE | CRIT | OFF | FINAL
  awayTeam: ScoreTeam;
  homeTeam: ScoreTeam;
}

interface ScoreResponse {
  currentDate: string;
  games: ScoreGame[];
}

interface BoxscoreSkater {
  playerId: number;
  sweaterNumber?: number;
  name: LocalizedName;
  position: string;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  pim: number;
  sog: number;
  powerPlayGoals: number;
  hits: number;
  blockedShots: number;
  takeaways: number;
  giveaways: number;
  toi: string; // "MM:SS"
}

interface BoxscoreGoalie {
  playerId: number;
  sweaterNumber?: number;
  name: LocalizedName;
  position: string; // 'G'
  decision?: string; // 'W' | 'L' | 'O'
  pim: number;
  shotsAgainst: number;
  saves: number;
  goalsAgainst: number;
  toi: string;
}

interface BoxscoreTeamStats {
  forwards: BoxscoreSkater[];
  defense: BoxscoreSkater[];
  goalies: BoxscoreGoalie[];
}

interface BoxscoreResponse {
  id: number;
  season: number;
  gameType: number;
  gameDate: string;
  startTimeUTC?: string;
  gameState: string;
  awayTeam: ScoreTeam;
  homeTeam: ScoreTeam;
  playerByGameStats?: {
    awayTeam: BoxscoreTeamStats;
    homeTeam: BoxscoreTeamStats;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch JSON from the NHL web API. The public API rate-limits bursts (429),
 * so we retry transient failures (429 / 5xx) with exponential backoff,
 * honouring a Retry-After header when present. This matters for the roster
 * and pricing syncs, which fan out ~65 calls across all 32 teams.
 */
async function nhlFetch<T>(path: string, attempt = 0): Promise<T> {
  const res = await fetch(`${WEB_API}${path}`, {
    headers: { Accept: 'application/json' },
    // NHL data is shared reference data; let the platform cache briefly.
    next: { revalidate: 60 },
  });

  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 500 * 2 ** attempt);
    await sleep(waitMs);
    return nhlFetch<T>(path, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`NHL API ${path} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Games for a given date (YYYY-MM-DD), or "now" for the current slate. */
export function fetchScore(date: string | 'now' = 'now') {
  return nhlFetch<ScoreResponse>(`/score/${date}`);
}

/** Full boxscore (per-player stats) for a single game. */
export function fetchBoxscore(gameId: number) {
  return nhlFetch<BoxscoreResponse>(`/gamecenter/${gameId}/boxscore`);
}

interface StandingsTeam {
  teamAbbrev: LocalizedName;
  teamName: LocalizedName;
  teamCommonName?: LocalizedName;
  placeName?: LocalizedName;
  conferenceName?: string;
  divisionName?: string;
  teamLogo?: string;
}
interface StandingsResponse {
  standings: StandingsTeam[];
}

interface RosterPlayer {
  id: number;
  firstName: LocalizedName;
  lastName: LocalizedName;
  positionCode: string; // C/L/R/D/G
  sweaterNumber?: number;
  shootsCatches?: string;
  headshot?: string;
}
interface RosterResponse {
  forwards: RosterPlayer[];
  defensemen: RosterPlayer[];
  goalies: RosterPlayer[];
}

interface ClubStatsSkater {
  playerId: number;
  positionCode: string;
  goals: number;
  assists: number;
  powerPlayGoals: number;
}
interface ClubStatsGoalie {
  playerId: number;
  wins: number;
  shutouts: number;
  saves: number;
  goalsAgainst: number;
}
interface ClubStatsResponse {
  skaters: ClubStatsSkater[];
  goalies: ClubStatsGoalie[];
}

/** All 32 teams (with conference/division) from the live standings. */
export function fetchStandings() {
  return nhlFetch<StandingsResponse>(`/standings/now`);
}

/** A team's current roster (forwards / defensemen / goalies). */
export function fetchRoster(teamAbbrev: string) {
  return nhlFetch<RosterResponse>(`/roster/${teamAbbrev}/current`);
}

/** A team's per-player season totals (for price derivation). */
export function fetchClubStats(teamAbbrev: string, season: number, gameType = 2) {
  return nhlFetch<ClubStatsResponse>(`/club-stats/${teamAbbrev}/${season}/${gameType}`);
}

/** Collapse the NHL position code to the pool's F/D/G class. */
export function poolPosition(positionCode: string): 'F' | 'D' | 'G' {
  if (positionCode === 'D') return 'D';
  if (positionCode === 'G') return 'G';
  return 'F'; // C / L / R
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "15:43" → 943 seconds. Returns 0 for missing/malformed values. */
export function toiToSeconds(toi: string | undefined | null): number {
  if (!toi) return 0;
  const [min, sec] = toi.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(min) || Number.isNaN(sec)) return 0;
  return min * 60 + sec;
}

/** A game is "final" (safe to score) once the NHL marks it OFF or FINAL. */
function isFinal(gameState: string): boolean {
  return gameState === 'OFF' || gameState === 'FINAL';
}

// ---------------------------------------------------------------------------
// Ingestion — write NHL data into Supabase. Caller passes a service-role
// client (RLS-bypassing); these functions never run with a user client.
// ---------------------------------------------------------------------------

type TeamUpsert = {
  abbrev: string;
  team_id: number;
  name: string;
  logo_url: string | null;
};

type PlayerUpsert = {
  player_id: number;
  full_name: string;
  position: string;
  team_abbrev: string;
  sweater_number: number | null;
};

type StatUpsert = {
  game_id: number;
  player_id: number;
  team_abbrev: string;
  position: string;
  goals: number;
  assists: number;
  points: number;
  plus_minus: number;
  pim: number;
  shots: number;
  powerplay_goals: number;
  hits: number;
  blocked_shots: number;
  takeaways: number;
  giveaways: number;
  decision: string | null;
  shots_against: number | null;
  saves: number | null;
  goals_against: number | null;
  shutout: boolean;
  toi_seconds: number;
};

/** Map a boxscore into per-player stat rows for one team. */
function statsForTeam(
  gameId: number,
  teamAbbrev: string,
  stats: BoxscoreTeamStats,
): { players: PlayerUpsert[]; rows: StatUpsert[] } {
  const players: PlayerUpsert[] = [];
  const rows: StatUpsert[] = [];

  for (const s of [...stats.forwards, ...stats.defense]) {
    players.push({
      player_id: s.playerId,
      full_name: s.name.default,
      position: s.position,
      team_abbrev: teamAbbrev,
      sweater_number: s.sweaterNumber ?? null,
    });
    rows.push({
      game_id: gameId,
      player_id: s.playerId,
      team_abbrev: teamAbbrev,
      position: s.position,
      goals: s.goals ?? 0,
      assists: s.assists ?? 0,
      points: s.points ?? 0,
      plus_minus: s.plusMinus ?? 0,
      pim: s.pim ?? 0,
      shots: s.sog ?? 0,
      powerplay_goals: s.powerPlayGoals ?? 0,
      hits: s.hits ?? 0,
      blocked_shots: s.blockedShots ?? 0,
      takeaways: s.takeaways ?? 0,
      giveaways: s.giveaways ?? 0,
      decision: null,
      shots_against: null,
      saves: null,
      goals_against: null,
      shutout: false,
      toi_seconds: toiToSeconds(s.toi),
    });
  }

  for (const g of stats.goalies) {
    const toiSeconds = toiToSeconds(g.toi);
    // A goalie who never took the ice (TOI 0) didn't play — skip so we don't
    // award/charge anything to a healthy scratch backup.
    if (toiSeconds === 0) continue;
    players.push({
      player_id: g.playerId,
      full_name: g.name.default,
      position: 'G',
      team_abbrev: teamAbbrev,
      sweater_number: g.sweaterNumber ?? null,
    });
    rows.push({
      game_id: gameId,
      player_id: g.playerId,
      team_abbrev: teamAbbrev,
      position: 'G',
      goals: 0,
      assists: 0,
      points: 0,
      plus_minus: 0,
      pim: g.pim ?? 0,
      shots: 0,
      powerplay_goals: 0,
      hits: 0,
      blocked_shots: 0,
      takeaways: 0,
      giveaways: 0,
      decision: g.decision ?? null,
      shots_against: g.shotsAgainst ?? 0,
      saves: g.saves ?? 0,
      goals_against: g.goalsAgainst ?? 0,
      // A shutout is a win in which no goal was allowed over a full game.
      shutout: g.decision === 'W' && (g.goalsAgainst ?? 0) === 0 && toiSeconds >= 3600,
      toi_seconds: toiSeconds,
    });
  }

  return { players, rows };
}

export interface SyncResult {
  targetDate: string;
  gamesSeen: number;
  gamesFinalized: number;
  statRows: number;
  /** Game ids whose boxscore failed this run; retried next run. */
  failedGames: number[];
}

/**
 * Ingest one date's slate: upsert teams + games, then for every *final* game
 * fetch its boxscore and upsert per-player stats. Fully idempotent — re-running
 * the same date overwrites rows via their natural keys, so a re-sync after a
 * stat correction just converges. Returns counts for the run log.
 */
export async function syncDate(
  admin: AnyClient,
  date: string | 'now' = 'now',
): Promise<SyncResult> {
  const db = admin as unknown as SupabaseClient;
  const score = await fetchScore(date);
  const games = score.games ?? [];

  // 1. Teams seen in this slate (minimal columns; standings sync enriches
  //    conference/division separately without clobbering these).
  const teamMap = new Map<string, TeamUpsert>();
  for (const g of games) {
    for (const t of [g.awayTeam, g.homeTeam]) {
      teamMap.set(t.abbrev, {
        abbrev: t.abbrev,
        team_id: t.id,
        name: t.name.default,
        logo_url: t.logo ?? null,
      });
    }
  }
  if (teamMap.size > 0) {
    const { error } = await db
      .from('nhl_teams')
      .upsert([...teamMap.values()], { onConflict: 'abbrev' });
    if (error) throw new Error(`upsert teams: ${error.message}`);
  }

  // 2. Games.
  if (games.length > 0) {
    const gameRows = games.map((g) => ({
      game_id: g.id,
      season: g.season,
      game_type: g.gameType,
      game_date: g.gameDate,
      start_time_utc: g.startTimeUTC ?? null,
      away_abbrev: g.awayTeam.abbrev,
      home_abbrev: g.homeTeam.abbrev,
      away_score: g.awayTeam.score ?? null,
      home_score: g.homeTeam.score ?? null,
      game_state: g.gameState,
      last_synced_at: new Date().toISOString(),
    }));
    const { error } = await db
      .from('nhl_games')
      .upsert(gameRows, { onConflict: 'game_id' });
    if (error) throw new Error(`upsert games: ${error.message}`);
  }

  // 3. Per-player stats for final games only. Each game is isolated: one bad
  //    boxscore must not kill the rest of the slate (it's logged and the next
  //    run retries it). Per game we replace its stat rows so a corrected
  //    boxscore that drops a player can't leave a stale row behind.
  const finalGames = games.filter((g) => isFinal(g.gameState));
  let statRows = 0;
  const failedGames: number[] = [];

  for (const g of finalGames) {
    try {
      const box = await fetchBoxscore(g.id);
      if (!box.playerByGameStats) continue;

      const away = statsForTeam(g.id, g.awayTeam.abbrev, box.playerByGameStats.awayTeam);
      const home = statsForTeam(g.id, g.homeTeam.abbrev, box.playerByGameStats.homeTeam);
      const players = [...away.players, ...home.players];
      const rows = [...away.rows, ...home.rows];

      // Players first (stats FK them), de-duped by id.
      const uniquePlayers = [...new Map(players.map((p) => [p.player_id, p])).values()];
      if (uniquePlayers.length > 0) {
        const { error } = await db.from('nhl_players').upsert(uniquePlayers, { onConflict: 'player_id' });
        if (error) throw new Error(`upsert players: ${error.message}`);
      }

      // Replace this game's stats (prune players removed by a stat correction).
      const del = await db.from('nhl_player_game_stats').delete().eq('game_id', g.id);
      if (del.error) throw new Error(`clear stats: ${del.error.message}`);
      if (rows.length > 0) {
        const { error } = await db.from('nhl_player_game_stats').insert(rows);
        if (error) throw new Error(`insert stats: ${error.message}`);
        statRows += rows.length;
      }
    } catch (err) {
      // Isolate the failure; keep ingesting the rest of the slate.
      failedGames.push(g.id);
    }
  }

  return {
    targetDate: score.currentDate ?? (date === 'now' ? score.currentDate : date),
    gamesSeen: games.length,
    gamesFinalized: finalGames.length,
    statRows,
    failedGames,
  };
}

/**
 * Populate teams + the full ~700-player league roster. Run before opening a
 * season's draft (and periodically, as rosters change). Upserts teams first
 * (FK target), then every team's current roster.
 */
export async function syncRosters(admin: AnyClient): Promise<{ teams: number; players: number }> {
  const db = admin as unknown as SupabaseClient;
  const { standings } = await fetchStandings();

  const teamRows = standings.map((t) => ({
    abbrev: t.teamAbbrev.default,
    name: t.teamCommonName?.default ?? t.teamName.default,
    place_name: t.placeName?.default ?? null,
    full_name: t.teamName.default,
    conference: t.conferenceName ?? null,
    division: t.divisionName ?? null,
    logo_url: t.teamLogo ?? null,
    is_active: true,
  }));
  const { error: teamErr } = await db.from('nhl_teams').upsert(teamRows, { onConflict: 'abbrev' });
  if (teamErr) throw new Error(`upsert teams: ${teamErr.message}`);

  let players = 0;
  for (const t of teamRows) {
    const roster = await fetchRoster(t.abbrev);
    const all = [...roster.forwards, ...roster.defensemen, ...roster.goalies];
    const rows = all.map((p) => ({
      player_id: p.id,
      first_name: p.firstName.default,
      last_name: p.lastName.default,
      full_name: `${p.firstName.default} ${p.lastName.default}`,
      position: p.positionCode, // C/L/R/D/G — matches the CHECK constraint
      team_abbrev: t.abbrev,
      sweater_number: p.sweaterNumber ?? null,
      shoots_catches: p.shootsCatches ?? null,
      headshot_url: p.headshot ?? null,
      is_active: true,
    }));
    const { error } = await db.from('nhl_players').upsert(rows, { onConflict: 'player_id' });
    if (error) throw new Error(`upsert roster ${t.abbrev}: ${error.message}`);
    players += rows.length;
  }
  return { teams: teamRows.length, players };
}

/** Prior-season fantasy points (the standard barème) — drives price derivation. */
function priorSkaterPoints(s: ClubStatsSkater): number {
  return s.goals * 2 + s.assists * 1 + s.powerPlayGoals * 0.5;
}
function priorGoaliePoints(g: ClubStatsGoalie): number {
  return g.wins * 2 + g.shutouts * 3 + g.saves * 0.1 - g.goalsAgainst;
}

/** $2M floor, $20M ceiling, scaled from prior-season fantasy output. */
function derivePriceCents(projPoints: number): number {
  const priceM = Math.min(20, Math.max(2, 2 + projPoints * 0.1));
  return Math.round(priceM * 1_000_000_00); // 1 M$ = 1e8 cents
}

export interface SeedResult {
  seasonId: number;
  pricedPlayers: number;
}

/**
 * Seed (or refresh) a pool season: the season row, the scoring barème, and a
 * price for every currently-rostered player derived from their prior-season
 * fantasy points. Prior stats are mapped by playerId across all 32 teams, so
 * a player who changed teams is still priced correctly. Idempotent (upserts).
 */
export async function seedPoolSeason(
  admin: AnyClient,
  opts: { nhlSeason: number; priorSeason: number; name: string; lockAt?: string; gameTypes?: number[] },
): Promise<SeedResult> {
  const db = admin as unknown as SupabaseClient;

  const { data: seasonRow, error: seasonErr } = await db
    .from('pool_seasons')
    .upsert(
      {
        nhl_season: opts.nhlSeason,
        name: opts.name,
        game_types: opts.gameTypes ?? [2],
        lock_at: opts.lockAt ?? null,
      },
      { onConflict: 'nhl_season' },
    )
    .select('id')
    .single();
  if (seasonErr) throw new Error(`upsert season: ${seasonErr.message}`);
  const seasonId = (seasonRow as { id: number }).id;

  const rules = [
    { stat_key: 'goals', applies_to: 'skater', coefficient: 2 },
    { stat_key: 'assists', applies_to: 'skater', coefficient: 1 },
    { stat_key: 'pp_goals', applies_to: 'skater', coefficient: 0.5 },
    { stat_key: 'win', applies_to: 'goalie', coefficient: 2 },
    { stat_key: 'shutout', applies_to: 'goalie', coefficient: 3 },
    { stat_key: 'save', applies_to: 'goalie', coefficient: 0.1 },
    { stat_key: 'goal_against', applies_to: 'goalie', coefficient: -1 },
  ].map((r) => ({ ...r, season_id: seasonId }));
  const { error: rulesErr } = await db
    .from('pool_scoring_rules')
    .upsert(rules, { onConflict: 'season_id,stat_key' });
  if (rulesErr) throw new Error(`upsert rules: ${rulesErr.message}`);

  // Prior-season fantasy points by playerId, across all teams.
  const { standings } = await fetchStandings();
  const priorPoints = new Map<number, number>();
  for (const t of standings) {
    const stats = await fetchClubStats(t.teamAbbrev.default, opts.priorSeason);
    for (const s of stats.skaters) priorPoints.set(s.playerId, priorSkaterPoints(s));
    for (const g of stats.goalies) priorPoints.set(g.playerId, priorGoaliePoints(g));
  }

  // Price every currently-rostered player — as a PLACEHOLDER. A derived figure
  // is not a cap hit, so it leaves imported_at null and the player stays
  // undraftable until a real salary arrives, by import or by hand (00117).
  // The CHECK added there would reject is_draftable on an unverified price
  // anyway; this states the intent rather than tripping over it.
  const { data: playersData } = await db.from('nhl_players').select('player_id, position');
  const players = (playersData ?? []) as Array<{ player_id: number; position: string }>;

  // Never overwrite a real salary. Re-running the seed used to silently replace
  // every imported cap hit with a derivation, which is unrecoverable without
  // the original spreadsheet.
  const { data: verifiedData } = await db
    .from('pool_player_prices')
    .select('player_id')
    .eq('season_id', seasonId)
    .not('imported_at', 'is', null);
  const verified = new Set(
    ((verifiedData ?? []) as Array<{ player_id: number }>).map((r) => Number(r.player_id)),
  );

  const priceRows = players.filter((p) => !verified.has(p.player_id)).map((p) => {
    const proj = Math.max(0, priorPoints.get(p.player_id) ?? 0);
    return {
      season_id: seasonId,
      player_id: p.player_id,
      price_cents: derivePriceCents(proj),
      position: poolPosition(p.position),
      proj_points: Number(proj.toFixed(2)),
      is_draftable: false,
    };
  });
  if (priceRows.length > 0) {
    const { error } = await db
      .from('pool_player_prices')
      .upsert(priceRows, { onConflict: 'season_id,player_id' });
    if (error) throw new Error(`upsert prices: ${error.message}`);
  }

  return { seasonId, pricedPlayers: priceRows.length };
}

// ── Player search: resolving names the roster sync does not carry ──────────

const SEARCH_API = 'https://search.d3.nhle.com/api/v1/search/player';

interface SearchHit {
  playerId: string;
  name: string;
  positionCode: string;
  teamAbbrev: string | null;
  lastTeamAbbrev: string | null;
  active: boolean;
  sweaterNumber: number | null;
}

/**
 * Look a player up in the NHL's public search index.
 *
 * `/roster/{team}/current` only lists players on an active NHL roster, so a
 * drafted prospect who is still in junior or college is missing from it — and
 * therefore missing from nhl_players, and therefore impossible to price. The
 * search index does carry them, with their real playerId, which is what the
 * pool needs in order to reference them at all.
 */
async function searchPlayers(query: string, attempt = 0): Promise<SearchHit[]> {
  const url = `${SEARCH_API}?culture=en-us&limit=8&q=${encodeURIComponent(query)}`;
  // A timeout, and no redirect following: the repo's safeFetch convention
  // exists because an unbounded outbound call is how one hung connection eats
  // the whole function budget and loses every player resolved so far.
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });

  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(Math.min(6000, 400 * 2 ** attempt));
    return searchPlayers(query, attempt + 1);
  }
  if (!res.ok) return [];
  try {
    return (await res.json()) as SearchHit[];
  } catch {
    return [];
  }
}

/** C/L/R/D/G — the values nhl_players.position accepts. */
function searchPosition(code: string): 'C' | 'L' | 'R' | 'D' | 'G' | null {
  const c = code?.toUpperCase();
  if (c === 'C' || c === 'D' || c === 'G') return c;
  if (c === 'L' || c === 'LW') return 'L';
  if (c === 'R' || c === 'RW') return 'R';
  return null;
}

export interface ResolveRequest { name: string; team: string }
export interface ResolveReport {
  added: Array<{ name: string; playerId: number; team: string | null; position: string }>;
  /** Names the index did not return, or returned too ambiguously to accept. */
  stillMissing: Array<{ name: string; reason: string }>;
}

/**
 * Add missing players to nhl_players so they can be priced.
 *
 * Never guesses. A hit is accepted only when the normalized full name matches
 * exactly; when several players share that name, the spreadsheet's team must
 * pick one of them, and if it does not the row is left unresolved and
 * reported. A stale team in the file (a player traded since) is tolerated when
 * the name alone is unambiguous — Patrick Kane listed under CHI still resolves
 * to the one Patrick Kane.
 *
 * `active` in the search index means "on an NHL roster right now", which is
 * exactly the population syncRosters already covers. Gating on it here
 * rejected the players this function exists for — Rutger McGroarty (PIT),
 * Jani Nyman (SEA) and Jonathan Drouin (STL) are all in the index, all with
 * a team, all `active: false`. So it is used only to break a tie between two
 * players of the same name, never to reject one.
 */
export async function resolveMissingPlayers(
  client: AnyClient,
  requests: ResolveRequest[],
): Promise<ResolveReport> {
  // Untyped client, as everywhere else in this file: the generated
  // Database types make the upsert argument resolve to never.
  const db = client as unknown as SupabaseClient;
  const report: ResolveReport = { added: [], stillMissing: [] };
  if (requests.length === 0) return report;

  // team_abbrev is a FK on nhl_teams; anything else has to be left null.
  const { data: teamRows } = await db.from('nhl_teams').select('abbrev');
  const knownTeams = new Set(
    ((teamRows ?? []) as Array<{ abbrev: string }>).map((t) => t.abbrev),
  );

  const norm = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

  type NewPlayer = {
    player_id: number;
    first_name: string | null;
    last_name: string | null;
    full_name: string;
    position: 'C' | 'L' | 'R' | 'D' | 'G';
    team_abbrev: string | null;
    sweater_number: number | null;
    is_active: boolean;
  };
  const toInsert = new Map<number, NewPlayer>();

  for (const req of requests) {
    const hits = await searchPlayers(req.name);
    const wanted = norm(req.name);
    const exact = hits.filter((h) => norm(h.name) === wanted);

    if (exact.length === 0) {
      report.stillMissing.push({
        name: req.name,
        reason: 'aucun joueur de ce nom dans l’index de la LNH — vérifie l’orthographe',
      });
      continue;
    }

    let chosen = exact[0];
    if (exact.length > 1) {
      // The file's team decides. Only if it picks several of them does
      // "currently on a roster" break the remaining tie.
      const byTeam = exact.filter(
        (h) => (h.teamAbbrev ?? h.lastTeamAbbrev ?? '') === req.team && req.team !== '',
      );
      const narrowed = byTeam.length > 1 ? byTeam.filter((h) => h.active) : byTeam;
      if (narrowed.length !== 1) {
        report.stillMissing.push({
          name: req.name,
          reason: req.team
            ? `${exact.length} joueurs de ce nom, l’équipe « ${req.team} » ne les départage pas`
            : `${exact.length} joueurs de ce nom, et le fichier ne donne pas d’équipe`,
        });
        continue;
      }
      chosen = narrowed[0];
    }

    const position = searchPosition(chosen.positionCode);
    if (!position) {
      report.stillMissing.push({ name: req.name, reason: `position inconnue (${chosen.positionCode})` });
      continue;
    }

    // isInteger, not isFinite: 1.5 and 0 are finite and would poison the
    // batch insert, discarding every other resolved player with it.
    const playerId = Number(chosen.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      report.stillMissing.push({ name: req.name, reason: 'identifiant illisible' });
      continue;
    }

    const abbrev = normalizeTeamAbbrev(chosen.teamAbbrev ?? chosen.lastTeamAbbrev ?? '') || null;
    const [firstName, ...rest] = chosen.name.split(' ');
    toInsert.set(playerId, {
      player_id: playerId,
      first_name: firstName ?? null,
      last_name: rest.join(' ') || null,
      full_name: chosen.name,
      position,
      team_abbrev: abbrev && knownTeams.has(abbrev) ? abbrev : null,
      sweater_number: chosen.sweaterNumber ?? null,
      // Recorded as the index reports it. Nothing filters on this column, and
      // a prospect who has not dressed is genuinely not active — claiming
      // otherwise would be the only false fact in the row.
      is_active: chosen.active,
    });
    report.added.push({ name: chosen.name, playerId, team: abbrev, position });
  }

  if (toInsert.size > 0) {
    const { error } = await db
      .from('nhl_players')
      .upsert([...toInsert.values()], { onConflict: 'player_id' });
    if (error) throw new Error(`upsert players: ${error.message}`);
  }

  return report;
}
