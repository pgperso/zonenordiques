import { setRequestLocale } from 'next-intl/server';
import { AdSlot } from '@/components/ads/AdSlot';
import { BRAND } from '@/lib/brand';
import type { Metadata } from 'next';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: `Conditions d'utilisation | ${BRAND.name}`,
  description:
    `Consultez les conditions d'utilisation de ${BRAND.name} (${BRAND.nameEn}). Règles de la communauté, responsabilités des utilisateurs et politique de contenu.`,
  openGraph: {
    title: `Conditions d'utilisation | ${BRAND.name}`,
    description:
      `Conditions d'utilisation de la plateforme communautaire ${BRAND.name}.`,
    url: `${BRAND.url}/fr/conditions-utilisation`,
    siteName: BRAND.name,
    type: 'website',
  },
  alternates: {
    canonical: `${BRAND.url}/fr/conditions-utilisation`,
    languages: {
      fr: `${BRAND.url}/fr/conditions-utilisation`,
      en: `${BRAND.url}/en/conditions-utilisation`,
    },
  },
};

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isFr = locale === 'fr';
  const lastUpdated = isFr ? 'Dernière mise à jour\u00a0: 28 mars 2026' : 'Last updated: March 28, 2026';

  return (
    <div className="flex flex-1 min-h-0 flex-col px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 md:text-4xl">
          {isFr ? 'Conditions d\'utilisation' : 'Terms of Use'}
        </h1>
        <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">{lastUpdated}</p>

        <div className="space-y-8 text-gray-700 dark:text-gray-300 leading-relaxed">
          {/* 1. Acceptance */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '1. Acceptation des conditions' : '1. Acceptance of Terms'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  En accédant au site web <strong>fanstribune.com</strong> (« La tribune des fans » ou « Fans Tribune »),
                  vous acceptez d&apos;être lié par les présentes conditions d&apos;utilisation, toutes les lois et
                  réglementations applicables, et vous acceptez que vous êtes responsable du respect de toutes
                  les lois locales applicables.
                </p>
                <p>
                  Si vous n&apos;acceptez pas l&apos;une de ces conditions, il vous est interdit d&apos;utiliser ou d&apos;accéder
                  à ce site. Les éléments contenus sur ce site sont protégés par les lois applicables sur le
                  droit d&apos;auteur et les marques de commerce.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  By accessing the website <strong>fanstribune.com</strong> (&quot;La tribune des fans&quot; or &quot;Fans Tribune&quot;),
                  you agree to be bound by these terms of use, all applicable laws and regulations, and you
                  agree that you are responsible for compliance with any applicable local laws.
                </p>
                <p>
                  If you do not agree with any of these terms, you are prohibited from using or accessing
                  this site. The materials contained on this site are protected by applicable copyright and
                  trademark law.
                </p>
              </div>
            )}
          </section>

          {/* 2. User accounts */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '2. Comptes utilisateurs et responsabilités' : '2. User Accounts & Responsibilities'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  Pour accéder à certaines fonctionnalités de La tribune des fans, vous devez créer un compte
                  utilisateur. Vous êtes responsable de maintenir la confidentialité de votre compte et de
                  votre mot de passe, et vous acceptez la responsabilité de toutes les activités effectuées
                  sous votre compte.
                </p>
                <p>
                  Vous vous engagez à fournir des informations exactes, actuelles et complètes lors de
                  l&apos;inscription et à mettre à jour ces informations pour qu&apos;elles restent exactes. Vous devez
                  avoir au moins 13 ans pour créer un compte sur notre plateforme.
                </p>
                <p>
                  Vous êtes seul responsable du contenu que vous publiez sur la plateforme, y compris les
                  messages dans les tribunes de chat, les articles, les commentaires et tout autre contenu
                  généré par les utilisateurs.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  To access certain features of Fans Tribune, you must create a user account. You are
                  responsible for maintaining the confidentiality of your account and password, and you
                  accept responsibility for all activities that occur under your account.
                </p>
                <p>
                  You agree to provide accurate, current, and complete information during registration and
                  to update such information to keep it accurate. You must be at least 13 years old to
                  create an account on our platform.
                </p>
                <p>
                  You are solely responsible for the content you publish on the platform, including messages
                  in chat tribunes, articles, comments, and any other user-generated content.
                </p>
              </div>
            )}
          </section>

          {/* 3. Content & behavior */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '3. Contenu et comportement' : '3. Content & Behavior'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>En utilisant La tribune des fans, vous vous engagez à respecter les règles suivantes\u00a0:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Respect mutuel\u00a0:</strong> Traitez les autres utilisateurs avec respect. Les débats
                    sportifs passionnés sont encouragés, mais les attaques personnelles, l&apos;intimidation et
                    le harcèlement sont strictement interdits.
                  </li>
                  <li>
                    <strong>Pas de discours haineux\u00a0:</strong> Tout contenu discriminatoire basé sur la race,
                    l&apos;ethnie, le genre, l&apos;orientation sexuelle, la religion, le handicap ou toute autre
                    caractéristique protégée est interdit.
                  </li>
                  <li>
                    <strong>Pas de spam\u00a0:</strong> La publication répétitive de contenu non pertinent, la
                    promotion commerciale non autorisée et l&apos;envoi de messages en masse sont interdits.
                  </li>
                  <li>
                    <strong>Contenu approprié\u00a0:</strong> Le contenu violent, pornographique, illégal ou
                    autrement inapproprié n&apos;est pas autorisé sur la plateforme.
                  </li>
                  <li>
                    <strong>Pas d&apos;usurpation d&apos;identité\u00a0:</strong> Vous ne pouvez pas vous faire passer pour
                    une autre personne ou entité.
                  </li>
                </ul>
                <p>
                  Nous nous réservons le droit de supprimer tout contenu qui enfreint ces règles et de
                  suspendre ou résilier les comptes des utilisateurs qui ne les respectent pas.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>By using Fans Tribune, you agree to abide by the following rules:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Mutual respect:</strong> Treat other users with respect. Passionate sports
                    debates are encouraged, but personal attacks, intimidation, and harassment are strictly
                    prohibited.
                  </li>
                  <li>
                    <strong>No hate speech:</strong> Any discriminatory content based on race, ethnicity,
                    gender, sexual orientation, religion, disability, or any other protected characteristic
                    is prohibited.
                  </li>
                  <li>
                    <strong>No spam:</strong> Repetitive posting of irrelevant content, unauthorized
                    commercial promotion, and mass messaging are prohibited.
                  </li>
                  <li>
                    <strong>Appropriate content:</strong> Violent, pornographic, illegal, or otherwise
                    inappropriate content is not allowed on the platform.
                  </li>
                  <li>
                    <strong>No impersonation:</strong> You may not impersonate another person or entity.
                  </li>
                </ul>
                <p>
                  We reserve the right to remove any content that violates these rules and to suspend or
                  terminate the accounts of users who fail to comply.
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
                  Le contenu original de La tribune des fans, y compris le design, les logos, le code source
                  et les textes, est la propriété de La tribune des fans et est protégé par les lois sur le
                  droit d&apos;auteur et la propriété intellectuelle.
                </p>
                <p>
                  En publiant du contenu sur la plateforme, vous accordez à La tribune des fans une licence
                  non exclusive, mondiale, libre de redevances et transférable pour utiliser, afficher,
                  reproduire et distribuer votre contenu dans le cadre du fonctionnement de la plateforme.
                  Vous conservez tous les droits de propriété sur votre contenu original.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  The original content of Fans Tribune, including the design, logos, source code, and texts,
                  is the property of Fans Tribune and is protected by copyright and intellectual property laws.
                </p>
                <p>
                  By publishing content on the platform, you grant Fans Tribune a non-exclusive, worldwide,
                  royalty-free, and transferable license to use, display, reproduce, and distribute your
                  content in connection with the operation of the platform. You retain all ownership rights
                  to your original content.
                </p>
              </div>
            )}
          </section>

          {/* 5. Limitation of liability */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '5. Limitation de responsabilité' : '5. Limitation of Liability'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  La tribune des fans est fournie « telle quelle » et « selon la disponibilité ». Nous ne
                  garantissons pas que le service sera ininterrompu, sécurisé ou exempt d&apos;erreurs.
                </p>
                <p>
                  En aucun cas, La tribune des fans, ses dirigeants, administrateurs ou employés ne pourront
                  être tenus responsables de tout dommage direct, indirect, accessoire, spécial, consécutif
                  ou punitif résultant de votre utilisation de la plateforme ou de votre incapacité à
                  l&apos;utiliser.
                </p>
                <p>
                  Le contenu publié par les utilisateurs représente uniquement les opinions de leurs
                  auteurs respectifs et ne reflète pas nécessairement les opinions de La tribune des fans.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  Fans Tribune is provided &quot;as is&quot; and &quot;as available.&quot; We do not guarantee that the service
                  will be uninterrupted, secure, or error-free.
                </p>
                <p>
                  In no event shall Fans Tribune, its officers, directors, or employees be liable for any
                  direct, indirect, incidental, special, consequential, or punitive damages resulting from
                  your use of or inability to use the platform.
                </p>
                <p>
                  Content published by users represents only the opinions of their respective authors and
                  does not necessarily reflect the opinions of Fans Tribune.
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
              <div className="space-y-3">
                <p>
                  La tribune des fans utilise Google AdSense et d&apos;autres services publicitaires pour
                  afficher des annonces sur la plateforme. Ces annonces nous aident à financer le
                  développement et le maintien de la plateforme.
                </p>
                <p>
                  Les annonces affichées sont gérées par des tiers et peuvent utiliser des cookies ou
                  d&apos;autres technologies de suivi. Pour plus d&apos;informations sur la façon dont vos données
                  sont utilisées à des fins publicitaires, veuillez consulter notre politique de
                  confidentialité.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  Fans Tribune uses Google AdSense and other advertising services to display ads on the
                  platform. These ads help us fund the development and maintenance of the platform.
                </p>
                <p>
                  Displayed ads are managed by third parties and may use cookies or other tracking
                  technologies. For more information about how your data is used for advertising purposes,
                  please see our privacy policy.
                </p>
              </div>
            )}
          </section>

          {/* 7. Termination */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '7. Résiliation' : '7. Termination'}
            </h2>
            {isFr ? (
              <p>
                Nous nous réservons le droit de suspendre ou de résilier votre compte à tout moment,
                avec ou sans préavis, pour toute raison, y compris, mais sans s&apos;y limiter, la violation
                de ces conditions d&apos;utilisation. Vous pouvez également supprimer votre compte à tout
                moment en nous contactant. En cas de résiliation, vos droits d&apos;utilisation de la
                plateforme cesseront immédiatement.
              </p>
            ) : (
              <p>
                We reserve the right to suspend or terminate your account at any time, with or without
                notice, for any reason, including but not limited to violation of these terms of use.
                You may also delete your account at any time by contacting us. Upon termination, your
                rights to use the platform will cease immediately.
              </p>
            )}
          </section>

          {/* 8. Modifications */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '8. Modifications des conditions' : '8. Modifications to Terms'}
            </h2>
            {isFr ? (
              <p>
                La tribune des fans se réserve le droit de modifier ces conditions d&apos;utilisation à tout
                moment. Les modifications entreront en vigueur dès leur publication sur cette page.
                Votre utilisation continue de la plateforme après la publication des modifications
                constitue votre acceptation des nouvelles conditions. Nous vous encourageons à
                consulter régulièrement cette page pour prendre connaissance des éventuelles
                modifications.
              </p>
            ) : (
              <p>
                Fans Tribune reserves the right to modify these terms of use at any time. Changes will
                take effect as soon as they are posted on this page. Your continued use of the platform
                after the posting of changes constitutes your acceptance of the new terms. We encourage
                you to review this page regularly for any changes.
              </p>
            )}
          </section>

          {/* 9. Contact */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '9. Contact' : '9. Contact'}
            </h2>
            {isFr ? (
              <p>
                Si vous avez des questions concernant ces conditions d&apos;utilisation, vous pouvez nous
                contacter à l&apos;adresse suivante\u00a0:{' '}
                <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                  info@fanstribune.com
                </a>
              </p>
            ) : (
              <p>
                If you have any questions about these terms of use, you can contact us at:{' '}
                <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                  info@fanstribune.com
                </a>
              </p>
            )}
          </section>
        </div>

        {/* Ad at the bottom */}
        <div className="mt-10 flex justify-center">
          <AdSlot slotId="terms-bottom" format="rectangle" />
        </div>
      </div>
    </div>
  );
}
