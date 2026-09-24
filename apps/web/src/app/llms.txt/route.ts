import { BRAND } from '@/lib/brand';
import { SITE } from '@/lib/siteConfig';

/**
 * Per-brand llms.txt.
 *
 * This file tells AI crawlers — the ones robots.ts explicitly allows — what
 * the site is. It used to be a static public/llms.txt describing Zone
 * Nordiques, served verbatim on all three domains, so zoneexpos.com and
 * cflquebec.com were literally announcing themselves as the hockey site,
 * with hockey vocabulary and zonenordiques.com links, to the crawlers most
 * likely to repeat the claim.
 *
 * Generated like robots.ts and manifest.ts so it can never drift again.
 */
export const revalidate = 86400;

export function GET(): Response {
  const body = `# ${BRAND.name}

> Communauté en ligne bilingue (FR/EN) des amateurs de ${SITE.sport} au Québec. Chat en direct, articles d'opinion et commentaires de la communauté.

${BRAND.name} est une communauté web dédiée aux passionnés de ${SITE.sport}. Les membres échangent en temps réel dans les tribunes, lisent et écrivent des chroniques et commentent l'actualité.

## Pages principales

- [Accueil](${BRAND.url}/fr): Galerie de presse — tous les articles et chroniques
- [À propos](${BRAND.url}/fr/a-propos): Mission et fonctionnalités de la plateforme
- [Contact](${BRAND.url}/fr/contact): Coordonnées et réseaux sociaux
- [Normes éditoriales](${BRAND.url}/fr/normes-editoriales): Politique éditoriale, corrections et déontologie

## Types de contenu

- **Tribune**: Salon de chat en direct de la communauté
- **Articles**: Chroniques, analyses et opinions
- **Commentaires**: Discussions de la communauté sous les articles
- **Balados**: Épisodes audio publiés par la communauté

## Informations techniques

- Site bilingue: français et anglais
- Domaine canonique: ${BRAND.domain}
- Contact: ${BRAND.email}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
