'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import type { LinkPreview } from '@arena/shared';

interface ShareToChatButtonProps {
  /** Canonical URL of the article/podcast being shared. */
  url: string;
  title: string | null;
  description?: string | null;
  image?: string | null;
  /** Slug of the tribune whose chat receives the share. */
  communitySlug: string;
  /** Current user id, or null for anonymous visitors (button hidden). */
  userId: string | null;
  className?: string;
}

type ShareState = 'idle' | 'sharing' | 'done' | 'error';

/**
 * Posts a link-preview card of the current article/podcast into the tribune
 * chat as a normal chat message. Reuses the existing link_previews rendering
 * (FeedLinkPreview) and realtime feed — the card shows up live for everyone,
 * no schema changes needed. The preview is built from the content we already
 * have on the page, so it's always accurate (no OG scraping).
 */
export function ShareToChatButton({
  url,
  title,
  description = null,
  image = null,
  communitySlug,
  userId,
  className = '',
}: ShareToChatButtonProps) {
  const locale = useLocale();
  const fr = locale === 'fr';
  const [state, setState] = useState<ShareState>('idle');

  // Only logged-in members can share into the chat.
  if (!userId) return null;

  async function handleShare() {
    if (state === 'sharing' || state === 'done') return;
    setState('sharing');
    const supabase = createClient();

    // Resolve the tribune's numeric id from its slug (chat_messages keys on it).
    const { data: community } = await supabase
      .from('communities')
      .select('id')
      .eq('slug', communitySlug)
      .single();

    if (!community) {
      setState('error');
      return;
    }

    let domain = 'zonenordiques.com';
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // keep default
    }

    const preview: LinkPreview = {
      url,
      title: title ?? null,
      description: description ?? null,
      image: image ?? null,
      domain,
    };

    const { error } = await supabase.from('chat_messages').insert({
      community_id: (community as { id: number }).id,
      member_id: userId,
      content: title ?? url,
      link_previews: [preview],
    } as never);

    setState(error ? 'error' : 'done');
  }

  const label =
    state === 'done'
      ? fr ? 'Partagé dans La Zone ✓' : 'Shared to La Zone ✓'
      : state === 'sharing'
        ? fr ? 'Partage…' : 'Sharing…'
        : state === 'error'
          ? fr ? 'Réessayer' : 'Retry'
          : fr ? 'Partager dans La Zone' : 'Share to La Zone';

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={state === 'sharing' || state === 'done'}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:cursor-default disabled:opacity-80 ${
        state === 'done'
          ? 'bg-green-600 text-white'
          : 'bg-brand-blue text-white hover:bg-brand-blue-dark'
      } ${className}`}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
        />
      </svg>
      {label}
    </button>
  );
}
