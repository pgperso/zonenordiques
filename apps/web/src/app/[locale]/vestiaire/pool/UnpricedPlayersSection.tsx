'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { UnpricedPlayer } from '@/services/poolService';

/**
 * Salaries typed in by hand, for the players a spreadsheet cannot price.
 *
 * The file marks pending free agents with a "°" and leaves their cap hit
 * blank, and seedPoolSeason invented a figure for anyone it had never seen.
 * Neither is draftable any more (00117), so this list is what stands between
 * the pool and an open draft: empty it, or those players stay out.
 *
 * Entries are kept as the text the operator typed, not as parsed numbers. A
 * half-typed "1." must survive a re-render, and an unparseable cell has to be
 * reportable as what was written rather than silently becoming 0.
 */
const M_CENTS = 100_000_000; // cents in one million dollars

function parseMillions(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * M_CENTS);
}

export function UnpricedPlayersSection({ seasonId, cardCls }: { seasonId: number; cardCls: string }) {
  const [players, setPlayers] = useState<UnpricedPlayer[] | null>(null);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pool/prices?seasonId=${seasonId}`);
      const text = await res.text();
      const json = JSON.parse(text) as { players?: UnpricedPlayer[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      setPlayers(json.players ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chargement impossible');
      setPlayers([]);
    }
  }, [seasonId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    // Report what could not be read instead of dropping it: a typo that
    // silently does nothing is how a player ends up missing from the draft.
    const bad: string[] = [];
    const prices: Array<{ playerId: number; priceCents: number }> = [];
    for (const [id, text] of Object.entries(draft)) {
      if (!text.trim()) continue;
      const cents = parseMillions(text);
      if (cents === null) {
        bad.push(players?.find((p) => p.playerId === Number(id))?.fullName ?? `#${id}`);
        continue;
      }
      prices.push({ playerId: Number(id), priceCents: cents });
    }
    if (bad.length > 0) {
      toast.error(`Montant illisible pour ${bad.join(', ')} — écris le salaire en millions, p. ex. 8.6`);
      return;
    }
    if (prices.length === 0) {
      toast.error('Aucun salaire saisi.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/pool/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId, prices }),
      });
      const text = await res.text();
      const json = JSON.parse(text) as { saved?: number; players?: UnpricedPlayer[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      setPlayers(json.players ?? []);
      setDraft({});
      toast.success(`${json.saved ?? prices.length} salaire(s) enregistré(s) — ces joueurs sont maintenant repêchables`);
    } catch (e) {
      // The write may have landed partially; reload rather than leave a list
      // on screen that no longer describes the database.
      toast.error(e instanceof Error ? e.message : 'Échec de l’enregistrement');
      void load();
    } finally {
      setBusy(false);
    }
  }

  const pending = Object.values(draft).filter((v) => v.trim()).length;

  return (
    <section className={cardCls}>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Joueurs sans salaire
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        Ces joueurs <strong>ne sont pas repêchables</strong> tant qu’ils n’ont pas de salaire :
        soit ton fichier les nomme sans montant (joueurs sans contrat), soit ils traînent encore
        un prix inventé au démarrage. Écris le salaire <strong>en millions</strong> — p. ex.
        <span className="font-mono"> 8.6</span> pour 8,6 M$ — puis enregistre.
        <br />
        Seules les positions que ta saison repêche apparaissent ici : si l’alignement ne
        prévoit aucun gardien, les gardiens sans salaire sont ignorés.
      </p>

      {players === null && <p className="text-sm text-gray-500">Chargement…</p>}

      {players !== null && players.length === 0 && (
        <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Aucun joueur en attente. Tous les joueurs prixés ont un vrai salaire.
        </p>
      )}

      {players !== null && players.length > 0 && (
        <>
          <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
            {players.map((p) => (
              <li key={p.playerId} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {p.fullName}{' '}
                  <span className="text-gray-400">
                    ({p.position}{p.teamAbbrev ? ` · ${p.teamAbbrev}` : ''})
                  </span>
                  {p.reason === 'derived' && (
                    <span className="ml-2 text-xs text-red-700">
                      prix inventé : {(p.priceCents / M_CENTS).toFixed(2)} M$
                    </span>
                  )}
                </span>
                <label className="sr-only" htmlFor={`price-${p.playerId}`}>
                  Salaire de {p.fullName} en millions
                </label>
                <input
                  id={`price-${p.playerId}`}
                  type="text"
                  inputMode="decimal"
                  placeholder="M$"
                  value={draft[p.playerId] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [p.playerId]: e.target.value }))}
                  disabled={busy}
                  className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right font-mono text-sm disabled:opacity-50"
                />
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || pending === 0}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              Enregistrer les salaires
            </button>
            <span role="status" aria-live="polite" className="text-sm text-gray-500">
              {busy
                ? 'Enregistrement…'
                : pending > 0
                  ? `${pending} salaire(s) prêt(s) · ${players.length} joueur(s) en attente`
                  : `${players.length} joueur(s) en attente`}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
