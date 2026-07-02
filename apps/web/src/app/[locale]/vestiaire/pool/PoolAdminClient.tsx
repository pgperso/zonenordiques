'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { SCORING_CATALOG, type PoolSeason, type ScoringRule } from '@/services/poolService';

const M = 100_000_000; // cents per 1 M$

/** ISO → value for <input type="datetime-local"> in the browser's local time. */
function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const localToIso = (v: string): string | null => (v ? new Date(v).toISOString() : null);

export function PoolAdminClient({ season, rules }: { season: PoolSeason | null; rules: ScoringRule[] }) {
  // Barème state: stat_key → coefficient (as string for free typing).
  const initialCoeffs: Record<string, string> = {};
  for (const c of SCORING_CATALOG) {
    const found = rules.find((r) => r.statKey === c.key);
    initialCoeffs[c.key] = found ? String(found.coefficient) : '';
  }
  const [coeffs, setCoeffs] = useState(initialCoeffs);

  const [form, setForm] = useState(() => ({
    name: season?.name ?? '',
    budgetM: season ? season.budgetCents / M : 100,
    rosterF: season?.rosterF ?? 12,
    rosterD: season?.rosterD ?? 6,
    rosterG: season?.rosterG ?? 2,
    status: season?.status ?? 'draft',
    lockAt: isoToLocal(season?.lockAt ?? null),
    transactionsEnabled: season?.transactionsEnabled ?? false,
    maxTransactions: season?.maxTransactions ?? 0,
    transactionDeadline: isoToLocal(season?.transactionDeadline ?? null),
    tiebreaker: season?.tiebreaker ?? 'fewest_games',
    isPublic: season?.isPublic ?? true,
    rosterTeams: season?.rosterTeams ?? 0,
    teamBasePoints: season?.teamBasePoints ?? 5,
    teamGfCoef: season?.teamGfCoef ?? 0,
    teamGaCoef: season?.teamGaCoef ?? -1,
    starsEnabled: season?.starsEnabled ?? false,
  }));
  const [saving, setSaving] = useState(false);

  const upd = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (!season) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h1 className="text-xl font-bold text-gray-900">Admin du pool</h1>
        <p className="mt-2 text-sm text-gray-600">
          Aucune saison de pool n&apos;existe encore. Crée-la d&apos;abord (amorçage des prix), puis reviens
          ici pour configurer le barème et les règles.
        </p>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    try {
      const body = {
        seasonId: season!.id,
        season: {
          name: form.name,
          budgetCents: Math.round(form.budgetM * M),
          rosterF: Number(form.rosterF),
          rosterD: Number(form.rosterD),
          rosterG: Number(form.rosterG),
          status: form.status,
          lockAt: localToIso(form.lockAt),
          transactionsEnabled: form.transactionsEnabled,
          maxTransactions: Number(form.maxTransactions),
          transactionDeadline: localToIso(form.transactionDeadline),
          tiebreaker: form.tiebreaker,
          isPublic: form.isPublic,
          rosterTeams: Number(form.rosterTeams),
          teamBasePoints: Number(form.teamBasePoints),
          teamGfCoef: Number(form.teamGfCoef),
          teamGaCoef: Number(form.teamGaCoef),
          starsEnabled: form.starsEnabled,
        },
        rules: SCORING_CATALOG.map((c) => ({
          statKey: c.key,
          appliesTo: c.appliesTo,
          coefficient: coeffs[c.key] === '' ? 0 : Number(coeffs[c.key]),
        })),
      };
      const res = await fetch('/api/pool/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur inconnue');
      toast.success('Règles du pool enregistrées');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  const skaters = SCORING_CATALOG.filter((c) => c.appliesTo === 'skater');
  const goalies = SCORING_CATALOG.filter((c) => c.appliesTo === 'goalie');

  const labelCls = 'block text-sm font-medium text-gray-700';
  const inputCls =
    'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none';
  const cardCls = 'rounded-lg border border-gray-200 bg-white p-6';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Admin du pool LNH</h1>
          <p className="text-sm text-gray-500">
            Saison {season.nhlSeason} · <Link href="/vestiaire" className="underline">retour au vestiaire</Link>
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {/* Season config */}
      <section className={cardCls}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Saison &amp; alignement</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Nom du pool</label>
            <input className={inputCls} value={form.name} onChange={(e) => upd('name', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Budget (M$)</label>
            <input type="number" step="0.1" className={inputCls} value={form.budgetM}
              onChange={(e) => upd('budgetM', Number(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>Statut</label>
            <select className={inputCls} value={form.status} onChange={(e) => upd('status', e.target.value as PoolSeason['status'])}>
              <option value="draft">Brouillon (caché)</option>
              <option value="open">Ouvert (inscriptions)</option>
              <option value="locked">Verrouillé (saison en cours)</option>
              <option value="final">Terminé</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Attaquants</label>
            <input type="number" className={inputCls} value={form.rosterF} onChange={(e) => upd('rosterF', Number(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>Défenseurs</label>
            <input type="number" className={inputCls} value={form.rosterD} onChange={(e) => upd('rosterD', Number(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>Gardiens</label>
            <input type="number" className={inputCls} value={form.rosterG} onChange={(e) => upd('rosterG', Number(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>Date limite du repêchage (fige les alignements)</label>
            <input type="datetime-local" className={inputCls} value={form.lockAt} onChange={(e) => upd('lockAt', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Départage des égalités</label>
            <select className={inputCls} value={form.tiebreaker} onChange={(e) => upd('tiebreaker', e.target.value as PoolSeason['tiebreaker'])}>
              <option value="fewest_games">Moins de matchs joués</option>
              <option value="none">Aucun (rangs partagés)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isPublic} onChange={(e) => upd('isPublic', e.target.checked)} />
            Pool public (classement visible sans compte)
          </label>
        </div>
      </section>

      {/* Transactions */}
      <section className={cardCls}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Échanges</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
            <input type="checkbox" checked={form.transactionsEnabled} onChange={(e) => upd('transactionsEnabled', e.target.checked)} />
            Autoriser les échanges en cours de saison
          </label>
          <div>
            <label className={labelCls}>Nombre maximal d&apos;échanges</label>
            <input type="number" className={inputCls} value={form.maxTransactions}
              onChange={(e) => upd('maxTransactions', Number(e.target.value))} />
            <p className="mt-1 text-xs text-gray-400">0 = aucun · une valeur élevée (ex. 255) = illimité</p>
          </div>
          <div>
            <label className={labelCls}>Date limite des échanges</label>
            <input type="datetime-local" className={inputCls} value={form.transactionDeadline}
              onChange={(e) => upd('transactionDeadline', e.target.value)} />
          </div>
        </div>
      </section>

      {/* Pointage d'équipe (LNH) */}
      <section className={cardCls}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">Section équipe LNH</h2>
        <p className="mb-4 text-xs text-gray-400">Chaque soir, l&apos;équipe choisie part des points de base, ajustés selon les buts du match.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Nombre d&apos;équipes à choisir</label>
            <input type="number" className={inputCls} value={form.rosterTeams} onChange={(e) => upd('rosterTeams', Number(e.target.value))} />
            <p className="mt-1 text-xs text-gray-400">0 = section désactivée · 1 = le membre choisit 1 équipe (remplace les gardiens)</p>
          </div>
          <div>
            <label className={labelCls}>Points de base par soir</label>
            <input type="number" step="0.5" className={inputCls} value={form.teamBasePoints} onChange={(e) => upd('teamBasePoints', Number(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>Points par but marqué</label>
            <input type="number" step="0.5" className={inputCls} value={form.teamGfCoef} onChange={(e) => upd('teamGfCoef', Number(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>Points par but accordé</label>
            <input type="number" step="0.5" className={inputCls} value={form.teamGaCoef} onChange={(e) => upd('teamGaCoef', Number(e.target.value))} />
            <p className="mt-1 text-xs text-gray-400">Ex. −1 : une équipe qui accorde 3 buts perd 3 pts ce soir-là.</p>
          </div>
        </div>
      </section>

      {/* Joueurs vedettes */}
      <section className={cardCls}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">Joueurs vedettes</h2>
        <p className="mb-4 text-xs text-gray-400">Si activé, chaque membre désigne 1 attaquant vedette et 1 défenseur vedette : leurs points comptent en double.</p>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.starsEnabled} onChange={(e) => upd('starsEnabled', e.target.checked)} />
          Activer les joueurs vedettes (points ×2)
        </label>
      </section>

      {/* Barème */}
      <section className={cardCls}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">Barème de pointage</h2>
        <p className="mb-4 text-xs text-gray-400">Points attribués par statistique. Laisse vide (ou 0) pour ne pas compter une stat.</p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Patineurs</h3>
            <div className="flex flex-col gap-2">
              {skaters.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3">
                  <label className="text-sm text-gray-700">{c.label}</label>
                  <input type="number" step="0.1" className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                    value={coeffs[c.key]} onChange={(e) => setCoeffs((p) => ({ ...p, [c.key]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>
          {form.rosterG > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Gardiens</h3>
              <div className="flex flex-col gap-2">
                {goalies.map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-3">
                    <label className="text-sm text-gray-700">{c.label}</label>
                    <input type="number" step="0.1" className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                      value={coeffs[c.key]} onChange={(e) => setCoeffs((p) => ({ ...p, [c.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {form.rosterG === 0 && (
          <p className="mt-2 text-xs text-gray-400">Aucun gardien dans cette saison — le barème des gardiens est masqué. Le pointage d&apos;équipe se règle dans la section « Section équipe LNH » ci-dessus.</p>
        )}
      </section>
    </div>
  );
}
