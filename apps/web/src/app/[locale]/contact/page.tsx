import { setRequestLocale } from 'next-intl/server';
import { AdSlot } from '@/components/ads/AdSlot';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';
import { BRAND } from '@/lib/brand';
import type { Metadata } from 'next';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: `Contact | ${BRAND.name}`,
  description:
    `Contactez l'équipe de ${BRAND.name} (${BRAND.nameEn}). Envoyez-nous un courriel ou suivez-nous sur les réseaux sociaux.`,
  openGraph: {
    title: `Contact | ${BRAND.name}`,
    description: `Contactez l'équipe de ${BRAND.name}.`,
    url: `${BRAND.url}/fr/contact`,
    siteName: BRAND.name,
    type: 'website',
  },
  alternates: {
    canonical: `${BRAND.url}/fr/contact`,
    languages: {
      fr: `${BRAND.url}/fr/contact`,
      en: `${BRAND.url}/en/contact`,
    },
  },
};

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isFr = locale === 'fr';

  return (
    <div className="flex flex-1 min-h-0 flex-col px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-6 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 md:text-4xl">
          {isFr ? 'Nous contacter' : 'Contact Us'}
        </h1>

        <div className="space-y-8 text-gray-700 dark:text-gray-300 leading-relaxed">
          {/* Intro */}
          <section>
            {isFr ? (
              <p>
                Vous avez des questions, des commentaires ou des suggestions concernant La tribune des
                fans\u00a0? Nous serions ravis de vous entendre. N&apos;hésitez pas à nous contacter en
                utilisant les moyens ci-dessous.
              </p>
            ) : (
              <p>
                Have questions, feedback, or suggestions about Fans Tribune? We&apos;d love to hear from
                you. Feel free to reach out using the methods below.
              </p>
            )}
          </section>

          {/* Email */}
          <section className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-6">
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? 'Courriel' : 'Email'}
            </h2>
            <p className="mb-2">
              {isFr
                ? 'Pour toute question ou demande, envoyez-nous un courriel\u00a0:'
                : 'For any questions or inquiries, send us an email:'}
            </p>
            <ObfuscatedEmail
              user="info"
              domain="fanstribune.com"
              className="inline-flex items-center gap-2 text-lg font-medium text-red-600 hover:underline"
            />
            <span className="sr-only">{isFr ? 'Adresse courriel masquée anti-spam' : 'Email address hidden from spam bots'}</span>
          </section>

          {/* Social */}
          <section className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-6">
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? 'Réseaux sociaux' : 'Social Media'}
            </h2>
            <p className="mb-4">
              {isFr
                ? 'Suivez-nous sur les réseaux sociaux pour les dernières nouvelles et mises à jour\u00a0:'
                : 'Follow us on social media for the latest news and updates:'}
            </p>
            <div className="flex flex-col gap-3">
              <a
                href="https://x.com/fanstribune"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-500 transition-colors"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="font-medium">@fanstribune</span>
                <span className="text-sm text-gray-500">(X / Twitter)</span>
              </a>
            </div>
          </section>

          {/* About note */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? 'À propos de la plateforme' : 'About the Platform'}
            </h2>
            {isFr ? (
              <div className="space-y-3">
                <p>
                  La tribune des fans est une plateforme communautaire bilingue pour les fans de sport.
                  Nous offrons des tribunes de chat en temps réel, des articles, des podcasts, des jauges
                  de confiance et bien plus encore.
                </p>
                <p>
                  Notre objectif est de créer un espace accueillant et passionnant pour tous les fans de
                  sport au Québec, au Canada et dans le monde entier. Nous apprécions les commentaires
                  de nos utilisateurs et nous nous efforçons d&apos;améliorer continuellement la plateforme.
                </p>
                <p>
                  Si vous souhaitez en savoir plus sur notre plateforme, consultez notre page{' '}
                  <a href={`/${locale}/a-propos`} className="text-red-600 hover:underline font-medium">
                    {isFr ? 'À propos' : 'About'}
                  </a>
                  .
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  Fans Tribune is a bilingual community platform for sports fans. We offer real-time chat
                  tribunes, articles, podcasts, confidence gauges, and much more.
                </p>
                <p>
                  Our goal is to create a welcoming and exciting space for all sports fans in Quebec,
                  Canada, and around the world. We value feedback from our users and strive to
                  continuously improve the platform.
                </p>
                <p>
                  If you&apos;d like to learn more about our platform, visit our{' '}
                  <a href={`/${locale}/a-propos`} className="text-red-600 hover:underline font-medium">
                    About
                  </a>{' '}
                  page.
                </p>
              </div>
            )}
          </section>

          {/* Response time */}
          <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? 'Délai de réponse' : 'Response Time'}
            </h2>
            <p>
              {isFr
                ? 'Nous nous efforçons de répondre à tous les courriels dans un délai de 48 heures. Merci de votre patience.'
                : 'We strive to respond to all emails within 48 hours. Thank you for your patience.'}
            </p>
          </section>
        </div>

        {/* Ad at the bottom */}
        <div className="mt-10 flex justify-center">
          <AdSlot slotId="contact-bottom" format="rectangle" />
        </div>
      </div>
    </div>
  );
}
