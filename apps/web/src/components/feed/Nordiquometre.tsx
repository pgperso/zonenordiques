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

const SHARE_URL = `${BRAND.url}/fr/nordiquometre`;

interface MeterData {
  average: number;
  totalVotes: number; // total votes CAST (sum of vote_count), not voter count
  myVote: number | null;
  myVoteCount: number;
  lastVoteDate: string | null;
}

const EMPTY_DATA: MeterData = { average: 0, totalVotes: 0, myVote: null, myVoteCount: 0, lastVoteDate: null };

interface NordiquometreProps {
  canModerate: boolean;
}

export function Nordiquometre({ canModerate }: NordiquometreProps) {
  const supabase = useSupabase();
  const { user, username } = useAuth();
  const locale = useLocale();

  const [data, setData] = useState<MeterData>({ ...EMPTY_DATA });
  const [sliderValue, setSliderValue] = useState(50);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [resetStep, setResetStep] = useState(0); // 0=hidden, 1=confirm, 2=type RESET
  const [resetInput, setResetInput] = useState('');
  const [resetting, setResetting] = useState(false);

  const loadData = useCallback(async () => {
    const { data: allVotes } = await supabase
      .from('nordiquometre_votes')
      .select('vote, member_id, updated_at, vote_count');

    const next: MeterData = { ...EMPTY_DATA };
    if (allVotes) {
      const votes = allVotes as { vote: number; member_id: string; updated_at: string; vote_count: number }[];
      if (votes.length > 0) {
        // Index = average of each voter's current opinion (one row per member).
        const sum = votes.reduce((acc, v) => acc + v.vote, 0);
        next.average = Math.round(sum / votes.length);
        // Displayed count = total votes cast (re-votes included).
        next.totalVotes = votes.reduce((acc, v) => acc + (v.vote_count ?? 1), 0);
      }
      if (user) {
        const mine = votes.find((v) => v.member_id === user.id);
        if (mine) {
          next.myVote = mine.vote;
          next.myVoteCount = mine.vote_count ?? 1;
          next.lastVoteDate = mine.updated_at;
        }
      }
    }
    setData(next);
    setLoaded(true);
  }, [supabase, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Prime the slider with the member's existing vote (or the midpoint).
  useEffect(() => {
    setSliderValue(data.myVote ?? 50);
  }, [data.myVote]);

  const votedToday = !!data.lastVoteDate && new Date(data.lastVoteDate).toDateString() === new Date().toDateString();
  const canVote = canModerate || !votedToday;

  async function handleVote() {
    if (!user || !canVote) return;
    setSaving(true);

    if (data.myVote !== null) {
      await supabase
        .from('nordiquometre_votes')
        .update({ vote: sliderValue, vote_count: data.myVoteCount + 1, updated_at: new Date().toISOString() } as never)
        .eq('member_id', user.id);
    } else {
      // vote_count defaults to 1 for a brand-new voter.
      await supabase
        .from('nordiquometre_votes')
        .insert({ member_id: user.id, vote: sliderValue } as never);
    }

    // Fresh index (average per voter) + total votes cast for the announcement.
    const { data: freshVotes } = await supabase.from('nordiquometre_votes').select('vote, vote_count');
    const list = (freshVotes as { vote: number; vote_count: number }[] | null) ?? [];
    const avg = list.length > 0 ? Math.round(list.reduce((a, v) => a + v.vote, 0) / list.length) : sliderValue;
    const totalVotes = list.reduce((a, v) => a + (v.vote_count ?? 1), 0);
    const verdict = getVerdict(avg);
    const voteName = username || 'Un fan';

    const botMsg = `${verdict.emoji} ${voteName} a voté au Nordiquomètre : ${sliderValue}% !\nIndice de confiance : ${avg}% (${totalVotes} vote${totalVotes !== 1 ? 's' : ''})\n${verdict.text}`;

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

  const needleAngle = CONFIG.angleMin + (data.average / 100) * (CONFIG.angleMax - CONFIG.angleMin);
  const verdict = getVerdict(data.average);

  const shareText = locale === 'fr'
    ? `Le Nordiquomètre est à ${data.average}% selon ${data.totalVotes} votes. Et toi, tu y crois ? Vote sur ${BRAND.domain}`
    : `The Nordiquomètre is at ${data.average}% according to ${data.totalVotes} votes. Do you believe? Vote at ${BRAND.domain}`;

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
          <img src="/images/nordiquometre.png" alt="Nordiquomètre" width={1024} height={1024} className="w-full" draggable={false} />

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
            <polygon points="0,4 0,20 100,12" fill={`color-mix(in srgb, #000000 ${100 - data.average}%, #003E7E ${data.average}%)`} />
          </svg>

          <div
            className="pointer-events-none absolute"
            style={{
              left: `${CONFIG.pivotX}%`, top: `${CONFIG.pivotY}%`,
              width: '3%', height: '3%',
              transform: 'translate(-50%, -50%)', borderRadius: '50%',
              background: `color-mix(in srgb, #000000 ${100 - data.average}%, #003E7E ${data.average}%)`,
              border: '2px solid rgba(255,255,255,0.8)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            }}
          />
        </div>

        {/* Badge — même largeur que le cadran */}
        <div className="w-full max-w-[600px] rounded-xl bg-black/75 px-4 py-2 text-center backdrop-blur-sm">
          <div className="text-lg font-bold text-white sm:text-xl">
            {data.average}% <span className="text-xs text-gray-300 sm:text-sm">({data.totalVotes} vote{data.totalVotes !== 1 ? 's' : ''})</span>
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

            {!canVote ? (
              <div className="text-center">
                <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">Tu as déjà voté aujourd&apos;hui !</p>
                <p className="text-[10px] text-gray-400">Ton vote : {data.myVote}% — Reviens demain.</p>
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
                  {saving ? 'Envoi...' : data.myVote !== null ? 'Mettre à jour' : 'Voter'}
                </button>
                {data.myVote !== null && (
                  <p className="mt-2 text-center text-[10px] text-gray-400">Ton vote : {data.myVote}%</p>
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
                <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">Cette action est irréversible. Tous les votes seront supprimés.</p>
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
