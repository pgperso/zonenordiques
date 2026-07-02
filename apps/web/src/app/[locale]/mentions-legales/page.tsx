import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { AdSlot } from '@/components/ads/AdSlot';
import { BRAND } from '@/lib/brand';

export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isFr = locale === 'fr';
  const title = isFr
    ? `Mentions légales | ${BRAND.name}`
    : `Legal Notice | ${BRAND.nameEn}`;
  const description = isFr
    ? `Mentions légales de ${BRAND.name} : éditeur, responsable de publication, hébergeur, propriété intellectuelle et coordonnées.`
    : `Legal notice for ${BRAND.nameEn}: publisher, publication manager, hosting provider, intellectual property and contact information.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BRAND.url}/${locale}/mentions-legales`,
      siteName: BRAND.name,
      locale: isFr ? 'fr_CA' : 'en_CA',
      images: [
        { url: BRAND.logoUrl, alt: BRAND.name, width: BRAND.logoWidth, height: BRAND.logoHeight },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [BRAND.logoUrl],
    },
    alternates: {
      canonical: `${BRAND.url}/${locale}/mentions-legales`,
      languages: {
        'fr-CA': `${BRAND.url}/fr/mentions-legales`,
        'en-CA': `${BRAND.url}/en/mentions-legales`,
        'x-default': `${BRAND.url}/fr/mentions-legales`,
      },
    },
    robots: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  };
}

export default async function MentionsLegalesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFr = locale === 'fr';
  const lastUpdated = isFr ? 'Dernière mise à jour : 17 avril 2026' : 'Last updated: April 17, 2026';

  return (
    <div className="flex flex-1 min-h-0 flex-col px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 md:text-4xl">
          {isFr ? 'Mentions légales' : 'Legal Notice'}
        </h1>
        <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">{lastUpdated}</p>

        <div className="space-y-8 text-gray-700 dark:text-gray-300 leading-relaxed">
          {/* 1. Editor */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '1. Éditeur du site' : '1. Site Publisher'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  Le site <strong>fanstribune.com</strong> (également désigné sous la marque
                  « La tribune des fans » et « Fans Tribune ») est édité par&nbsp;:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    <strong>Nom de l&apos;éditeur&nbsp;:</strong> Pascal Grenon (entreprise individuelle)
                  </li>
                  <li>
                    <strong>Statut&nbsp;:</strong> Exploitant individuel enregistré au Québec, Canada
                  </li>
                  <li>
                    <strong>Adresse professionnelle&nbsp;:</strong> disponible sur demande à l&apos;adresse
                    courriel ci-dessous (conformément aux règles applicables aux exploitants individuels)
                  </li>
                  <li>
                    <strong>Courriel de contact&nbsp;:</strong>{' '}
                    <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                      info@fanstribune.com
                    </a>
                  </li>
                </ul>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  The website <strong>fanstribune.com</strong> (also operating under the brands
                  &quot;La tribune des fans&quot; and &quot;Fans Tribune&quot;) is published by:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    <strong>Publisher name:</strong> Pascal Grenon (sole proprietor)
                  </li>
                  <li>
                    <strong>Status:</strong> Individual operator registered in Quebec, Canada
                  </li>
                  <li>
                    <strong>Business address:</strong> available upon request at the email below
                    (in accordance with applicable rules for sole proprietors)
                  </li>
                  <li>
                    <strong>Contact email:</strong>{' '}
                    <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                      info@fanstribune.com
                    </a>
                  </li>
                </ul>
              </div>
            )}
          </section>

          {/* 2. Publication manager */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '2. Directeur de la publication' : '2. Publication Manager'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  Le directeur de la publication, au sens des lois canadiennes et québécoises applicables
                  aux éditeurs en ligne, est&nbsp;:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    <strong>Nom&nbsp;:</strong> Pascal Grenon
                  </li>
                  <li>
                    <strong>Pseudonyme public&nbsp;:</strong> QcFan
                  </li>
                  <li>
                    <strong>Fonction&nbsp;:</strong> Fondateur et responsable éditorial
                  </li>
                </ul>
                <p>
                  Le directeur de la publication est responsable du contenu éditorial publié directement
                  par l&apos;éditeur (pages institutionnelles, communications officielles). Les contenus
                  générés par les utilisateurs (messages de chat, articles, podcasts contributifs,
                  commentaires) relèvent de la responsabilité de leurs auteurs respectifs, conformément
                  aux Conditions d&apos;utilisation.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  The publication manager, within the meaning of applicable Canadian and Quebec laws
                  governing online publishers, is:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    <strong>Name:</strong> Pascal Grenon
                  </li>
                  <li>
                    <strong>Public alias:</strong> QcFan
                  </li>
                  <li>
                    <strong>Role:</strong> Founder and editorial manager
                  </li>
                </ul>
                <p>
                  The publication manager is responsible for editorial content published directly by
                  the publisher (institutional pages, official communications). User-generated content
                  (chat messages, articles, contributed podcasts, comments) remains the responsibility
                  of its respective authors, as set out in the Terms of Use.
                </p>
              </div>
            )}
          </section>

          {/* 3. Hosting */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '3. Hébergement' : '3. Hosting'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>Le site fanstribune.com est hébergé par&nbsp;:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Hébergement web et CDN&nbsp;:</strong> Vercel Inc., 440 N Barranca Avenue #4133,
                    Covina, CA 91723, États-Unis —{' '}
                    <a
                      href="https://vercel.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      vercel.com
                    </a>
                  </li>
                  <li>
                    <strong>Base de données et authentification&nbsp;:</strong> Supabase Inc., 970 Toa Payoh
                    North #07-04, Singapore 318992 —{' '}
                    <a
                      href="https://supabase.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      supabase.com
                    </a>
                  </li>
                  <li>
                    <strong>Nom de domaine&nbsp;:</strong> enregistré auprès d&apos;un bureau d&apos;enregistrement
                    accrédité ICANN.
                  </li>
                </ul>
                <p>
                  Les données personnelles des utilisateurs peuvent être stockées hors du Québec et du
                  Canada (principalement aux États-Unis et à Singapour) chez nos sous-traitants techniques.
                  Voir notre{' '}
                  <a
                    href={`/${locale}/politique-confidentialite`}
                    className="text-red-600 hover:underline font-medium"
                  >
                    politique de confidentialité
                  </a>{' '}
                  pour les détails sur les transferts hors Québec (Loi 25) et les garanties appliquées.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>The fanstribune.com website is hosted by:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Web hosting and CDN:</strong> Vercel Inc., 440 N Barranca Avenue #4133,
                    Covina, CA 91723, United States —{' '}
                    <a
                      href="https://vercel.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      vercel.com
                    </a>
                  </li>
                  <li>
                    <strong>Database and authentication:</strong> Supabase Inc., 970 Toa Payoh North
                    #07-04, Singapore 318992 —{' '}
                    <a
                      href="https://supabase.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      supabase.com
                    </a>
                  </li>
                  <li>
                    <strong>Domain name:</strong> registered with an ICANN-accredited registrar.
                  </li>
                </ul>
                <p>
                  User personal data may be stored outside Quebec and Canada (mainly in the United
                  States and Singapore) by our technical service providers. See our{' '}
                  <a
                    href={`/${locale}/politique-confidentialite`}
                    className="text-red-600 hover:underline font-medium"
                  >
                    privacy policy
                  </a>{' '}
                  for details on transfers outside Quebec (Law 25) and safeguards applied.
                </p>
              </div>
            )}
          </section>

          {/* 4. Intellectual property */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '4. Propriété intellectuelle' : '4. Intellectual Property'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  L&apos;ensemble du site fanstribune.com — y compris sa structure, son design, son code
                  source, ses logos, son identité visuelle, ses textes originaux et ses illustrations —
                  est protégé par les lois canadiennes et internationales sur le droit d&apos;auteur et la
                  propriété intellectuelle.
                </p>
                <p>
                  Les marques <strong>« La tribune des fans »</strong>, <strong>« Fans Tribune »</strong>,{' '}
                  <strong>« Nordiquomètre »</strong>, <strong>« Exposmètre »</strong> et <strong>« La Taverne »</strong>{' '}
                  sont la propriété de l&apos;éditeur du site. Toute reproduction, représentation,
                  modification, publication, adaptation de tout ou partie des éléments du site, quel que
                  soit le moyen ou le procédé utilisé, est interdite, sauf autorisation écrite préalable.
                </p>
                <p>
                  Les contenus publiés par les utilisateurs (articles, podcasts, messages) restent la
                  propriété de leurs auteurs. En les publiant sur la plateforme, les utilisateurs
                  accordent à La tribune des fans une licence non exclusive, mondiale et libre de
                  redevances pour les afficher, reproduire et distribuer dans le cadre du fonctionnement
                  de la plateforme, comme détaillé dans les Conditions d&apos;utilisation.
                </p>
                <p>
                  Les logos d&apos;équipes sportives, noms de franchises et marques tierces mentionnés sur
                  le site restent la propriété de leurs ayants droit respectifs. Leur utilisation ici
                  relève de l&apos;usage nominatif et éditorial légitime et ne constitue en aucun cas une
                  affiliation officielle, un partenariat ou un endossement par ces organisations.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  The entirety of the fanstribune.com website — including its structure, design, source
                  code, logos, visual identity, original texts, and illustrations — is protected by
                  Canadian and international copyright and intellectual property laws.
                </p>
                <p>
                  The trademarks <strong>&quot;La tribune des fans&quot;</strong>, <strong>&quot;Fans Tribune&quot;</strong>,{' '}
                  <strong>&quot;Nordiquomètre&quot;</strong>, <strong>&quot;Exposmètre&quot;</strong>, and{' '}
                  <strong>&quot;La Taverne&quot;</strong> are the property of the site publisher. Any
                  reproduction, representation, modification, publication, or adaptation of all or part
                  of the site&apos;s elements, by any means or process, is prohibited without prior
                  written authorization.
                </p>
                <p>
                  Content published by users (articles, podcasts, messages) remains the property of
                  their authors. By publishing on the platform, users grant Fans Tribune a
                  non-exclusive, worldwide, royalty-free license to display, reproduce, and distribute
                  it in connection with the platform&apos;s operation, as detailed in the Terms of Use.
                </p>
                <p>
                  Sports team logos, franchise names, and third-party trademarks mentioned on the site
                  remain the property of their respective owners. Their use here constitutes legitimate
                  nominative and editorial use and does not imply any official affiliation, partnership,
                  or endorsement by those organizations.
                </p>
              </div>
            )}
          </section>

          {/* 5. User content and moderation */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '5. Contenu utilisateur et modération' : '5. User Content and Moderation'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  La tribune des fans héberge du contenu généré par les utilisateurs (UGC)&nbsp;: messages
                  de chat, articles contributifs, podcasts, commentaires. L&apos;éditeur n&apos;exerce pas
                  de contrôle éditorial systématique <em>a priori</em> sur ces contenus, conformément
                  au régime de responsabilité applicable aux hébergeurs de contenus tiers.
                </p>
                <p>
                  L&apos;éditeur agit promptement pour retirer tout contenu manifestement illicite qui
                  lui serait signalé. Pour signaler un contenu abusif, diffamatoire, harcelant, portant
                  atteinte aux droits d&apos;auteur ou autrement illégal, écrivez à{' '}
                  <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                    info@fanstribune.com
                  </a>{' '}
                  en précisant&nbsp;:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>L&apos;URL précise du contenu concerné</li>
                  <li>La nature du problème (diffamation, atteinte au droit d&apos;auteur, etc.)</li>
                  <li>Vos coordonnées et, si pertinent, la justification de vos droits</li>
                </ul>
                <p>
                  Les règles complètes de modération et de comportement figurent dans nos{' '}
                  <a
                    href={`/${locale}/conditions-utilisation`}
                    className="text-red-600 hover:underline font-medium"
                  >
                    conditions d&apos;utilisation
                  </a>
                  .
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  Fans Tribune hosts user-generated content (UGC): chat messages, contributed articles,
                  podcasts, comments. The publisher does not exercise systematic <em>a priori</em>{' '}
                  editorial control over such content, in accordance with the liability regime
                  applicable to hosts of third-party content.
                </p>
                <p>
                  The publisher acts promptly to remove any manifestly illegal content reported to it.
                  To report abusive, defamatory, harassing, copyright-infringing, or otherwise illegal
                  content, email{' '}
                  <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                    info@fanstribune.com
                  </a>{' '}
                  specifying:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>The precise URL of the affected content</li>
                  <li>The nature of the problem (defamation, copyright infringement, etc.)</li>
                  <li>Your contact details and, if relevant, proof of your rights</li>
                </ul>
                <p>
                  The full moderation and behavior rules are in our{' '}
                  <a
                    href={`/${locale}/conditions-utilisation`}
                    className="text-red-600 hover:underline font-medium"
                  >
                    terms of use
                  </a>
                  .
                </p>
              </div>
            )}
          </section>

          {/* 6. Advertising */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '6. Publicité' : '6. Advertising'}
            </h2>
            {isFr ? (
              <p>
                Le site diffuse des annonces publicitaires via <strong>Google AdSense</strong>{' '}
                (Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043, États-Unis). Ces
                annonces sont identifiées comme telles sur la plateforme (mention « Publicité ») et
                sont fournies par des tiers qui peuvent utiliser des cookies et technologies similaires.
                Les modalités complètes sont détaillées dans notre politique de confidentialité.
              </p>
            ) : (
              <p>
                The site displays advertising through <strong>Google AdSense</strong> (Google LLC, 1600
                Amphitheatre Parkway, Mountain View, CA 94043, USA). These ads are identified as such
                on the platform (labeled &quot;Publicité&quot; / &quot;Advertisement&quot;) and are delivered by third
                parties that may use cookies and similar technologies. Full terms are detailed in our
                privacy policy.
              </p>
            )}
          </section>

          {/* 7. Applicable law */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '7. Droit applicable et juridiction' : '7. Applicable Law and Jurisdiction'}
            </h2>
            {isFr ? (
              <p>
                Les présentes mentions légales, ainsi que l&apos;utilisation du site fanstribune.com,
                sont régies par le droit applicable dans la province de Québec (Canada). Tout litige
                relatif à l&apos;interprétation ou l&apos;exécution des présentes relève de la compétence
                exclusive des tribunaux du district judiciaire du domicile de l&apos;éditeur, sauf
                dispositions légales impératives contraires.
              </p>
            ) : (
              <p>
                These legal notices, as well as use of the fanstribune.com website, are governed by the
                law applicable in the Province of Quebec (Canada). Any dispute relating to the
                interpretation or performance hereof falls within the exclusive jurisdiction of the
                courts of the judicial district of the publisher&apos;s domicile, subject to overriding
                legal provisions to the contrary.
              </p>
            )}
          </section>

          {/* 8. Contact */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '8. Contact' : '8. Contact'}
            </h2>
            {isFr ? (
              <p>
                Pour toute question relative à ces mentions légales, vous pouvez écrire à{' '}
                <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                  info@fanstribune.com
                </a>
                . Pour les demandes relatives aux données personnelles (Loi 25 Québec / RGPD), consultez
                également notre{' '}
                <a
                  href={`/${locale}/politique-confidentialite`}
                  className="text-red-600 hover:underline font-medium"
                >
                  politique de confidentialité
                </a>
                .
              </p>
            ) : (
              <p>
                For any question about these legal notices, you can write to{' '}
                <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                  info@fanstribune.com
                </a>
                . For personal data requests (Quebec Law 25 / GDPR), also see our{' '}
                <a
                  href={`/${locale}/politique-confidentialite`}
                  className="text-red-600 hover:underline font-medium"
                >
                  privacy policy
                </a>
                .
              </p>
            )}
          </section>
        </div>

        <div className="mt-10 flex justify-center">
          <AdSlot slotId="terms-bottom" format="rectangle" />
        </div>
      </div>
    </div>
  );
}
