import { setRequestLocale } from 'next-intl/server';
import { BRAND } from '@/lib/brand';
import type { Metadata } from 'next';

export const revalidate = 86400;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const isFr = locale === 'fr';
  const title = isFr
    ? `Normes éditoriales | ${BRAND.name}`
    : `Editorial Standards | ${BRAND.nameEn}`;
  const description = isFr
    ? `Notre politique éditoriale, nos standards de qualité et le processus de correction sur ${BRAND.name}.`
    : `Our editorial policy, quality standards and corrections process at ${BRAND.nameEn}.`;
  const url = `${BRAND.url}/${locale}/normes-editoriales`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: BRAND.name,
      type: 'website',
      locale: isFr ? 'fr_CA' : 'en_CA',
      images: [{ url: BRAND.logoUrl, alt: BRAND.name, width: BRAND.logoWidth, height: BRAND.logoHeight }],
    },
    alternates: {
      canonical: url,
      languages: {
        'fr-CA': `${BRAND.url}/fr/normes-editoriales`,
        'en-CA': `${BRAND.url}/en/normes-editoriales`,
        'x-default': `${BRAND.url}/fr/normes-editoriales`,
      },
    },
    robots: {
      index: true,
      follow: true,
      'max-snippet': -1,
    },
  };
}

export default async function EditorialStandardsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFr = locale === 'fr';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: isFr ? 'Normes éditoriales' : 'Editorial Standards',
    url: `${BRAND.url}/${locale}/normes-editoriales`,
    inLanguage: isFr ? 'fr-CA' : 'en-CA',
    publisher: {
      '@type': 'NewsMediaOrganization',
      name: BRAND.name,
      url: BRAND.url,
      logo: {
        '@type': 'ImageObject',
        url: BRAND.logoUrl,
        width: BRAND.logoWidth,
        height: BRAND.logoHeight,
      },
      ethicsPolicy: `${BRAND.url}/${locale}/normes-editoriales`,
      diversityPolicy: `${BRAND.url}/${locale}/normes-editoriales`,
      correctionsPolicy: `${BRAND.url}/${locale}/normes-editoriales`,
    },
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-4 py-8 md:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 md:text-4xl">
          {isFr ? 'Normes éditoriales' : 'Editorial Standards'}
        </h1>
        <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">
          {isFr ? 'Dernière mise à jour : 14 mai 2026' : 'Last updated: May 14, 2026'}
        </p>

        {isFr ? <FrenchContent /> : <EnglishContent />}
      </div>
    </div>
  );
}

function FrenchContent() {
  return (
    <article className="prose max-w-none prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-a:text-brand-blue">
      <h2>Notre mission</h2>
      <p>
        La tribune des fans publie des analyses, opinions et chroniques sportives écrites par des
        passionnés du Québec et du Canada. Nous croyons que les meilleurs commentaires sur le sport
        viennent souvent de fans engagés et informés, complémentaires aux médias traditionnels.
      </p>

      <h2>Qui écrit ici</h2>
      <p>
        Nos contributeurs sont des fans, des chroniqueurs indépendants et des collaborateurs invités.
        Chaque article est signé par un auteur identifiable, avec sa biographie et son historique de
        publications accessibles publiquement. La tribune des fans n&apos;est pas une plateforme
        anonyme : nos auteurs assument leurs opinions sous leur identité ou un alias éditorial
        permanent et vérifié.
      </p>

      <h2>Standards de qualité</h2>
      <ul>
        <li>
          <strong>Longueur et profondeur :</strong> nous priorisons les articles de 500 mots et
          plus, qui apportent une analyse étoffée plutôt qu&apos;une réaction superficielle.
        </li>
        <li>
          <strong>Sources :</strong> les faits cités proviennent de sources vérifiables — médias
          établis, statistiques officielles, déclarations publiques. Nous évitons les rumeurs
          non sourcées et les ouï-dire.
        </li>
        <li>
          <strong>Opinion vs. fait :</strong> nos chroniques expriment des opinions clairement
          identifiées comme telles. La frontière entre information et commentaire est explicite.
        </li>
        <li>
          <strong>Originalité :</strong> chaque article est un travail original. Les citations
          d&apos;autres médias sont attribuées avec lien vers la source.
        </li>
      </ul>

      <h2>Processus de correction</h2>
      <p>
        Si une erreur factuelle est identifiée dans un de nos articles, nous corrigeons le texte
        et ajoutons une note de correction datée en pied d&apos;article. Les corrections
        importantes (chiffres, identités, citations) sont signalées explicitement.
      </p>
      <p>
        Pour signaler une erreur, contactez-nous à{' '}
        <a href="mailto:info@fanstribune.com">info@fanstribune.com</a> avec le lien de l&apos;article
        concerné et la nature de l&apos;erreur. Nous répondons généralement dans les 48 heures.
      </p>

      <h2>Indépendance éditoriale</h2>
      <p>
        La tribune des fans est indépendante. Aucune équipe sportive, ligue, commanditaire ou
        annonceur n&apos;influence le contenu éditorial. Les revenus publicitaires (notamment
        Google AdSense) sont gérés séparément de la rédaction : les annonceurs n&apos;ont aucun
        droit de regard sur les articles publiés ou leur classement.
      </p>
      <p>
        Lorsqu&apos;un article porte sur un partenaire commercial éventuel, cette relation est
        divulguée en début d&apos;article.
      </p>

      <h2>Modération des commentaires</h2>
      <p>
        Les commentaires et discussions dans les tribunes sont modérés par notre équipe et par
        les arbitres communautaires. Les contenus haineux, diffamatoires, ou hors-sujet sont
        retirés. Nos règles complètes sont disponibles dans nos{' '}
        <a href="/fr/conditions-utilisation">conditions d&apos;utilisation</a>.
      </p>

      <h2>Vie privée et données</h2>
      <p>
        Notre politique de confidentialité détaillée se trouve sur la page{' '}
        <a href="/fr/politique-confidentialite">politique de confidentialité</a>. Nous ne vendons
        jamais les données personnelles de nos lecteurs et nous appliquons le consentement
        européen (RGPD) et québécois (Loi 25) pour les cookies publicitaires.
      </p>

      <h2>Nous joindre</h2>
      <p>
        <strong>Éditeur :</strong> Pascal Grenon (QcFan)<br />
        <strong>Courriel :</strong>{' '}
        <a href="mailto:info@fanstribune.com">info@fanstribune.com</a>
        <br />
        <strong>Adresse :</strong> Québec, Canada
      </p>
    </article>
  );
}

function EnglishContent() {
  return (
    <article className="prose max-w-none prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-a:text-brand-blue">
      <h2>Our mission</h2>
      <p>
        Fans Tribune publishes sports analysis, opinion and column writing from passionate
        contributors across Quebec and Canada. We believe the best commentary often comes from
        engaged, informed fans — a complement to traditional sports media.
      </p>

      <h2>Who writes here</h2>
      <p>
        Our contributors are fans, independent columnists and invited collaborators. Every
        article is signed by an identifiable author, with a public bio and publication history.
        Fans Tribune is not an anonymous platform: our authors stand behind their opinions under
        their real identity or a permanent, verified editorial pen name.
      </p>

      <h2>Quality standards</h2>
      <ul>
        <li>
          <strong>Depth and length:</strong> we prioritize articles of 500 words or more that
          offer substantive analysis rather than surface-level reactions.
        </li>
        <li>
          <strong>Sources:</strong> facts cited in our articles come from verifiable sources —
          established media, official statistics, public statements. We avoid unsourced rumours
          and hearsay.
        </li>
        <li>
          <strong>Opinion vs. fact:</strong> our columns express opinions clearly identified as
          such. The line between reporting and commentary is explicit.
        </li>
        <li>
          <strong>Originality:</strong> every article is original work. Quotes from other media
          are attributed with a link to the source.
        </li>
      </ul>

      <h2>Corrections process</h2>
      <p>
        If a factual error is identified in one of our articles, we correct the text and add a
        dated correction note at the bottom of the article. Significant corrections (numbers,
        identities, quotes) are explicitly flagged.
      </p>
      <p>
        To report an error, contact us at{' '}
        <a href="mailto:info@fanstribune.com">info@fanstribune.com</a> with the article link and the
        nature of the error. We typically respond within 48 hours.
      </p>

      <h2>Editorial independence</h2>
      <p>
        Fans Tribune is independent. No sports team, league, sponsor or advertiser influences
        editorial content. Advertising revenue (notably Google AdSense) is managed separately
        from the newsroom: advertisers have no say over which articles are published or how they
        are ranked.
      </p>
      <p>
        When an article concerns a potential commercial partner, that relationship is disclosed
        at the top of the article.
      </p>

      <h2>Comment moderation</h2>
      <p>
        Comments and discussions in the tribunes are moderated by our team and community
        moderators. Hateful, defamatory or off-topic content is removed. Our complete rules are
        available in our <a href="/en/conditions-utilisation">terms of use</a>.
      </p>

      <h2>Privacy and data</h2>
      <p>
        Our detailed privacy policy is available on the{' '}
        <a href="/en/politique-confidentialite">privacy policy</a> page. We never sell our
        readers&apos; personal data, and we apply EU (GDPR) and Quebec (Law 25) consent for
        advertising cookies.
      </p>

      <h2>Contact us</h2>
      <p>
        <strong>Publisher:</strong> Pascal Grenon (QcFan)<br />
        <strong>Email:</strong>{' '}
        <a href="mailto:info@fanstribune.com">info@fanstribune.com</a>
        <br />
        <strong>Address:</strong> Quebec, Canada
      </p>
    </article>
  );
}
