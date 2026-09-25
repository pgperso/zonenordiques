'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { SalaryImportReport } from '@/services/poolService';

/**
 * Salary / projection import for the pool.
 *
 * Two rules shape this component, both learned from an audit of its first
 * version:
 *
 *  1. **Nothing is applied that was not previewed.** ~900 players are matched
 *     by name against a live roster and a handful always fail, so writing
 *     first and reporting afterwards means repairing prices in a pool people
 *     may already be drafting from. The report records the exact file AND the
 *     exact snapshot mode it was computed under; Apply refuses if either has
 *     changed since, because ticking the checkbox after the preview used to
 *     change the write with no visible difference at all.
 *
 *  2. **The latest request wins, not the last response.** Several operations
 *     chain automatically and the slow ones take minutes; without a run token,
 *     a stale response could replace the panel with another file's report
 *     while the filename on screen said something else.
 */
const M_CENTS = 100_000_000; // cents in one million dollars

function fmtMoney(cents: number): string {
  return `${(cents / M_CENTS).toFixed(2)} M$`;
}

/** Identity of "the report describes exactly this input". */
function inputKey(csv: string, fullSnapshot: boolean): string {
  return `${fullSnapshot ? 'full' : 'partial'}:${csv.length}:${csv.slice(0, 200)}`;
}

type Phase = 'idle' | 'rosters' | 'analysing' | 'resolving' | 'applying';

const PHASE_LABEL: Record<Exclude<Phase, 'idle'>, string> = {
  rosters: 'Mise à jour des alignements LNH…',
  analysing: 'Analyse du fichier…',
  resolving: 'Recherche des joueurs dans la LNH…',
  applying: 'Écriture des prix…',
};

export function SalaryImportSection({ seasonId, cardCls }: { seasonId: number; cardCls: string }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<'utf-8' | 'windows-1252' | null>(null);
  // Off by default: on, a five-row post-trade file retires the rest of the
  // league in one click.
  const [fullSnapshot, setFullSnapshot] = useState(false);
  const [report, setReport] = useState<SalaryImportReport | null>(null);
  /** The input the visible report was computed from. */
  const [reportKey, setReportKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [rostersFresh, setRostersFresh] = useState(false);
  // Why each name could not be resolved. A bare count ("18 toujours
  // introuvables") gives the operator nothing to act on — a misspelling, a
  // homonym and a player absent from the league all read the same.
  const [unresolved, setUnresolved] = useState<Array<{ name: string; reason: string }>>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  // Monotonic token: a response whose token is stale is discarded rather than
  // allowed to describe an input the operator has since replaced.
  const runRef = useRef(0);

  const busy = phase !== 'idle';
  const upToDate = Boolean(report && reportKey === inputKey(csv, fullSnapshot));

  function clearInput() {
    setCsv('');
    setFileName(null);
    setEncoding(null);
    setReport(null);
    setReportKey(null);
    setUnresolved([]);
  }

  /** Read a response safely: a proxy or platform error is not JSON. */
  async function readJson(res: Response): Promise<Record<string, unknown>> {
    const text = await res.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(
        res.ok ? 'Réponse illisible du serveur' : `Erreur ${res.status} — réponse inattendue`,
      );
    }
    if (!res.ok) throw new Error(String(parsed.error ?? `Erreur ${res.status}`));
    return parsed;
  }

  async function syncRosters(silent = false): Promise<boolean> {
    setPhase('rosters');
    try {
      const json = await readJson(await fetch('/api/pool/rosters', { method: 'POST' }));
      setRostersFresh(true);
      if (!silent) toast.success(`${json.players} joueurs sur ${json.teams} équipes`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de la synchronisation');
      return false;
    } finally {
      setPhase('idle');
    }
  }

  /** Preview. Writes no prices. */
  async function analyse(text: string, snapshot: boolean) {
    if (!text.trim()) return;
    const run = ++runRef.current;
    setPhase('analysing');
    try {
      const json = await readJson(
        await fetch('/api/pool/salaries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seasonId, csv: text, dryRun: true, fullSnapshot: snapshot }),
        }),
      );
      if (run !== runRef.current) return; // superseded by a newer input
      setReport(json.report as SalaryImportReport);
      setReportKey(inputKey(text, snapshot));
    } catch (e) {
      if (run !== runRef.current) return;
      setReport(null);
      setReportKey(null);
      toast.error(e instanceof Error ? e.message : 'Échec de l’analyse');
    } finally {
      if (run === runRef.current) setPhase('idle');
    }
  }

  async function onFile(file: File) {
    if (/\.xlsx?$/i.test(file.name) && !/\.csv$/i.test(file.name)) {
      // Clear, or the operator sees the previous file's report beside a
      // rejected selection, with Apply still armed for the old content.
      clearInput();
      toast.error('Excel ne peut pas être lu tel quel. Fichier → Enregistrer sous → CSV UTF-8.');
      return;
    }

    // Excel's plain "CSV" writes Windows-1252 and File.text() always decodes
    // UTF-8, so "Stützle" arrives broken and — worse — the "Équ." header stops
    // matching and the team column silently disappears.
    const buf = await file.arrayBuffer();
    const asUtf8 = new TextDecoder('utf-8').decode(buf);
    let text = asUtf8;
    let enc: 'utf-8' | 'windows-1252' = 'utf-8';
    if (asUtf8.includes('�')) {
      const as1252 = new TextDecoder('windows-1252').decode(buf);
      if (as1252.includes('�')) {
        clearInput();
        toast.error('Encodage du fichier non reconnu. Réexporte en CSV UTF-8.');
        return;
      }
      text = as1252;
      enc = 'windows-1252';
    }
    // windows-1252 maps almost every byte, so a UTF-16 export slips through
    // the check above as plausible garbage. NUL bytes do not occur in a CSV.
    if (text.includes('\u0000')) {
      clearInput();
      toast.error('Ce fichier n’est pas un CSV texte. Réexporte en CSV UTF-8.');
      return;
    }
    if (!text.trim()) {
      clearInput();
      toast.error('Le fichier est vide.');
      return;
    }

    setCsv(text);
    setEncoding(enc);
    setFileName(file.name);
    setReport(null);
    setReportKey(null);
    setUnresolved([]);

    // The roster refresh is the prerequisite for matching; the operator has no
    // reason to know that, so it happens here rather than being asked for.
    if (!rostersFresh) {
      const ok = await syncRosters(true);
      if (!ok) toast.error('Alignements non rafraîchis — des joueurs seront signalés à tort.');
    }
    await analyse(text, fullSnapshot);
  }

  /** The only action that writes prices. */
  async function apply() {
    if (!report || !upToDate) return;
    const run = ++runRef.current;
    const text = csv;
    const snapshot = fullSnapshot;
    setPhase('applying');
    try {
      const json = await readJson(
        await fetch('/api/pool/salaries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seasonId, csv: text, dryRun: false, fullSnapshot: snapshot }),
        }),
      );
      const applied = json.report as SalaryImportReport;
      setReport(applied);
      setReportKey(inputKey(text, snapshot));
      toast.success(`${applied.matched} joueurs mis à jour`);
    } catch (e) {
      // The write may have landed partially. Never leave a panel on screen
      // claiming nothing was written when that is no longer knowable.
      setReport(null);
      setReportKey(null);
      toast.error(
        `${e instanceof Error ? e.message : 'Échec'} — relance l’analyse pour voir l’état réel`,
      );
    } finally {
      if (run === runRef.current) setPhase('idle');
    }
  }

  /**
   * Add the unmatched players to nhl_players so they can be priced. This
   * writes: a drafted prospect who has not dressed is on no roster, so it is
   * the only way a rookie cap hit has anywhere to go.
   */
  async function resolveMissing() {
    if (!report || report.unmatched.length === 0) return;
    const names = report.unmatched.map((r) => ({ name: r.name, team: r.team }));
    const text = csv;
    const snapshot = fullSnapshot;
    setPhase('resolving');
    try {
      const json = await readJson(
        await fetch('/api/pool/resolve-players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ players: names }),
        }),
      );
      const r = json.report as
        | { added?: unknown[]; stillMissing?: Array<{ name: string; reason: string }> }
        | undefined;
      const added = r?.added?.length ?? 0;
      const left = r?.stillMissing ?? [];
      setUnresolved(left);
      toast.success(
        left.length > 0
          ? `${added} joueurs ajoutés, ${left.length} toujours introuvables`
          : `${added} joueurs ajoutés`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de la résolution');
    } finally {
      setPhase('idle');
    }
    // The player table changed, so the visible report no longer describes it.
    await analyse(text, snapshot);
  }

  const problems = report
    ? report.unmatched.length + report.ambiguous.length + report.invalidPrice.length
    : 0;
  // Kept prices that no import ever confirmed: the ones that look real in the
  // composer and are not. Named, not counted — the list below scrolls, so an
  // aggregate warning points at players the operator cannot see.
  const unverified = report
    ? report.keptPrices.filter((k) => k.priceCents !== null && !k.importedAt && k.draftable)
    : [];
  // Those same players first: they are the only actionable rows in the list.
  const keptSorted = report
    ? [...report.keptPrices].sort(
        (a, b) => Number(b.priceCents !== null && !b.importedAt) - Number(a.priceCents !== null && !a.importedAt),
      )
    : [];
  const applyDisabled = busy || !report || !upToDate || report.dryRun === false;

  return (
    <section className={cardCls}>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Salaires &amp; projections
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        Fichier CSV exporté d’Excel. Colonnes reconnues : prénom + nom, équipe,
        points projetés et masse salariale — en millions ou en dollars, détecté automatiquement.
        Le plafond salarial se règle dans «&nbsp;Saison &amp; alignement&nbsp;» ci-dessous.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            // Clear the value, or picking the SAME path fires no event at all:
            // the operator fixes the spreadsheet, re-exports over it, re-picks
            // it, nothing happens, and Apply then writes the old content.
            e.target.value = '';
            if (f) void onFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-describedby="salary-file-name"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Choisir un fichier CSV
        </button>
        <span id="salary-file-name" className="text-sm text-gray-600">{fileName}</span>
        {encoding === 'windows-1252' && (
          <span className="text-xs text-amber-700">Encodage ANSI converti.</span>
        )}
      </div>

      {/* The roster refresh runs on its own when a file is loaded — saying so
          in passing, rather than in a box with a button, keeps it from
          reading as a step the operator has to take first. The manual link
          stays for the one case the chain does not cover: re-syncing without
          re-loading the file. */}
      <p className="mt-2 text-xs text-gray-500">
        Au chargement, les alignements de la LNH sont resynchronisés puis le fichier est
        analysé — automatiquement. Seul «&nbsp;Appliquer&nbsp;» écrit les prix.
        {rostersFresh && <span className="text-green-700"> Alignements à jour.</span>}{' '}
        <button
          type="button"
          onClick={() => void syncRosters(false)}
          disabled={busy}
          className="underline hover:text-gray-700 disabled:opacity-50"
        >
          Resynchroniser maintenant
        </button>
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-gray-500">ou coller le contenu</summary>
        <label htmlFor="salary-csv" className="mt-2 block text-xs text-gray-500">
          Contenu CSV
        </label>
        <textarea
          id="salary-csv"
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setReport(null);
            setReportKey(null);
            setFileName(null);
            setEncoding(null);
          }}
          rows={6}
          placeholder="#,Nom,,Âge,Équ.,Pos,PJ,B,P,Pts,PPP,CapH"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
        />
      </details>

      <div className="mt-4">
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={fullSnapshot}
            onChange={(e) => setFullSnapshot(e.target.checked)}
            disabled={busy}
            className="mt-1"
          />
          <span>
            <strong>Instantané complet</strong>
            <span className="block text-xs text-gray-500">
              Les joueurs absents du fichier deviennent non repêchables. En début de saison
              seulement. L’aperçu dira combien sont concernés ; ceux qui sont déjà dans une
              équipe ne sont jamais retirés.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void analyse(csv, fullSnapshot)}
          disabled={busy || !csv.trim()}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
        >
          {upToDate ? 'Réanalyser' : 'Analyser'}
        </button>
        <button
          type="button"
          onClick={() => void apply()}
          disabled={applyDisabled}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          Appliquer
        </button>
        <span role="status" aria-live="polite" className="text-sm">
          {busy && <span className="text-gray-600">{PHASE_LABEL[phase as Exclude<Phase, 'idle'>]}</span>}
          {!busy && report && !upToDate && (
            <span className="text-amber-700">
              Le fichier ou l’option a changé depuis l’aperçu — relance l’analyse.
            </span>
          )}
          {!busy && !report && csv.trim() && (
            <span className="text-gray-500">Analyse le fichier avant d’appliquer.</span>
          )}
        </span>
      </div>

      {report && (
        <div
          className={`mt-5 rounded-md border p-4 text-sm ${
            upToDate ? 'border-gray-200 bg-gray-50' : 'border-amber-300 bg-amber-50'
          }`}
        >
          <p className="font-semibold text-gray-900">
            {report.dryRun ? 'Aperçu — aucun prix n’a été écrit' : 'Import appliqué'}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <div><dt className="text-gray-500">Lignes lues</dt><dd className="font-semibold">{report.total}</dd></div>
            <div><dt className="text-gray-500">Appariées</dt><dd className="font-semibold text-green-700">{report.matched}</dd></div>
            <div><dt className="text-gray-500">Problèmes</dt><dd className={`font-semibold ${problems ? 'text-orange-700' : ''}`}>{problems}</dd></div>
            <div><dt className="text-gray-500">Salaires lus en</dt><dd className="font-semibold">{report.layout.capUnit === 'millions' ? 'millions' : 'dollars'}</dd></div>
          </dl>

          {report.fullSnapshot && report.delistCount > 0 && (
            <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3">
              <p className="font-semibold text-red-800">
                Instantané complet : {report.delistCount} joueur(s) deviendront non repêchables.
              </p>
              {report.delistDrafted > 0 ? (
                <p className="mt-1 text-red-800">
                  <strong>{report.delistDrafted} sont déjà dans une équipe</strong>
                  {report.delistDraftedSample.length > 0 && <> ({report.delistDraftedSample.join(', ')}
                    {report.delistDrafted > report.delistDraftedSample.length && '…'})</>}
                  {' '}et seront <strong>conservés</strong> pour ne pas bloquer ces membres.
                </p>
              ) : (
                <p className="mt-1 text-red-700">Aucun n’est dans une équipe de membre.</p>
              )}
            </div>
          )}

          {/* Prices moved, so every unlocked roster was re-priced. The number
              that matters to the admin is who is now over the cap: those
              members can no longer sauvegarder without dropping someone. */}
          {!report.dryRun && report.repricedEntries !== null && (
            <div
              className={`mt-4 rounded-md border p-3 ${
                report.overBudgetEntries ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
              }`}
            >
              {/* A re-run of the same file changes nothing, which is the point
                  — but "0 équipes mises à jour" beside "une équipe dépasse le
                  plafond" reads as a contradiction. The first is what moved
                  just now; the second is the standing state. */}
              <p className="text-gray-700">
                {report.repricedEntries === 0 ? (
                  <>Aucune masse salariale à recalculer — les prix n’ont pas bougé.</>
                ) : (
                  <>
                    Masses salariales recalculées : <strong>{report.repricedEntries}</strong>{' '}
                    {report.repricedEntries === 1
                      ? 'équipe non verrouillée mise à jour'
                      : 'équipes non verrouillées mises à jour'}{' '}
                    au prix du jour.
                  </>
                )}
              </p>
              {report.overBudgetEntries ? (
                <p className="mt-1 text-amber-800">
                  <strong>
                    {report.overBudgetEntries === 1
                      ? 'Une équipe dépasse maintenant le plafond'
                      : `${report.overBudgetEntries} équipes dépassent maintenant le plafond`}
                  </strong>{' '}
                  et {report.overBudgetEntries === 1 ? 'devra' : 'devront'} retirer un joueur avant
                  de pouvoir sauvegarder
                  {report.unconfirmedEntries
                    ? report.unconfirmedEntries === 1
                      ? ' (dont une qui était confirmée et ne l’est plus)'
                      : ` (dont ${report.unconfirmedEntries} qui étaient confirmées et ne le sont plus)`
                    : ''}
                  .
                </p>
              ) : (
                <p className="mt-1 text-gray-500">Aucune équipe ne dépasse le plafond.</p>
              )}
            </div>
          )}

          <p className="mt-3 text-xs text-gray-500">
            Colonnes détectées : nom «&nbsp;{report.layout.nameHeader}&nbsp;»
            {report.layout.nameColumns === 'split' && ' + colonne suivante (nom de famille)'}
            , équipe «&nbsp;{report.layout.teamHeader}&nbsp;», salaire «&nbsp;{report.layout.capHeader}&nbsp;»
            {report.layout.positionHeader && `, position « ${report.layout.positionHeader} »`}
            {report.layout.projHeader && `, projection « ${report.layout.projHeader} »`}.
            <br />
            {report.layout.capUnitReason}
          </p>

          {report.missingColumns.length > 0 && (
            <p className="mt-3 font-medium text-red-700">
              Colonne(s) introuvable(s) : {report.missingColumns.join(', ')}. Sans la colonne
              d’équipe, les joueurs partageant un nom de famille ne peuvent pas être départagés.
            </p>
          )}

          {report.sample.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 font-medium text-gray-700">Vérifie ces montants :</p>
              <ul className="space-y-0.5 text-gray-600">
                {report.sample.map((s, i) => (
                  <li key={`${s.name}-${i}`}>
                    {s.name} <span className="text-gray-400">({s.position})</span> —{' '}
                    <strong>{fmtMoney(s.priceCents)}</strong>
                    {s.projPoints !== null && <span className="text-gray-400"> · {s.projPoints} pts projetés</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.unknownTeams.length > 0 && (
            <p className="mt-3 text-orange-700">Équipes non reconnues : {report.unknownTeams.join(', ')}</p>
          )}

          {report.unmatched.length > 0 && (
            <div className="mt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-orange-700">
                  {report.unmatched.length} joueur(s) introuvable(s) — ils ne seront pas prix&eacute;s :
                </p>
                <button
                  type="button"
                  onClick={() => void resolveMissing()}
                  disabled={busy}
                  className="shrink-0 rounded-md border border-orange-300 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-50"
                >
                  Chercher ces joueurs dans la LNH
                </button>
              </div>
              <ul className="mt-1 max-h-40 overflow-y-auto text-gray-600">
                {report.unmatched.map((r, i) => (
                  <li key={`${r.name}-${i}`}>
                    ligne {r.line ?? '?'} · {r.name || '(sans nom)'} {r.team && `(${r.team})`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* After a search, the ones it could not place — with the reason,
              because a misspelling and a genuine homonym need opposite fixes. */}
          {unresolved.length > 0 && (
            <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
              <p className="font-medium text-gray-700">
                {unresolved.length} nom(s) que la recherche LNH n’a pas pu placer :
              </p>
              <ul className="mt-1 max-h-40 overflow-y-auto text-gray-600">
                {unresolved.map((u, i) => (
                  <li key={`${u.name}-${i}`}>
                    {u.name} — <span className="text-gray-500">{u.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.ambiguous.length > 0 && (
            <div className="mt-3">
              <p className="font-medium text-orange-700">{report.ambiguous.length} homonyme(s) non tranché(s) :</p>
              <ul className="mt-1 text-gray-600">
                {report.ambiguous.map((a, i) => (
                  <li key={`${a.row.name}-${i}`}>
                    ligne {a.row.line ?? '?'} · {a.row.name} — {a.candidates} joueurs possibles
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* "Keep the last known salary" is the rule. It is only safe if the
              operator can see WHICH price is kept and whether it was ever a
              real cap hit — an unstamped price is seedPoolSeason's invention,
              and it would sit in the pool looking exactly like the rest. */}
          {report.keptPrices.length > 0 && (
            <div className="mt-3">
              <p className="font-medium text-orange-700">
                {report.keptPrices.length} joueur(s) sans salaire dans le fichier — ils gardent
                leur prix actuel :
              </p>
              {unverified.length > 0 && (
                <p className="mt-1 text-red-700">
                  <strong>
                    {unverified.map((k) => k.name).join(', ')}
                  </strong>{' '}
                  {unverified.length === 1 ? 'est repêchable' : 'sont repêchables'} à un prix
                  jamais importé — un chiffre dérivé au démarrage, pas un vrai plafond. Ajoute
                  {unverified.length === 1 ? '-lui' : '-leur'} un salaire dans ton fichier Excel
                  avant l’ouverture du repêchage. Les autres, sans prix du tout, ne sont pas
                  repêchables : rien à faire de ce côté.
                </p>
              )}
              <ul className="mt-1 max-h-40 overflow-y-auto text-gray-600">
                {keptSorted.map((k, i) => (
                  <li key={`${k.name}-${i}`}>
                    ligne {k.line ?? '?'} · {k.name || '(sans nom)'} —{' '}
                    {k.priceCents === null ? (
                      <span className="text-gray-500">aucun prix (non repêchable)</span>
                    ) : (
                      <>
                        <strong>{fmtMoney(k.priceCents)}</strong>{' '}
                        {k.importedAt ? (
                          <span className="text-gray-500">
                            (importé le {new Date(k.importedAt).toLocaleDateString('fr-CA')})
                          </span>
                        ) : (
                          <span className="text-red-700">(prix dérivé, jamais vérifié)</span>
                        )}
                        {!k.draftable && <span className="text-gray-500"> · non repêchable</span>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.skippedLines.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              {report.skippedLines.length} ligne(s) vide(s) ignorée(s).
            </p>
          )}
        </div>
      )}
    </section>
  );
}
