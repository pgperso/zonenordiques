interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
}

/**
 * Fetch recent news from Google News RSS for a given topic.
 * Returns up to 8 headlines with links (no API key needed).
 * Returns null if the service is unavailable.
 */
export async function fetchRecentNews(topic: string): Promise<NewsItem[] | null> {
  try {
    const encoded = encodeURIComponent(topic);
    const url = `https://news.google.com/rss/search?q=${encoded}&hl=fr-CA&gl=CA&ceid=CA:fr`;

    const res = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const xml = await res.text();

    // Simple XML parsing — extract <item> blocks
    const items: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
      const block = match[1];
      const title = block.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/, '$1') ?? '';
      const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';

      if (title) {
        items.push({ title, link, pubDate });
      }
    }

    return items;
  } catch {
    return null;
  }
}
