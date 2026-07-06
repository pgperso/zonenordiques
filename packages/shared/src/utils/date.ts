export function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('fr-CA', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Publication date for articles/podcasts (cards, bylines). Chat messages keep
// formatTime (time-only); dated content uses this so old imports don't show a
// bare "14:32" with no day. Defaults to fr-CA; pass a next-intl locale ('en')
// for English formatting.
export function formatDate(dateString: string, locale?: string): string {
  return new Date(dateString).toLocaleDateString(locale === 'en' ? 'en-CA' : 'fr-CA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
