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
  const [fullSnapshot, setFullSnapshot] = useState(true);
  const [report, setReport] = useState<SalaryImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    if (/\.xlsx?$/i.test(file.name) && !/\.csv$/i.test(file.name)) {
      toast.error('Excel ne peut pas être lu tel quel. Fichier → Enregistrer sous → CSV UTF-8.');
      return;
    }
    setCsv(await file.text());
    setFileName(file.name);
    setReport(null);
  }

  async function send(dryRun: boolean) {
    setBusy(true);
    try {
      const res = await fetch('/api/pool/salaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId,
          csv,
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
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-gray-500">ou coller le contenu</summary>
        <textarea
          value={csv}
          onChange={(e) => { setCsv(e.target.value); setReport(null); setFileName(null); }}
          rows={6}
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
          disabled={busy || !csv.trim()}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? 'Analyse…' : 'Analyser sans écrire'}
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

          {report.unknownTeams.length > 0 && (
            <p className="mt-3 text-orange-700">
              Équipes non reconnues : {report.unknownTeams.join(', ')}
            </p>
          )}

          {report.unmatched.length > 0 && (
            <div className="mt-3">
              <p className="font-medium text-orange-700">
                {report.unmatched.length} joueur(s) introuvable(s) — ils ne seront pas prix&eacute;s :
              </p>
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
