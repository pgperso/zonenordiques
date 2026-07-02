'use client';

import { useTranslations } from 'next-intl';

interface FeedLivePlayerProps {
  videoId: string;
  isLive: boolean;
}

export function FeedLivePlayer({ videoId, isLive }: FeedLivePlayerProps) {
  const t = useTranslations('tribune');
  return (
    <div className="relative w-full max-w-[640px] overflow-hidden rounded-xl">
      {/* Badge */}
      <div className="absolute left-3 top-3 z-10">
        {isLive ? (
          <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow-lg">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white dark:bg-[#1e1e1e]" />
            {t('liveNow')}
          </span>
        ) : (
          <span className="rounded-full bg-gray-800/70 px-2.5 py-1 text-xs font-medium text-white">
            {t('replay')}
          </span>
        )}
      </div>

      {/* YouTube iframe — responsive 16:9, max 360px height */}
      <div className="relative w-full max-h-[360px]" style={{ paddingBottom: '56.25%' }}>
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=${isLive ? 1 : 0}&rel=0&modestbranding=1`}
          title="Live"
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
        />
      </div>
    </div>
  );
}
