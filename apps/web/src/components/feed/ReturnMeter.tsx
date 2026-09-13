'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from 'next-intl';
import { toast } from 'sonner';
import { BRAND } from '@/lib/brand';
import { ShareButton } from '@/components/ui/ShareButton';

// One shared implementation for both "return confidence" meters (Nordiquomètre
// for hockey, Exposmètre for baseball). A single GENERAL vote — append-only,
// one vote per identity per day, averaged over every vote ever cast. Voting is
// open to EVERYONE: logged-in members are keyed by their member id, anonymous
// visitors by a browser key (localStorage). All writes go through the
// cast_meter_vote RPC, which enforces the daily gate server-side.

export type MeterKey = 'nordiquometre' | 'exposmetre';

interface MeterConfig {
  name: string;        // FR display name — also used in the bot message + reset
  nameEn: string;
  prep: string;        // grammatical preposition for "a voté <prep> <name>"
  image: string;
  needleColor: string;
  geometry: { pivotX: number; pivotY: number; needleLength: number; angleMin: number; angleMax: number };
  verdict: (pct: number) => { text: string; emoji: string };
  announceSlugs: string[];
}

const CONFIGS: Record<MeterKey, MeterConfig> = {
  nordiquometre: {
    name: 'Nordiquomètre',
    nameEn: 'Nordiquometer',
    prep: 'au',
    image: '/images/nordiquometre.png',
    needleColor: '#003E7E',
    geometry: { pivotX: 40, pivotY: 48.5, needleLength: 25, angleMin: 10, angleMax: 360 },
    announceSlugs: ['nordiques-de-quebec', 'nordiques-quebec', 'la-taverne'],
    verdict: (pct) => {
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
    },
  },
  exposmetre: {
    name: 'Exposmètre',
    nameEn: 'Exposmeter',
    prep: "à l'",
    image: '/images/exposmetre.png',
    needleColor: '#0B4870',
    geometry: { pivotX: 50, pivotY: 50, needleLength: 30, angleMin: 20, angleMax: 340 },
    announceSlugs: ['expos-de-montreal', 'expos-montreal', 'la-taverne'],
    verdict: (pct) => {
      if (pct <= 5) return { text: "Le baseball à Montréal, c'est fini. Oubliez ça.", emoji: '💀' };
      if (pct <= 15) return { text: 'Aucun signe de vie. La MLB regarde ailleurs.', emoji: '🪦' };
      if (pct <= 25) return { text: 'Faudrait un miracle. Pis un stade.', emoji: '😔' };
      if (pct <= 35) return { text: "Y'a un pouls. Des investisseurs jasent.", emoji: '💔' };
      if (pct <= 45) return { text: 'On commence à y croire, mais la route est longue.', emoji: '🤔' };
      if (pct <= 55) return { text: 'Fifty-fifty. Manfred écoute, mais rien de concret.', emoji: '⚖️' };
      if (pct <= 65) return { text: 'Ça bouge sérieusement. Le dossier avance.', emoji: '👀' };
      if (pct <= 75) return { text: 'Les investisseurs sont là. Le stade se dessine.', emoji: '🔥' };
      if (pct <= 85) return { text: 'Presque confirmé. Montréal est dans la course.', emoji: '😤' };
      if (pct <= 95) return { text: "C'est quasiment fait. L'expansion arrive.", emoji: '🚨' };
      return { text: 'NOS AMOURS SONT DE RETOUR !', emoji: '⚾' };
    },
  },
};

const VOTER_KEY_STORAGE = 'zn_meter_voter_key';

function getVoterKey(): string {
  try {
    let key = localStorage.getItem(VOTER_KEY_STORAGE);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(VOTER_KEY_STORAGE, key);
    }
    return key;
  } catch {
    // Private mode / storage blocked: a throwaway key still lets this session
    // vote (dedup just won't persist across reloads for that visitor).
    return crypto.randomUUID();
  }
}

interface MeterData {
  average: number;
  totalVotes: number;
  myVote: number | null;
  lastVoteDate: string | null;
}

const EMPTY_DATA: MeterData = { average: 0, totalVotes: 0, myVote: null, lastVoteDate: null };

interface ReturnMeterProps {
  meter: MeterKey;
  canModerate: boolean;
}

export function ReturnMeter({ meter, canModerate }: ReturnMeterProps) {
  const cfg = CONFIGS[meter];
  const supabase = useSupabase();
  const { user, username } = useAuth();
  const locale = useLocale();
  const isFr = locale === 'fr';

  const [voterKey, setVoterKey] = useState<string | null>(null);
  const [data, setData] = useState<MeterData>({ ...EMPTY_DATA });
  const [sliderValue, setSliderValue] = useState(50);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [resetStep, setResetStep] = useState(0);
  const [resetInput, setResetInput] = useState('');
  const [resetting, setResetting] = useState(false);

  // One anonymous browser key, resolved on mount (client only).
  useEffect(() => {
    setVoterKey(getVoterKey());
  }, []);

  const loadData = useCallback(async () => {
    const { data: allVotes } = await supabase
      .from(`${meter}_votes` as 'nordiquometre_votes')
      .select('vote, member_id, voter_key, created_at');

    const next: MeterData = { ...EMPTY_DATA };
    if (allVotes) {
      const votes = allVotes as unknown as { vote: number; member_id: string | null; voter_key: string | null; created_at: string }[];
      if (votes.length > 0) {
        const sum = votes.reduce((acc, v) => acc + v.vote, 0);
        next.average = Math.round(sum / votes.length);
        next.totalVotes = votes.length;
      }
      // My latest vote: matched by member id (logged in) or browser key.
      const mine = votes.filter(
        (v) => (user && v.member_id === user.id) || (voterKey && v.voter_key === voterKey),
      );
      if (mine.length > 0) {
        const latest = mine.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b));
        next.myVote = latest.vote;
        next.lastVoteDate = latest.created_at;
      }
    }
    setData(next);
    setLoaded(true);
  }, [supabase, meter, user, voterKey]);

  useEffect(() => {
    if (voterKey !== null) loadData();
  }, [loadData, voterKey]);

  useEffect(() => {
    setSliderValue(data.myVote ?? 50);
  }, [data.myVote]);

  const votedToday = !!data.lastVoteDate && new Date(data.lastVoteDate).toDateString() === new Date().toDateString();
  const canVote = canModerate || !votedToday;

  async function handleVote() {
    if (!canVote || voterKey === null) return;
    setSaving(true);

    const { data: result } = await supabase.rpc('cast_meter_vote' as never, {
      p_meter: meter,
      p_vote: sliderValue,
      p_voter_key: voterKey,
    } as never);

    if (result === 'already_voted') {
      toast.info(isFr ? 'Tu as déjà voté aujourd’hui !' : 'You already voted today!');
      setSaving(false);
      loadData();
      return;
    }
    if (result !== 'ok') {
      toast.error(isFr ? 'Vote impossible pour le moment.' : 'Could not record your vote.');
      setSaving(false);
      return;
    }

    // Fresh global average for the announcement.
    const { data: freshVotes } = await supabase
      .from(`${meter}_votes` as 'nordiquometre_votes')
      .select('vote');
    const list = (freshVotes as { vote: number }[] | null) ?? [];
    const avg = list.length > 0 ? Math.round(list.reduce((a, v) => a + v.vote, 0) / list.length) : sliderValue;
    const totalVotes = list.length;
    const verdict = cfg.verdict(avg);

    // Only logged-in members trigger the chat announcement (the bot RPC ignores
    // anonymous callers anyway).
    if (user) {
      const voteName = username || 'Un fan';
      const botMsg = `${verdict.emoji} ${voteName} a voté ${cfg.prep} ${cfg.name} : ${sliderValue}% !\nIndice de confiance : ${avg}% (${totalVotes} vote${totalVotes !== 1 ? 's' : ''})\n${verdict.text}`;
      const { data: comms } = await supabase
        .from('communities')
        .select('id, slug')
        .in('slug', cfg.announceSlugs);
      if (comms) {
        for (const c of comms as { id: number }[]) {
          await supabase.rpc('send_bot_message' as never, { p_community_id: c.id, p_content: botMsg } as never);
        }
      }
    }

    toast.success(isFr ? 'Vote enregistré !' : 'Vote saved!');
    setSaving(false);
    loadData();
  }

  async function handleReset() {
    if (resetInput !== 'RESET') return;
    setResetting(true);
    await supabase.from(`${meter}_votes` as 'nordiquometre_votes').delete().neq('id', 0);
    await supabase
      .from('chat_messages')
      .delete()
      .eq('member_id', '00000000-0000-0000-0000-000000000001')
      .like('content', `%${cfg.name}%`);
    setResetStep(0);
    setResetInput('');
    setResetting(false);
    loadData();
  }

  const needleAngle = cfg.geometry.angleMin + (data.average / 100) * (cfg.geometry.angleMax - cfg.geometry.angleMin);
  const verdict = cfg.verdict(data.average);
  const SHARE_URL = `${BRAND.url}/fr/${meter}`;
  const shareText = isFr
    ? `Le ${cfg.name} est à ${data.average}% selon ${data.totalVotes} votes. Et toi, tu y crois ? Vote sur ${BRAND.domain}`
    : `The ${cfg.name} is at ${data.average}% according to ${data.totalVotes} votes. Do you believe? Vote at ${BRAND.domain}`;

  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Dial + badge */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2">
        <div className="relative w-full max-w-[600px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cfg.image} alt={cfg.name} width={1024} height={1024} className="w-full" draggable={false} />
          <svg
            className="pointer-events-none absolute"
            viewBox="0 0 100 24"
            style={{
              left: `${cfg.geometry.pivotX}%`, top: `${cfg.geometry.pivotY}%`,
              width: `${cfg.geometry.needleLength}%`, height: 'auto',
              transformOrigin: '0% 50%',
              transform: `translateY(-50%) rotate(${needleAngle}deg)`,
              transition: 'transform 1s ease-out',
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))',
              overflow: 'visible',
            }}
          >
            <polygon points="0,4 0,20 100,12" fill={`color-mix(in srgb, #000000 ${100 - data.average}%, ${cfg.needleColor} ${data.average}%)`} />
          </svg>
          <div
            className="pointer-events-none absolute"
            style={{
              left: `${cfg.geometry.pivotX}%`, top: `${cfg.geometry.pivotY}%`,
              width: '3%', height: '3%',
              transform: 'translate(-50%, -50%)', borderRadius: '50%',
              background: `color-mix(in srgb, #000000 ${100 - data.average}%, ${cfg.needleColor} ${data.average}%)`,
              border: '2px solid rgba(255,255,255,0.8)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            }}
          />
        </div>

        <div className="w-full max-w-[600px] rounded-xl bg-black/75 px-4 py-2 text-center backdrop-blur-sm">
          <div className="text-lg font-bold text-white sm:text-xl">
            {data.average}% <span className="text-xs text-gray-300 sm:text-sm">({data.totalVotes} vote{data.totalVotes !== 1 ? 's' : ''})</span>
          </div>
          <div className="text-xs text-gray-200 sm:text-sm">{verdict.emoji} {verdict.text}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex flex-col items-center justify-center gap-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] px-4 py-4">
        <button
          onClick={() => setShowVoteModal(true)}
          className="rounded-lg bg-brand-blue px-8 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue-dark"
        >
          {isFr ? 'Voter' : 'Vote'}
        </button>
        <div className="flex items-center gap-1">
          <ShareButton url={SHARE_URL} title={shareText} />
          {canModerate && (
            <button onClick={() => setResetStep(1)} className="rounded-lg p-1.5 text-gray-400 transition hover:text-red-500" title="Remettre à zéro">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Vote modal */}
      {showVoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white dark:bg-[#1e1e1e] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{isFr ? `Voter ${cfg.prep} ${cfg.name}` : `Vote on the ${cfg.nameEn}`}</h3>
              <button onClick={() => setShowVoteModal(false)} className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {!canVote ? (
              <div className="text-center">
                <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">{isFr ? 'Tu as déjà voté aujourd’hui !' : 'You already voted today!'}</p>
                <p className="text-[10px] text-gray-400">{isFr ? `Ton vote : ${data.myVote}% — Reviens demain.` : `Your vote: ${data.myVote}% — Come back tomorrow.`}</p>
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
                  {saving ? (isFr ? 'Envoi...' : 'Saving...') : (isFr ? 'Voter' : 'Vote')}
                </button>
                {data.myVote !== null && (
                  <p className="mt-2 text-center text-[10px] text-gray-400">{isFr ? `Ton dernier vote : ${data.myVote}%` : `Your last vote: ${data.myVote}%`}</p>
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
                  <button onClick={handleReset} disabled={resetInput !== 'RESET' || resetting} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50">{resetting ? 'Suppression...' : 'Supprimer'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
