'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { toast } from 'sonner';
import { BRAND } from '@/lib/brand';
import { ShareButton } from '@/components/ui/ShareButton';

const CONFIG = {
  pivotX: 40,
  pivotY: 48.5,
  needleLength: 25,
  angleMin: 10,
  angleMax: 360,
};

const HORIZONS = [
  { key: '0-3', label: '0-3 ans' },
  { key: '3-5', label: '3-5 ans' },
  { key: '5-10', label: '5-10 ans' },
] as const;

type HorizonKey = typeof HORIZONS[number]['key'];

function getVerdict(pct: number): { text: string; emoji: string } {
  if (pct <= 5) return { text: "C'est mort. Oubliez ça.", emoji: '💀' };
  if (pct <= 15) return { text: 'Aucun signe de vie. Zéro espoir.', emoji: '🪦' };
  if (pct <= 25) return { text: "Faudrait un miracle. Pis les miracles, c'est rare.", emoji: '😔' };
  if (pct <= 35) return { text: "Y'a un pouls, mais c'est faible en maudit.", emoji: '💔' };
  if (pct <= 45) return { text: "On commence à jaser, mais c'est encore loin.", emoji: '🤔' };
  if (pct <= 55) return { text: 'Fifty-fifty. Ça pourrait aller des deux bords.', emoji: '⚖️' };
  if (pct <= 65) return { text: "Ça bouge. Y'a de l'espoir dans l'air.", emoji: '👀' };
  if (pct <= 75) return { text: "Les rumeurs sont fortes. Ça s'enligne bien.", emoji: '🔥' };
  if (pct <= 85) return { text: 'Presque confirmé. On retient notre souffle.', emoji: '😤' };
  if (pct <= 95) return { text: "C'est quasiment fait. Manque juste l'annonce.", emoji: '🚨' };
  return { text: 'LES NORDIQUES SONT DE RETOUR !', emoji: '🏒' };
}

function horizonLabel(key: string) {
  return HORIZONS.find((h) => h.key === key)?.label ?? key;
}

const SHARE_URL = `${BRAND.url}/fr/nordiquometre`;

interface HorizonData {
  average: number;
  totalVotes: number;
  myVote: number | null;
  lastVoteDate: string | null;
}

const EMPTY_DATA: HorizonData = { average: 0, totalVotes: 0, myVote: null, lastVoteDate: null };

interface NordiquometreProps {
  canModerate: boolean;
}

export function Nordiquometre({ canModerate }: NordiquometreProps) {
  const supabase = useSupabase();
  const { user, username } = useAuth();
  const locale = useLocale();

  const [activeHorizon, setActiveHorizon] = useState<HorizonKey>('0-3');
  const [data, setData] = useState<Record<HorizonKey, HorizonData>>({
    '0-3': { ...EMPTY_DATA },
    '3-5': { ...EMPTY_DATA },
    '5-10': { ...EMPTY_DATA },
  });
  const [sliderValue, setSliderValue] = useState(50);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [resetStep, setResetStep] = useState(0); // 0=hidden, 1=confirm, 2=type RESET
  const [resetInput, setResetInput] = useState('');
  const [resetting, setResetting] = useState(false);

  const loadData = useCallback(async () => {
    // Charger TOUS les votes (toutes périodes)
    const { data: allVotes } = await supabase
      .from('nordiquometre_votes')
      .select('vote, horizon, member_id, updated_at');

    const newData: Record<string, HorizonData> = {
      '0-3': { ...EMPTY_DATA },
      '3-5': { ...EMPTY_DATA },
      '5-10': { ...EMPTY_DATA },
    };

    if (allVotes) {
      const votes = allVotes as { vote: number; horizon: string; member_id: string; updated_at: string }[];

      // Calculer moyenne par horizon
      for (const h of HORIZONS) {
        const hVotes = votes.filter((v) => v.horizon === h.key);
        if (hVotes.length > 0) {
          const sum = hVotes.reduce((acc, v) => acc + v.vote, 0);
          newData[h.key].average = Math.round(sum / hVotes.length);
          newData[h.key].totalVotes = hVotes.length;
        }

        // Vote de l'utilisateur courant pour cet horizon
        if (user) {
          const myV = hVotes.find((v) => v.member_id === user.id);
          if (myV) {
            newData[h.key].myVote = myV.vote;
            newData[h.key].lastVoteDate = myV.updated_at;
          }
        }
      }
    }

    setData(newData as Record<HorizonKey, HorizonData>);
    setLoaded(true);
  }, [supabase, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Quand on change d'horizon, mettre le slider sur le vote existant ou 50
  useEffect(() => {
    const d = data[activeHorizon];
    setSliderValue(d.myVote ?? 50);
  }, [activeHorizon, data]);

  const current = data[activeHorizon];
  const votedToday = !!current.lastVoteDate && new Date(current.lastVoteDate).toDateString() === new Date().toDateString();
  const canVote = canModerate || !votedToday;

  async function handleVote() {
    if (!user || !canVote) return;
    setSaving(true);

    if (current.myVote !== null) {
      await supabase
        .from('nordiquometre_votes')
        .update({ vote: sliderValue, updated_at: new Date().toISOString() } as never)
        .eq('member_id', user.id)
        .eq('horizon' as never, activeHorizon as never);
    } else {
      await supabase
        .from('nordiquometre_votes')
        .insert({ member_id: user.id, vote: sliderValue, horizon: activeHorizon } as never);
    }

    // Recharger les moyennes fraîches
    const { data: freshVotes } = await supabase
      .from('nordiquometre_votes')
      .select('vote, horizon');

    const avgs: Record<string, { avg: number; count: number }> = {};
    if (freshVotes) {
      for (const h of HORIZONS) {
        const hv = (freshVotes as { vote: number; horizon: string }[]).filter((v) => v.horizon === h.key);
        if (hv.length > 0) {
          avgs[h.key] = { avg: Math.round(hv.reduce((a, v) => a + v.vote, 0) / hv.length), count: hv.length };
        }
      }
    }

    // Bot message avec les 3 indices
    const voteName = username || 'Un fan';
    const horizonAvg = avgs[activeHorizon]?.avg ?? sliderValue;
    const verdict = getVerdict(horizonAvg);
    const totalAllVotes = Object.values(avgs).reduce((a, v) => a + v.count, 0);

    const indicesLine = HORIZONS
      .map((h) => `${h.label}: ${avgs[h.key]?.avg ?? 0}%`)
      .join(' · ');

    const botMsg = `${verdict.emoji} ${voteName} a voté au Nordiquomètre (${horizonLabel(activeHorizon)}) : ${sliderValue}% !\nIndices de confiance : ${indicesLine} (${totalAllVotes} votes)\n${verdict.text}`;

    const { data: comms } = await supabase
      .from('communities')
      .select('id, slug')
      .in('slug', ['nordiques-de-quebec', 'nordiques-quebec', 'la-taverne']);

    if (comms) {
      for (const c of comms as { id: number }[]) {
        await supabase.rpc('send_bot_message' as never, {
          p_community_id: c.id,
          p_content: botMsg,
        } as never);
      }
    }

    toast.success(locale === 'fr' ? 'Vote enregistré !' : 'Vote saved!');
    setSaving(false);
    loadData();
  }

  const needleAngle = CONFIG.angleMin + (current.average / 100) * (CONFIG.angleMax - CONFIG.angleMin);
  const verdict = getVerdict(current.average);

  const shareText = locale === 'fr'
    ? `Le Nordiquomètre est à ${current.average}% (${horizonLabel(activeHorizon)}) selon ${current.totalVotes} fans. Et toi, tu y crois ? Vote sur ${BRAND.domain}`
    : `The Nordiquomètre is at ${current.average}% (${horizonLabel(activeHorizon)}) according to ${current.totalVotes} fans. Do you believe? Vote at ${BRAND.domain}`;


  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">

      {/* BLOC 1 : Cadran + badge — centré verticalement */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2">
        <div className="relative w-full max-w-[600px]">
          <img src="/images/nordiquometre.png" alt="Nordiquomètre" className="w-full" draggable={false} />

          <svg
            className="pointer-events-none absolute"
            viewBox="0 0 100 24"
            style={{
              left: `${CONFIG.pivotX}%`, top: `${CONFIG.pivotY}%`,
              width: `${CONFIG.needleLength}%`, height: 'auto',
              transformOrigin: '0% 50%',
              transform: `translateY(-50%) rotate(${needleAngle}deg)`,
              transition: 'transform 1s ease-out',
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))',
              overflow: 'visible',
            }}
          >
            <polygon points="0,4 0,20 100,12" fill={`color-mix(in srgb, #000000 ${100 - current.average}%, #0B4870 ${current.average}%)`} />
          </svg>

          <div
            className="pointer-events-none absolute"
            style={{
              left: `${CONFIG.pivotX}%`, top: `${CONFIG.pivotY}%`,
              width: '3%', height: '3%',
              transform: 'translate(-50%, -50%)', borderRadius: '50%',
              background: `color-mix(in srgb, #000000 ${100 - current.average}%, #0B4870 ${current.average}%)`,
              border: '2px solid rgba(255,255,255,0.8)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            }}
          />
        </div>

        {/* Badge — même largeur que le cadran */}
        <div className="w-full max-w-[600px] rounded-xl bg-black/75 px-4 py-2 text-center backdrop-blur-sm">
          <div className="text-lg font-bold text-white sm:text-xl">
            {current.average}% <span className="text-xs text-gray-300 sm:text-sm">({current.totalVotes} vote{current.totalVotes !== 1 ? 's' : ''} · {horizonLabel(activeHorizon)})</span>
          </div>
          <div className="text-xs text-gray-200 sm:text-sm">{verdict.emoji} {verdict.text}</div>
        </div>
      </div>

      {/* BLOC 2 : Actions — centré verticalement, compact */}
      <div className="shrink-0 flex flex-col items-center justify-center gap-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] px-4 py-4">
        {user ? (
          <button
            onClick={() => setShowVoteModal(true)}
            className="rounded-lg bg-brand-blue px-8 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue-dark"
          >
            Voter
          </button>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Link
              href="/register"
              className="rounded-lg bg-brand-blue px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue-dark"
            >
              {locale === 'fr' ? 'Inscris-toi pour voter' : 'Sign up to vote'}
            </Link>
            <Link href="/login" className="text-xs text-gray-400 hover:text-brand-blue">
              {locale === 'fr' ? 'Déjà membre ? Connecte-toi' : 'Already a member? Log in'}
            </Link>
          </div>
        )}
        <div className="flex items-center gap-1">
          <ShareButton url={SHARE_URL} title={shareText} />
          {canModerate && (
            <button onClick={() => setResetStep(1)} className="rounded-lg p-1.5 text-gray-400 transition hover:text-red-500" title="Remettre à zéro">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Modal de vote */}
      {showVoteModal && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white dark:bg-[#1e1e1e] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{locale === 'fr' ? 'Voter au Nordiquomètre' : 'Vote on the Nordiquometer'}</h3>
              <button onClick={() => setShowVoteModal(false)} className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Onglets horizons */}
            <div className="mb-4 flex gap-2">
              {HORIZONS.map((h) => (
                <button
                  key={h.key}
                  onClick={() => setActiveHorizon(h.key)}
                  className={`flex flex-1 items-center justify-center rounded-lg py-2 text-sm font-semibold transition ${
                    activeHorizon === h.key
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-[#272525] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {h.label}
                  {data[h.key].totalVotes > 0 && (
                    <span className="ml-1.5 text-[10px] opacity-60">({data[h.key].totalVotes})</span>
                  )}
                </button>
              ))}
            </div>

            {!canVote ? (
              <div className="text-center">
                <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">Tu as déjà voté pour {horizonLabel(activeHorizon)} aujourd&apos;hui !</p>
                <p className="text-[10px] text-gray-400">Ton vote : {current.myVote}% — Reviens demain ou sélectionne un autre horizon.</p>
              </div>
            ) : (
              <>
                {canModerate && votedToday && (
                  <p className="mb-2 text-center text-[10px] text-orange-500">Mode admin — vote illimité</p>
                )}
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs text-gray-400">0%</span>
                  <input
                    type="range" min={0} max={100} value={sliderValue}
                    onChange={(e) => setSliderValue(Number(e.target.value))}
                    className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 dark:bg-gray-700 accent-brand-blue"
                  />
                  <span className="text-xs text-gray-400">100%</span>
                  <input
                    type="number" min={0} max={100} value={sliderValue}
                    onChange={(e) => setSliderValue(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    className="w-16 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#272525] px-2 py-1.5 text-center text-sm font-bold text-brand-blue focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
                  />
                </div>
                <button
                  onClick={async () => { await handleVote(); setShowVoteModal(false); }}
                  disabled={saving}
                  className="w-full rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
                >
                  {saving ? 'Envoi...' : current.myVote !== null ? `Mettre à jour (${horizonLabel(activeHorizon)})` : `Voter (${horizonLabel(activeHorizon)})`}
                </button>
                {current.myVote !== null && (
                  <p className="mt-2 text-center text-[10px] text-gray-400">Ton vote ({horizonLabel(activeHorizon)}) : {current.myVote}%</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Reset modal */}
      {resetStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white dark:bg-[#1e1e1e] p-6 shadow-xl">
            {resetStep === 1 ? (
              <>
                <h3 className="mb-2 text-base font-bold text-red-600">Supprimer tous les votes ?</h3>
                <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">Cette action est irréversible. Tous les votes de toutes les périodes seront supprimés.</p>
                <div className="flex gap-3">
                  <button onClick={() => setResetStep(0)} className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-700">Annuler</button>
                  <button onClick={() => { setResetStep(2); setResetInput(''); }} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700">Continuer</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="mb-2 text-base font-bold text-red-600">Confirmation finale</h3>
                <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Tapez <strong>RESET</strong> pour confirmer.</p>
                <input type="text" value={resetInput} onChange={(e) => setResetInput(e.target.value)} placeholder="RESET" className="mb-4 w-full rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-[#272525] px-3 py-2 text-center text-sm font-bold text-red-600 placeholder-red-300 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" autoFocus />
                <div className="flex gap-3">
                  <button onClick={() => { setResetStep(0); setResetInput(''); }} className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-700">Annuler</button>
                  <button onClick={async () => { if (resetInput !== 'RESET') return; setResetting(true); await supabase.from('nordiquometre_votes').delete().neq('id', 0); await supabase.from('chat_messages').delete().eq('member_id', '00000000-0000-0000-0000-000000000001').like('content', '%Nordiquomètre%'); setResetStep(0); setResetInput(''); setResetting(false); loadData(); }} disabled={resetInput !== 'RESET' || resetting} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50">{resetting ? 'Suppression...' : 'Supprimer'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
