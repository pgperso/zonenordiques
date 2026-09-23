import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

// Generated per brand so the Sitemap line points at THIS site — the static
// public/robots.txt hardcoded zonenordiques.com and was wrong on zoneexpos.com.
//
// Note: /fr/tribunes and /vestiaire use meta robots: noindex on the page itself.
// We rely on that instead of robots.txt path rules, which don't distinguish
// /tribunes (list, auth-only) from /tribunes/[slug] (public hub) cleanly.
export default function robots(): MetadataRoute.Robots {
  const aiRetrieval = [
    'ChatGPT-User',
    'Claude-Web',
    'PerplexityBot',
    'OAI-SearchBot',
    'Claude-SearchBot',
    'Amazonbot',
    'YouBot',
    'Cohere-ai',
  ];
  const aiTraining = [
    'GPTBot',
    'Google-Extended',
    'CCBot',
    'anthropic-ai',
    'Meta-ExternalAgent',
    'Bytespider',
    'Applebot-Extended',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/login', '/register', '/reset-password', '/update-password'],
      },
      // AI retrieval bots — allowed (needed for AI search citations).
      ...aiRetrieval.map((userAgent) => ({ userAgent, allow: '/' })),
      // AI training bots — blocked (protect content from training datasets).
      ...aiTraining.map((userAgent) => ({ userAgent, disallow: '/' })),
    ],
    sitemap: `${BRAND.url}/sitemap.xml`,
  };
}
