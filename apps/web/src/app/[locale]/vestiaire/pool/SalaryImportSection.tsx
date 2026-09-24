'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { SalaryImportReport } from '@/services/poolService';

/**
 * Salary / projection import for the pool.
 *
 * Deliberately two-step. The spreadsheet carries ~900 players matched by name
 * against the NHL roster, and a handful will always fail — a trade, an accent,
 * a junior call-up. Writing first and reporting afterwards would leave the
 * operator repairing prices in a pool people are already drafting from, so
 * nothing is written until the preview has been read.
 */
const M_CENTS = 100_000_000; // cents in one million dollars

function fmtMoney(cents: number): string {
  return `${(cents / M_CENTS).toFixed(2)} M$`;
}

export function SalaryImportSection({ seasonId, cardCls }: { seasonId: number; cardCls: string }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<'utf-8' | 'windows-1252' | null>(null);
  const [fullSnapshot, setFullSnapshot] = useState(true);
  const [report, setReport] = useState<SalaryImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [resolving, setResolving] = useState(false);
  // Rosters only need refreshing once per visit; the sync is idempotent but
  // it is 32 calls against a rate-limited public API.
  const [rostersFresh, setRostersFresh] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    if (/\.xlsx?$/i.test(file.name) && !/\.csv$/i.test(file.name)) {
      toast.error('Excel ne peut pas être lu tel quel. Fichier → Enregistrer sous → CSV UTF-8.');
      return;
    }

    // Excel's plain "CSV" export writes Windows-1252, not UTF-8, and
    // File.text() always decodes as UTF-8 — so "Stützle" arrives as
    // "St�tzle" and, worse, the "Équ." header becomes unrecognisable and
    // the team column silently disappears. Decode both ways and keep the one
    // that produced no replacement characters.
    const buf = await file.arrayBuffer();
    const asUtf8 = new TextDecoder('utf-8').decode(buf);
    let text = asUtf8;
    let enc: 'utf-8' | 'windows-1252' = 'utf-8';
    if (asUtf8.includes('�')) {
      const as1252 = new TextDecoder('windows-1252').decode(buf);
      if (!as1252.includes('�')) {
        text = as1252;
        enc = 'windows-1252';
      }
    }

    setCsv(text);
    setEncoding(enc);
    setFileName(file.name);
    setReport(null);

    // Refresh the roster as soon as a file is chosen. It is the prerequisite
    // for matching and the operator has no reason to know that, so asking
    // them to remember it only produces a bad first report.
    if (!rostersFresh) await syncRosters(true);
    await send(true, text);
  }

  // The importer matches names against nhl_players, which the nightly sync
  // only fills with players seen in a boxscore. A prospect who has not dressed
  // yet is simply absent, and comes back as 'introuvable'. Pulling the 32
  // current rosters first is what makes a full snapshot match.
  async function syncRosters(silent = false): Promise<boolean> {
    setSyncing(true);
    try {
      const res = await fetch('/api/pool/rosters', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur inconnue');
      setRostersFresh(true);
      if (!silent) {
        toast.success(`${json.players} joueurs sur ${json.teams} équipes`);
        if (csv.trim()) await send(true);
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de la synchronisation');
      return false;
    } finally {
      setSyncing(false);
    }
  }

  // A drafted prospect who has not dressed yet is on no NHL roster, so the
  // roster sync never sees them — but the league's search index does, with a
  // real playerId. Without that id the pool cannot reference them at all, so
  // a rookie cap hit in the spreadsheet has nowhere to go.
  async function resolveMissing() {
    if (!report) return;
    setResolving(true);
    try {
      const res = await fetch('/api/pool/resolve-players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          players: report.unmatched.map((r) => ({ name: r.name, team: r.team })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur inconnue');
      const added = json.report.added.length as number;
      const left = json.report.stillMissing.length as number;
      toast.success(
        left > 0
          ? `${added} joueurs ajoutés, ${left} toujours introuvables`
          : `${added} joueurs ajoutés`,
      );
      await send(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de la résolution');
    } finally {
      setResolving(false);
    }
  }

  async function send(dryRun: boolean, csvOverride?: string) {
    const text = csvOverride ?? csv;
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/pool/salaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId,
          csv: text,
          dryRun,
          fullSnapshot,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur inconnue');
      setReport(json.report as SalaryImportReport);
      if (!dryRun) toast.success(`${json.report.matched} joueurs mis à jour`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de l’import');
    } finally {
      setBusy(false);
    }
  }

  const problems = report
    ? report.unmatched.length + report.ambiguous.length + report.invalidPrice.length
    : 0;

  return (
    <section className={cardCls}>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Salaires &amp; projections
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        Fichier CSV exporté d’Excel. Colonnes reconnues : prénom + nom, équipe, position,
        points projetés et masse salariale — en millions ou en dollars, détecté automatiquement.
        Le plafond salarial du pool se règle dans «&nbsp;Saison &amp; alignement&nbsp;» ci-dessous.
      </p>

      <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-lg text-sm text-gray-600">
            {syncing ? (
              <>Mise à jour de la liste des joueurs de la LNH…</>
            ) : rostersFresh ? (
              <><strong className="text-green-700">Alignements à jour.</strong> La liste des
              joueurs de la LNH a été rafraîchie pour cette session.</>
            ) : (
              <>La liste des joueurs se met à jour automatiquement au chargement du fichier.
              La synchro nocturne n’enregistre que les joueurs vus dans un match, donc sans
              ce rafraîchissement les espoirs ressortent «&nbsp;introuvables&nbsp;».</>
            )}
          </p>
          <button
            type="button"
            onClick={() => void syncRosters(false)}
            disabled={syncing}
            className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {syncing ? 'Synchronisation…' : 'Resynchroniser maintenant'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Choisir un fichier CSV
        </button>
        {fileName && <span className="text-sm text-gray-600">{fileName}</span>}
        {encoding === 'windows-1252' && (
          <span className="text-xs text-amber-700">
            Encodage ANSI détecté et converti — les accents sont récupérés.
          </span>
        )}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-gray-500">ou coller le contenu</summary>
        <textarea
          value={csv}
          onChange={(e) => { setCsv(e.target.value); setReport(null); setFileName(null); setEncoding(null); }}
          rows={6}
          onBlur={() => { if (csv.trim() && !report) void send(true); }}
          placeholder="#,Nom,,Âge,Équ.,Pos,PJ,B,P,Pts,PPP,CapH"
          className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
        />
      </details>

      <div className="mt-4">
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={fullSnapshot}
            onChange={(e) => setFullSnapshot(e.target.checked)}
            className="mt-1"
          />
          <span>
            <strong>Instantané complet</strong>
            <span className="block text-xs text-gray-500">
              Les joueurs absents du fichier deviennent non repêchables. À décocher pour une
              simple retouche après un échange.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void send(true)}
          disabled={busy || syncing || !csv.trim()}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? 'Analyse…' : syncing ? 'Alignements en cours…' : 'Réanalyser'}
        </button>
        <button
          type="button"
          onClick={() => void send(false)}
          disabled={busy || !report || report.dryRun === false}
          title={!report ? 'Analyse le fichier d’abord' : undefined}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          Appliquer
        </button>
      </div>

      {report && (
        <div className="mt-5 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
          <p className="font-semibold text-gray-900">
            {report.dryRun ? 'Aperçu — rien n’a été écrit' : 'Import appliqué'}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <div><dt className="text-gray-500">Lignes lues</dt><dd className="font-semibold">{report.total}</dd></div>
            <div><dt className="text-gray-500">Appariées</dt><dd className="font-semibold text-green-700">{report.matched}</dd></div>
            <div><dt className="text-gray-500">Problèmes</dt><dd className={`font-semibold ${problems ? 'text-orange-700' : ''}`}>{problems}</dd></div>
            <div><dt className="text-gray-500">Salaires lus en</dt><dd className="font-semibold">{report.layout.capUnit === 'millions' ? 'millions' : 'dollars'}</dd></div>
          </dl>

          <p className="mt-3 text-xs text-gray-500">
            Colonnes détectées : nom «&nbsp;{report.layout.nameHeader}&nbsp;»
            {report.layout.nameColumns === 'split' && ' + colonne suivante (nom de famille)'}
            , équipe «&nbsp;{report.layout.teamHeader}&nbsp;», salaire «&nbsp;{report.layout.capHeader}&nbsp;»
            {report.layout.projHeader && `, projection « ${report.layout.projHeader} »`}.
            <br />
            {report.layout.capUnitReason}
          </p>

          {report.sample.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 font-medium text-gray-700">Vérifie ces montants :</p>
              <ul className="space-y-0.5 text-gray-600">
                {report.sample.map((s) => (
                  <li key={s.name}>
                    {s.name} <span className="text-gray-400">({s.position})</span> —{' '}
                    <strong>{fmtMoney(s.priceCents)}</strong>
                    {s.projPoints !== null && <span className="text-gray-400"> · {s.projPoints} pts projetés</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.missingColumns.length > 0 && (
            <p className="mt-3 font-medium text-red-700">
              Colonne(s) introuvable(s) : {report.missingColumns.join(', ')}. Sans la colonne
              d’équipe, les joueurs partageant un nom de famille ne peuvent pas être départagés.
            </p>
          )}

          {report.unknownTeams.length > 0 && (
            <p className="mt-3 text-orange-700">
              Équipes non reconnues : {report.unknownTeams.join(', ')}
            </p>
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
                  disabled={resolving}
                  className="shrink-0 rounded-md border border-orange-300 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-50"
                >
                  {resolving ? 'Recherche…' : 'Chercher ces joueurs dans la LNH'}
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

          {report.ambiguous.length > 0 && (
            <div className="mt-3">
              <p className="font-medium text-orange-700">
                {report.ambiguous.length} homonyme(s) non tranché(s) :
              </p>
              <ul className="mt-1 text-gray-600">
                {report.ambiguous.map((a, i) => (
                  <li key={`${a.row.name}-${i}`}>
                    ligne {a.row.line ?? '?'} · {a.row.name} — {a.candidates} joueurs possibles
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.invalidPrice.length > 0 && (
            <p className="mt-3 text-orange-700">
              {report.invalidPrice.length} ligne(s) sans salaire lisible.
            </p>
          )}

          {report.skippedLines.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              Lignes vides ignorées : {report.skippedLines.join(', ')}
            </p>
          )}

          {report.dryRun && (
            <p className="mt-4 text-xs text-gray-500">
              Si les montants ci-dessus sont les bons, clique «&nbsp;Appliquer&nbsp;».
            </p>
          )}
        </div>
      )}
    </section>
  );
}
