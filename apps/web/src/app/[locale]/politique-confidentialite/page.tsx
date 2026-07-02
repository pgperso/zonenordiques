import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { AdSlot } from '@/components/ads/AdSlot';
import { BRAND } from '@/lib/brand';

export const revalidate = 86400;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const isFr = locale === 'fr';
  const title = isFr
    ? `Politique de confidentialité | ${BRAND.name}`
    : `Privacy Policy | ${BRAND.nameEn}`;
  const description = isFr
    ? `Politique de confidentialité de ${BRAND.name} : collecte, utilisation, conservation, droits Loi 25 et RGPD, cookies, publicité Google AdSense, sous-traitants et transferts hors Québec.`
    : `${BRAND.nameEn} privacy policy: data collection, use, retention, Law 25 and GDPR rights, cookies, Google AdSense advertising, subprocessors and transfers outside Quebec.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BRAND.url}/${locale}/politique-confidentialite`,
      siteName: BRAND.name,
      locale: isFr ? 'fr_CA' : 'en_CA',
      images: [{ url: BRAND.logoUrl, alt: BRAND.name, width: BRAND.logoWidth, height: BRAND.logoHeight }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [BRAND.logoUrl],
    },
    alternates: {
      canonical: `${BRAND.url}/${locale}/politique-confidentialite`,
      languages: {
        'fr-CA': `${BRAND.url}/fr/politique-confidentialite`,
        'en-CA': `${BRAND.url}/en/politique-confidentialite`,
        'x-default': `${BRAND.url}/fr/politique-confidentialite`,
      },
    },
    robots: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large', 'max-video-preview': -1 },
  };
}

export default async function PolitiqueConfidentialite({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFr = locale === 'fr';
  const lastUpdated = isFr ? 'Dernière mise à jour : 17 avril 2026' : 'Last updated: April 17, 2026';

  return (
    <div className="flex flex-1 min-h-0 flex-col px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 md:text-4xl">
          {isFr ? 'Politique de confidentialité' : 'Privacy Policy'}
        </h1>
        <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">{lastUpdated}</p>

        <div className="space-y-8 text-gray-700 dark:text-gray-300 leading-relaxed">
          {/* Intro */}
          <section>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  La présente politique de confidentialité explique comment <strong>La tribune des fans</strong>{' '}
                  (« nous », « notre », « Fans Tribune ») collecte, utilise, conserve, partage et protège
                  vos renseignements personnels lorsque vous utilisez le site{' '}
                  <strong>fanstribune.com</strong> et les services associés.
                </p>
                <p>
                  Nous opérons depuis le Québec, Canada, et nous nous conformons à la{' '}
                  <strong>Loi sur la protection des renseignements personnels dans le secteur privé</strong>{' '}
                  du Québec (communément appelée <strong>Loi 25</strong>), à la{' '}
                  <strong>Loi sur la protection des renseignements personnels et les documents électroniques</strong>{' '}
                  (LPRPDE / PIPEDA) du Canada, ainsi qu&apos;aux principes du <strong>Règlement général
                  sur la protection des données</strong> (RGPD) de l&apos;Union européenne pour les
                  visiteurs européens.
                </p>
                <p>
                  Nous vous encourageons à lire cette politique attentivement. En utilisant
                  fanstribune.com, vous acceptez les pratiques décrites ici. Si vous n&apos;êtes pas
                  d&apos;accord avec cette politique, merci de ne pas utiliser la plateforme.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  This privacy policy explains how <strong>Fans Tribune</strong> (&quot;we&quot;, &quot;our&quot;,
                  &quot;La tribune des fans&quot;) collects, uses, retains, shares, and protects your personal
                  information when you use the <strong>fanstribune.com</strong> website and related services.
                </p>
                <p>
                  We operate from Quebec, Canada, and comply with Quebec&apos;s{' '}
                  <strong>Act respecting the protection of personal information in the private sector</strong>{' '}
                  (commonly known as <strong>Law 25</strong>), Canada&apos;s{' '}
                  <strong>Personal Information Protection and Electronic Documents Act</strong> (PIPEDA),
                  and the principles of the EU <strong>General Data Protection Regulation</strong> (GDPR)
                  for European visitors.
                </p>
                <p>
                  We encourage you to read this policy carefully. By using fanstribune.com, you accept
                  the practices described here. If you do not agree with this policy, please do not use
                  the platform.
                </p>
              </div>
            )}
          </section>

          {/* 1. Person responsible */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '1. Responsable de la protection des renseignements personnels' : '1. Person Responsible for Personal Information Protection'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  Conformément à la Loi 25, nous avons désigné un responsable de la protection des
                  renseignements personnels&nbsp;:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    <strong>Nom&nbsp;:</strong> Pascal Grenon
                  </li>
                  <li>
                    <strong>Fonction&nbsp;:</strong> Fondateur et responsable de la vie privée
                  </li>
                  <li>
                    <strong>Courriel&nbsp;:</strong>{' '}
                    <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                      info@fanstribune.com
                    </a>
                  </li>
                </ul>
                <p>
                  Toute demande d&apos;accès, de rectification, de retrait ou toute plainte peut être
                  adressée à ce contact. Nous répondons dans un délai maximal de 30 jours suivant la
                  réception de votre demande.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  In accordance with Law 25, we have designated a person responsible for personal
                  information protection:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    <strong>Name:</strong> Pascal Grenon
                  </li>
                  <li>
                    <strong>Role:</strong> Founder and privacy officer
                  </li>
                  <li>
                    <strong>Email:</strong>{' '}
                    <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                      info@fanstribune.com
                    </a>
                  </li>
                </ul>
                <p>
                  Any access, rectification, withdrawal request, or complaint can be sent to this
                  contact. We respond within a maximum of 30 days from receiving your request.
                </p>
              </div>
            )}
          </section>

          {/* 2. Data collected */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '2. Renseignements que nous collectons' : '2. Information We Collect'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  Nous collectons uniquement les renseignements strictement nécessaires au
                  fonctionnement de la plateforme (principe de minimisation).
                </p>
                <p>
                  <strong>Données fournies par vous lors de l&apos;inscription&nbsp;:</strong>
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Adresse courriel (obligatoire, utilisée pour l&apos;authentification)</li>
                  <li>Nom d&apos;utilisateur (pseudonyme public affiché sur la plateforme)</li>
                  <li>Mot de passe (stocké sous forme de hachage cryptographique, jamais en clair)</li>
                  <li>Optionnel&nbsp;: photo de profil, prénom, nom, biographie courte</li>
                </ul>
                <p>
                  <strong>Données générées par votre activité&nbsp;:</strong>
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Messages que vous publiez dans les tribunes de chat</li>
                  <li>Articles, podcasts et commentaires que vous soumettez</li>
                  <li>Réactions (likes, votes aux jauges de confiance)</li>
                  <li>Communautés que vous rejoignez</li>
                </ul>
                <p>
                  <strong>Données techniques collectées automatiquement&nbsp;:</strong>
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Adresse IP (utilisée pour la sécurité et la prévention d&apos;abus)</li>
                  <li>Type de navigateur et système d&apos;exploitation (user agent)</li>
                  <li>Pages visitées, durée de visite, référent (analytique agrégée)</li>
                  <li>Cookies de session et cookies de préférence (voir section dédiée)</li>
                </ul>
                <p>
                  Nous <strong>ne collectons pas</strong> votre adresse postale, votre numéro de
                  téléphone, votre numéro d&apos;assurance sociale, vos coordonnées bancaires ou tout
                  autre renseignement sensible non nécessaire au service.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  We collect only the information strictly necessary for the platform&apos;s operation
                  (data minimization principle).
                </p>
                <p>
                  <strong>Data you provide at registration:</strong>
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Email address (mandatory, used for authentication)</li>
                  <li>Username (public alias displayed on the platform)</li>
                  <li>Password (stored as a cryptographic hash, never in clear)</li>
                  <li>Optional: profile picture, first name, last name, short bio</li>
                </ul>
                <p>
                  <strong>Data generated by your activity:</strong>
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Messages you post in chat tribunes</li>
                  <li>Articles, podcasts, and comments you submit</li>
                  <li>Reactions (likes, confidence gauge votes)</li>
                  <li>Communities you join</li>
                </ul>
                <p>
                  <strong>Technical data collected automatically:</strong>
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>IP address (used for security and abuse prevention)</li>
                  <li>Browser type and operating system (user agent)</li>
                  <li>Pages visited, visit duration, referrer (aggregated analytics)</li>
                  <li>Session cookies and preference cookies (see dedicated section)</li>
                </ul>
                <p>
                  We <strong>do not collect</strong> your postal address, phone number, social insurance
                  number, banking details, or any other sensitive information not required for the service.
                </p>
              </div>
            )}
          </section>

          {/* 3. Purpose and legal basis */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '3. Finalités et base légale du traitement' : '3. Purposes and Legal Basis for Processing'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>Nous utilisons vos renseignements pour les finalités suivantes&nbsp;:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Fournir le service</strong> (exécution du contrat)&nbsp;: gestion du compte,
                    authentification, affichage des contenus, participation aux tribunes.
                  </li>
                  <li>
                    <strong>Sécurité et prévention de la fraude</strong> (intérêt légitime / obligation
                    légale)&nbsp;: détection d&apos;abus, limitation de débit, blocage de spam, journaux
                    de connexion.
                  </li>
                  <li>
                    <strong>Amélioration du service</strong> (intérêt légitime)&nbsp;: analyse agrégée
                    d&apos;utilisation, diagnostics de performance, résolution de bogues.
                  </li>
                  <li>
                    <strong>Communications liées au compte</strong> (exécution du contrat)&nbsp;:
                    confirmation d&apos;inscription, réinitialisation de mot de passe, notifications de
                    sécurité.
                  </li>
                  <li>
                    <strong>Publicité</strong> (consentement)&nbsp;: diffusion d&apos;annonces Google
                    AdSense, avec ou sans personnalisation selon vos préférences.
                  </li>
                  <li>
                    <strong>Respect des obligations légales</strong>&nbsp;: réponse aux demandes des
                    autorités compétentes, conservation de journaux lorsque la loi l&apos;exige.
                  </li>
                </ul>
              </div>
            ) : (
              <div className="space-y-3">
                <p>We use your information for the following purposes:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Providing the service</strong> (contract performance): account management,
                    authentication, content display, tribune participation.
                  </li>
                  <li>
                    <strong>Security and fraud prevention</strong> (legitimate interest / legal
                    obligation): abuse detection, rate limiting, spam blocking, connection logs.
                  </li>
                  <li>
                    <strong>Service improvement</strong> (legitimate interest): aggregated usage analysis,
                    performance diagnostics, bug resolution.
                  </li>
                  <li>
                    <strong>Account-related communications</strong> (contract performance): registration
                    confirmation, password reset, security notifications.
                  </li>
                  <li>
                    <strong>Advertising</strong> (consent): Google AdSense ad delivery, with or without
                    personalization based on your preferences.
                  </li>
                  <li>
                    <strong>Legal compliance</strong>: response to authorities&apos; requests, log
                    retention when required by law.
                  </li>
                </ul>
              </div>
            )}
          </section>

          {/* 4. Cookies */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '4. Cookies et technologies similaires' : '4. Cookies and Similar Technologies'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  Nous utilisons différents types de cookies. Un bandeau de consentement vous permet
                  d&apos;accepter ou de refuser les cookies non essentiels dès votre première visite.
                </p>
                <p>
                  <strong>Cookies strictement nécessaires</strong> (toujours actifs)&nbsp;:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    Cookies d&apos;authentification Supabase (maintien de votre session)
                  </li>
                  <li>
                    Cookies de sécurité (protection CSRF, en-têtes de sécurité)
                  </li>
                  <li>
                    Cookie de préférence linguistique (fr/en) et de consentement cookies
                  </li>
                </ul>
                <p>
                  <strong>Cookies de mesure d&apos;audience</strong> (soumis à consentement)&nbsp;:
                  collecte anonymisée de données d&apos;usage agrégées pour comprendre l&apos;activité
                  du site.
                </p>
                <p>
                  <strong>Cookies publicitaires tiers</strong> (soumis à consentement)&nbsp;: déposés
                  par Google AdSense pour afficher des annonces et mesurer leur performance. Vous pouvez
                  refuser la publicité personnalisée dans les{' '}
                  <a
                    href="https://adssettings.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-600 hover:underline"
                  >
                    paramètres publicitaires Google
                  </a>{' '}
                  ou en bloquant les cookies tiers dans votre navigateur. Dans ce cas, les annonces
                  continueront de s&apos;afficher, mais sans personnalisation.
                </p>
                <p>
                  Vous pouvez à tout moment revenir sur votre consentement via le lien « Préférences
                  cookies » en bas de chaque page, ou en supprimant les cookies dans les paramètres de
                  votre navigateur.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  We use different types of cookies. A consent banner lets you accept or refuse
                  non-essential cookies from your first visit.
                </p>
                <p>
                  <strong>Strictly necessary cookies</strong> (always active):
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Supabase authentication cookies (maintaining your session)</li>
                  <li>Security cookies (CSRF protection, security headers)</li>
                  <li>Language preference (fr/en) and cookie-consent cookies</li>
                </ul>
                <p>
                  <strong>Audience measurement cookies</strong> (consent-based): anonymized aggregated
                  usage data collection to understand site activity.
                </p>
                <p>
                  <strong>Third-party advertising cookies</strong> (consent-based): placed by Google
                  AdSense to display ads and measure performance. You can opt out of personalized
                  advertising in your{' '}
                  <a
                    href="https://adssettings.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-600 hover:underline"
                  >
                    Google Ads settings
                  </a>{' '}
                  or by blocking third-party cookies in your browser. Ads will still be shown, but
                  without personalization.
                </p>
                <p>
                  You can withdraw consent at any time via the &quot;Cookie preferences&quot; link at the
                  bottom of each page, or by deleting cookies in your browser settings.
                </p>
              </div>
            )}
          </section>

          {/* 5. Subprocessors */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '5. Sous-traitants et destinataires des données' : '5. Subprocessors and Data Recipients'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  Pour opérer la plateforme, nous faisons appel à des sous-traitants techniques
                  soigneusement sélectionnés. Ces entreprises traitent vos données uniquement pour les
                  finalités décrites et sont liées par des engagements contractuels de confidentialité
                  et de sécurité.
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Supabase Inc.</strong> (Singapour / États-Unis)&nbsp;: hébergement de la base
                    de données, authentification, stockage de fichiers. Les données sont hébergées dans
                    une région géographique spécifique choisie par nous.
                  </li>
                  <li>
                    <strong>Vercel Inc.</strong> (États-Unis)&nbsp;: hébergement web, CDN, journaux
                    techniques de requêtes.
                  </li>
                  <li>
                    <strong>Google LLC — AdSense</strong> (États-Unis)&nbsp;: diffusion de publicités,
                    mesure des impressions et des clics.
                  </li>
                  <li>
                    <strong>Fournisseur de courriel transactionnel</strong>&nbsp;: envoi des courriels
                    de confirmation d&apos;inscription et de réinitialisation de mot de passe (par
                    exemple, Supabase Auth ou un service de type SMTP équivalent).
                  </li>
                </ul>
                <p>
                  Nous <strong>ne vendons jamais</strong> vos renseignements personnels à des tiers.
                  Nous ne partageons pas vos données avec des annonceurs. Les annonceurs AdSense
                  n&apos;accèdent pas à votre profil, ni à votre courriel, ni à votre historique
                  détaillé sur notre site.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  To operate the platform, we rely on carefully selected technical subprocessors. These
                  companies process your data only for the described purposes and are bound by
                  contractual confidentiality and security commitments.
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Supabase Inc.</strong> (Singapore / United States): database hosting,
                    authentication, file storage. Data is hosted in a specific geographic region of our
                    choosing.
                  </li>
                  <li>
                    <strong>Vercel Inc.</strong> (United States): web hosting, CDN, technical request logs.
                  </li>
                  <li>
                    <strong>Google LLC — AdSense</strong> (United States): ad delivery, impression and
                    click measurement.
                  </li>
                  <li>
                    <strong>Transactional email provider</strong>: sending registration confirmation and
                    password reset emails (e.g. Supabase Auth or an equivalent SMTP service).
                  </li>
                </ul>
                <p>
                  We <strong>never sell</strong> your personal information to third parties. We do not
                  share your data with advertisers. AdSense advertisers do not access your profile,
                  your email, or your detailed browsing history on our site.
                </p>
              </div>
            )}
          </section>

          {/* 6. Transfers outside Quebec */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '6. Transferts de données hors Québec' : '6. Transfers of Data Outside Quebec'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  Conformément à l&apos;article 17 de la Loi 25, nous vous informons que vos
                  renseignements personnels peuvent être transférés, stockés ou traités en dehors du
                  Québec, principalement aux États-Unis et à Singapour, par nos sous-traitants
                  techniques identifiés ci-dessus.
                </p>
                <p>
                  Avant tout transfert, nous évaluons si le niveau de protection offert par le pays de
                  destination est équivalent à celui applicable au Québec. Lorsque nécessaire, nous
                  mettons en place des garanties contractuelles (clauses types, engagements de
                  confidentialité et de sécurité) pour assurer une protection adéquate.
                </p>
                <p>
                  Vous pouvez, à tout moment, demander de plus amples renseignements sur les transferts
                  réalisés et les garanties appliquées en écrivant à{' '}
                  <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                    info@fanstribune.com
                  </a>
                  .
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  In accordance with section 17 of Quebec&apos;s Law 25, we inform you that your
                  personal information may be transferred, stored, or processed outside Quebec — mainly
                  in the United States and Singapore — by our technical subprocessors identified above.
                </p>
                <p>
                  Before any transfer, we assess whether the level of protection offered by the
                  destination country is equivalent to that applicable in Quebec. When necessary, we put
                  in place contractual safeguards (standard clauses, confidentiality and security
                  commitments) to ensure adequate protection.
                </p>
                <p>
                  You may, at any time, request further information about transfers and the safeguards
                  applied by writing to{' '}
                  <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                    info@fanstribune.com
                  </a>
                  .
                </p>
              </div>
            )}
          </section>

          {/* 7. Retention */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '7. Durée de conservation' : '7. Retention Period'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  Nous conservons vos renseignements personnels aussi longtemps que nécessaire pour les
                  finalités décrites, puis nous les supprimons ou les anonymisons.
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Compte utilisateur actif</strong>&nbsp;: tant que le compte existe.
                  </li>
                  <li>
                    <strong>Compte inactif</strong>&nbsp;: après 24 mois sans connexion, nous pouvons
                    vous envoyer un avis avant suppression ou anonymisation du compte.
                  </li>
                  <li>
                    <strong>Compte supprimé à votre demande</strong>&nbsp;: suppression sous 30 jours,
                    sauf obligations légales de conservation (journaux de sécurité, obligations
                    fiscales applicables).
                  </li>
                  <li>
                    <strong>Contenu publié</strong> (messages, articles, podcasts)&nbsp;: conservé tant
                    que la communauté reste active. Lors de la suppression de votre compte, votre
                    contenu peut être anonymisé (affiché sous « [Utilisateur supprimé] ») pour préserver
                    la cohérence des conversations communautaires, sauf si vous demandez explicitement
                    sa suppression.
                  </li>
                  <li>
                    <strong>Journaux techniques</strong>&nbsp;: 90 jours maximum pour les logs de
                    requêtes, 12 mois pour les journaux de sécurité.
                  </li>
                </ul>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  We keep your personal information as long as necessary for the purposes described,
                  then delete or anonymize it.
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Active user account</strong>: as long as the account exists.
                  </li>
                  <li>
                    <strong>Inactive account</strong>: after 24 months without login, we may send you a
                    notice before deletion or anonymization of the account.
                  </li>
                  <li>
                    <strong>Account deleted at your request</strong>: deletion within 30 days, except
                    legal retention obligations (security logs, applicable tax obligations).
                  </li>
                  <li>
                    <strong>Published content</strong> (messages, articles, podcasts): kept as long as
                    the community remains active. Upon account deletion, your content may be anonymized
                    (shown as &quot;[Deleted user]&quot;) to preserve community-conversation consistency,
                    unless you explicitly request its deletion.
                  </li>
                  <li>
                    <strong>Technical logs</strong>: max 90 days for request logs, 12 months for
                    security logs.
                  </li>
                </ul>
              </div>
            )}
          </section>

          {/* 8. Your rights */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '8. Vos droits' : '8. Your Rights'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  Conformément à la Loi 25 (Québec), à la LPRPDE (Canada) et au RGPD (Union européenne),
                  vous disposez des droits suivants sur vos renseignements personnels&nbsp;:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Droit d&apos;accès</strong>&nbsp;: obtenir une copie des renseignements que
                    nous détenons sur vous.
                  </li>
                  <li>
                    <strong>Droit de rectification</strong>&nbsp;: faire corriger les renseignements
                    inexacts, incomplets ou périmés.
                  </li>
                  <li>
                    <strong>Droit à la suppression (effacement)</strong>&nbsp;: demander la suppression
                    de vos données lorsqu&apos;elles ne sont plus nécessaires.
                  </li>
                  <li>
                    <strong>Droit à la portabilité</strong>&nbsp;: recevoir vos données dans un format
                    structuré et couramment utilisé.
                  </li>
                  <li>
                    <strong>Droit de retirer votre consentement</strong>&nbsp;: à tout moment, pour les
                    traitements fondés sur le consentement (publicité personnalisée par exemple).
                  </li>
                  <li>
                    <strong>Droit à la désindexation</strong>&nbsp;: demander qu&apos;un contenu
                    personnel vous concernant ne soit plus référencé par les moteurs de recherche.
                  </li>
                  <li>
                    <strong>Droit de déposer une plainte</strong>&nbsp;: auprès de la{' '}
                    <a
                      href="https://www.cai.gouv.qc.ca/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      Commission d&apos;accès à l&apos;information du Québec
                    </a>
                    , du{' '}
                    <a
                      href="https://www.priv.gc.ca/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      Commissariat à la protection de la vie privée du Canada
                    </a>
                    , ou de l&apos;autorité de protection des données de votre pays de résidence
                    (pour les résidents de l&apos;UE).
                  </li>
                </ul>
                <p>
                  Pour exercer ces droits, écrivez à{' '}
                  <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                    info@fanstribune.com
                  </a>
                  . Nous pourrons vous demander une preuve d&apos;identité raisonnable pour protéger
                  votre compte. Nous répondons dans un délai maximal de 30 jours.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  Under Quebec&apos;s Law 25, Canada&apos;s PIPEDA, and the EU&apos;s GDPR, you have the
                  following rights regarding your personal information:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Right of access</strong>: obtain a copy of the information we hold about you.
                  </li>
                  <li>
                    <strong>Right to rectification</strong>: have inaccurate, incomplete, or outdated
                    information corrected.
                  </li>
                  <li>
                    <strong>Right to erasure</strong>: request deletion of your data when no longer
                    necessary.
                  </li>
                  <li>
                    <strong>Right to portability</strong>: receive your data in a structured, commonly
                    used format.
                  </li>
                  <li>
                    <strong>Right to withdraw consent</strong>: at any time, for consent-based
                    processing (e.g. personalized advertising).
                  </li>
                  <li>
                    <strong>Right to de-indexing</strong>: request that personal content about you no
                    longer be referenced by search engines.
                  </li>
                  <li>
                    <strong>Right to file a complaint</strong>: with the{' '}
                    <a
                      href="https://www.cai.gouv.qc.ca/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      Quebec Access to Information Commission
                    </a>
                    , the{' '}
                    <a
                      href="https://www.priv.gc.ca/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      Office of the Privacy Commissioner of Canada
                    </a>
                    , or your country&apos;s data protection authority (for EU residents).
                  </li>
                </ul>
                <p>
                  To exercise these rights, write to{' '}
                  <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                    info@fanstribune.com
                  </a>
                  . We may ask for reasonable proof of identity to protect your account. We respond
                  within a maximum of 30 days.
                </p>
              </div>
            )}
          </section>

          {/* 9. Security */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '9. Sécurité' : '9. Security'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  Nous mettons en œuvre des mesures techniques et organisationnelles raisonnables pour
                  protéger vos données contre l&apos;accès non autorisé, la perte, la divulgation ou la
                  modification, notamment&nbsp;:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Chiffrement des communications (HTTPS / TLS 1.3) sur tout le site</li>
                  <li>Chiffrement des données au repos sur les serveurs Supabase</li>
                  <li>Hachage cryptographique des mots de passe (jamais stockés en clair)</li>
                  <li>Politique de sécurité du contenu (CSP) stricte avec nonces dynamiques</li>
                  <li>En-têtes de sécurité HTTP (HSTS, X-Frame-Options, etc.)</li>
                  <li>Contrôle d&apos;accès au niveau des lignes (RLS) sur la base de données</li>
                  <li>Limitation de débit (rate limiting) pour prévenir les abus</li>
                  <li>Mises à jour de sécurité régulières des dépendances</li>
                </ul>
                <p>
                  En cas d&apos;incident de confidentialité présentant un risque de préjudice sérieux,
                  nous vous informerons sans délai injustifié conformément aux obligations de la Loi 25
                  et du RGPD, et notifierons les autorités compétentes.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  We implement reasonable technical and organizational measures to protect your data
                  against unauthorized access, loss, disclosure, or alteration, including:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Encrypted communications (HTTPS / TLS 1.3) site-wide</li>
                  <li>Encryption of data at rest on Supabase servers</li>
                  <li>Cryptographic password hashing (never stored in clear)</li>
                  <li>Strict Content Security Policy (CSP) with dynamic nonces</li>
                  <li>HTTP security headers (HSTS, X-Frame-Options, etc.)</li>
                  <li>Row-level security (RLS) on the database</li>
                  <li>Rate limiting to prevent abuse</li>
                  <li>Regular dependency security updates</li>
                </ul>
                <p>
                  In the event of a privacy incident presenting a risk of serious harm, we will notify
                  you without undue delay in accordance with Law 25 and GDPR obligations, and notify the
                  competent authorities.
                </p>
              </div>
            )}
          </section>

          {/* 10. Children */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '10. Protection des mineurs' : '10. Protection of Minors'}
            </h2>
            {isFr ? (
              <p>
                Notre plateforme n&apos;est pas destinée aux enfants de moins de 13 ans. Nous ne
                collectons pas sciemment de renseignements personnels auprès d&apos;enfants de moins de
                13 ans. Si vous êtes parent ou tuteur et que vous découvrez que votre enfant nous a
                fourni des renseignements sans votre consentement, écrivez à info@fanstribune.com et
                nous supprimerons ces informations dans les meilleurs délais.
              </p>
            ) : (
              <p>
                Our platform is not intended for children under 13. We do not knowingly collect personal
                information from children under 13. If you are a parent or guardian and become aware
                that your child has provided information without your consent, please write to
                info@fanstribune.com and we will promptly delete the information.
              </p>
            )}
          </section>

          {/* 11. Advertising — AdSense */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '11. Publicité — Google AdSense' : '11. Advertising — Google AdSense'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  Nous affichons des annonces publicitaires via <strong>Google AdSense</strong> pour
                  financer l&apos;accès gratuit à la plateforme. Google agit comme fournisseur tiers et
                  utilise des cookies et identifiants publicitaires pour diffuser des annonces
                  pertinentes, mesurer leur efficacité et prévenir la fraude publicitaire.
                </p>
                <p>
                  Google peut combiner les données recueillies sur notre site avec des données
                  provenant d&apos;autres sites partenaires pour personnaliser les annonces. Nous ne
                  contrôlons pas et ne partageons pas vos renseignements personnels directs
                  (nom, courriel) avec Google AdSense&nbsp;; seules les données techniques de navigation
                  sur notre site sont accessibles à Google via votre navigateur.
                </p>
                <p>
                  Pour en savoir plus sur les pratiques publicitaires de Google, consultez&nbsp;:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    <a
                      href="https://policies.google.com/technologies/ads"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      Politique de publicité de Google
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://adssettings.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      Paramètres publicitaires Google
                    </a>{' '}
                    (gérer vos préférences d&apos;annonces personnalisées)
                  </li>
                  <li>
                    <a
                      href="https://www.youradchoices.ca/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      AdChoices Canada
                    </a>{' '}
                    (désactivation sectorielle)
                  </li>
                </ul>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  We display ads through <strong>Google AdSense</strong> to fund free access to the
                  platform. Google acts as a third-party vendor and uses cookies and advertising
                  identifiers to deliver relevant ads, measure effectiveness, and prevent ad fraud.
                </p>
                <p>
                  Google may combine data collected on our site with data from other partner sites to
                  personalize ads. We do not control and do not share your direct personal information
                  (name, email) with Google AdSense; only technical browsing data on our site is
                  accessible to Google via your browser.
                </p>
                <p>For more information on Google&apos;s ad practices, see:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    <a
                      href="https://policies.google.com/technologies/ads"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      Google Advertising Policy
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://adssettings.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      Google Ad Settings
                    </a>{' '}
                    (manage your personalized-ads preferences)
                  </li>
                  <li>
                    <a
                      href="https://www.youradchoices.ca/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 hover:underline"
                    >
                      AdChoices Canada
                    </a>{' '}
                    (industry-wide opt-out)
                  </li>
                </ul>
              </div>
            )}
          </section>

          {/* 12. Changes */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '12. Modifications de la politique' : '12. Changes to This Policy'}
            </h2>
            {isFr ? (
              <p>
                Nous pouvons mettre à jour cette politique pour refléter des changements de nos
                pratiques, des évolutions techniques ou des obligations légales. La date de dernière
                mise à jour en haut de cette page indique la version en vigueur. En cas de modification
                substantielle affectant vos droits, nous vous informerons par courriel ou par un avis
                affiché sur la plateforme, au moins 30 jours avant l&apos;entrée en vigueur.
              </p>
            ) : (
              <p>
                We may update this policy to reflect changes in our practices, technical developments,
                or legal obligations. The &quot;Last updated&quot; date at the top of this page indicates
                the version in effect. In the event of a substantial change affecting your rights, we
                will notify you by email or a notice displayed on the platform, at least 30 days before
                it takes effect.
              </p>
            )}
          </section>

          {/* 13. Contact */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? '13. Nous contacter' : '13. Contact Us'}
            </h2>
            {isFr ? (
              <p>
                Pour toute question concernant cette politique de confidentialité ou pour exercer vos
                droits, contactez notre responsable de la protection des renseignements personnels
                à{' '}
                <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                  info@fanstribune.com
                </a>
                . Consultez également nos{' '}
                <a href={`/${locale}/mentions-legales`} className="text-red-600 hover:underline font-medium">
                  mentions légales
                </a>{' '}
                pour les coordonnées complètes de l&apos;éditeur.
              </p>
            ) : (
              <p>
                For any question about this privacy policy or to exercise your rights, contact our
                privacy officer at{' '}
                <a href="mailto:info@fanstribune.com" className="text-red-600 hover:underline font-medium">
                  info@fanstribune.com
                </a>
                . Also see our{' '}
                <a href={`/${locale}/mentions-legales`} className="text-red-600 hover:underline font-medium">
                  legal notice
                </a>{' '}
                for full publisher contact details.
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
