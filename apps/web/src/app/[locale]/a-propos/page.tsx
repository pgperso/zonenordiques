import { setRequestLocale } from 'next-intl/server';
import { AdSlot } from '@/components/ads/AdSlot';
import { AdInArticle } from '@/components/ads/AdInArticle';
import { BRAND } from '@/lib/brand';
import type { Metadata } from 'next';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: `À propos | ${BRAND.name}`,
  description:
    `Découvrez ${BRAND.name} (${BRAND.nameEn}), la plateforme communautaire bilingue pour les fans de sport. Chat tribunes, articles, podcasts, jauges de confiance et plus encore.`,
  openGraph: {
    title: `À propos | ${BRAND.name}`,
    description:
      `${BRAND.name} est la plateforme communautaire bilingue pour les fans de sport au Québec et au Canada.`,
    url: `${BRAND.url}/fr/a-propos`,
    siteName: BRAND.name,
    type: 'website',
  },
  alternates: {
    canonical: `${BRAND.url}/fr/a-propos`,
    languages: {
      fr: `${BRAND.url}/fr/a-propos`,
      en: `${BRAND.url}/en/a-propos`,
    },
  },
};

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isFr = locale === 'fr';

  return (
    <div className="flex flex-1 min-h-0 flex-col px-4 py-8 md:py-12">
      <div className="mx-auto flex w-full max-w-5xl gap-8">
        {/* Main content */}
        <article className="flex-1 min-w-0">
          <h1 className="mb-6 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 md:text-4xl">
            {isFr ? 'À propos de La tribune des fans' : 'About Fans Tribune'}
          </h1>

          {/* Section 1: What is it */}
          <section className="mb-8">
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100 md:text-2xl">
              {isFr ? 'Qu\'est-ce que La tribune des fans\u00a0?' : 'What is Fans Tribune?'}
            </h2>
            {isFr ? (
              <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                <p>
                  <strong>La tribune des fans</strong> (Fans Tribune) est une plateforme communautaire en ligne
                  dédiée aux passionnés de sport. Que vous soyez fan de hockey, de football, de soccer,
                  de basketball ou de tout autre sport, vous trouverez ici un espace pour partager votre
                  passion avec d&apos;autres fans.
                </p>
                <p>
                  Notre plateforme offre un environnement bilingue (français et anglais) conçu pour
                  rassembler les communautés sportives du Québec, du Canada et d&apos;ailleurs. Nous
                  croyons que le sport unit les gens, peu importe la langue qu&apos;ils parlent.
                </p>
              </div>
            ) : (
              <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                <p>
                  <strong>Fans Tribune</strong> (La tribune des fans) is an online community platform
                  dedicated to sports enthusiasts. Whether you&apos;re a fan of hockey, football, soccer,
                  basketball, or any other sport, you&apos;ll find a space here to share your passion with
                  other fans.
                </p>
                <p>
                  Our platform offers a bilingual environment (French and English) designed to bring
                  together sports communities from Quebec, Canada, and beyond. We believe that sports
                  unite people, regardless of the language they speak.
                </p>
              </div>
            )}
          </section>

          {/* In-article ad */}
          <AdInArticle />

          {/* Section 2: Features */}
          <section className="mb-8">
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100 md:text-2xl">
              {isFr ? 'Nos fonctionnalités' : 'Our Features'}
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <ul className="list-disc pl-6 space-y-3">
                <li>
                  <strong>{isFr ? 'Tribunes de chat' : 'Chat Tribunes'}</strong> —{' '}
                  {isFr
                    ? 'Discutez en temps réel avec d\'autres fans dans des salons de discussion dédiés à chaque communauté sportive. Réagissez aux matchs en direct, partagez vos analyses et débattez des décisions des entraîneurs.'
                    : 'Chat in real time with other fans in discussion rooms dedicated to each sports community. React to live games, share your analyses, and debate coaching decisions.'}
                </li>
                <li>
                  <strong>{isFr ? 'Articles et analyses' : 'Articles & Analysis'}</strong> —{' '}
                  {isFr
                    ? 'Lisez et publiez des articles sur vos équipes favorites. Notre plateforme permet aux fans de partager leurs points de vue et analyses approfondies.'
                    : 'Read and publish articles about your favorite teams. Our platform allows fans to share their in-depth viewpoints and analyses.'}
                </li>
                <li>
                  <strong>{isFr ? 'Podcasts' : 'Podcasts'}</strong> —{' '}
                  {isFr
                    ? 'Écoutez des podcasts créés par des fans passionnés. Découvrez différentes perspectives sur les dernières nouvelles sportives.'
                    : 'Listen to podcasts created by passionate fans. Discover different perspectives on the latest sports news.'}
                </li>
                <li>
                  <strong>{isFr ? 'Jauges de confiance' : 'Confidence Gauges'}</strong> —{' '}
                  {isFr
                    ? 'Participez à nos jauges de confiance exclusives comme le Nordiquomètre et l\'Exposmètre. Votez pour exprimer votre niveau de confiance envers la direction de vos équipes favorites et voyez comment la communauté se positionne.'
                    : 'Participate in our exclusive confidence gauges like the Nordiquomètre and Exposmètre. Vote to express your confidence level in the management of your favorite teams and see how the community stands.'}
                </li>
                <li>
                  <strong>{isFr ? 'Communautés sportives' : 'Sports Communities'}</strong> —{' '}
                  {isFr
                    ? 'Rejoignez des communautés dédiées à vos équipes et sports préférés. Chaque communauté possède ses propres tribunes, articles et contenus exclusifs.'
                    : 'Join communities dedicated to your favorite teams and sports. Each community has its own tribunes, articles, and exclusive content.'}
                </li>
              </ul>
            </div>
          </section>

          {/* Section 3: Mission */}
          <section className="mb-8">
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100 md:text-2xl">
              {isFr ? 'Notre mission' : 'Our Mission'}
            </h2>
            {isFr ? (
              <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                <p>
                  Notre mission est de créer le meilleur espace en ligne pour les fans de sport
                  francophones et anglophones. Nous voulons offrir une plateforme où chaque fan peut
                  s&apos;exprimer librement, partager sa passion et se connecter avec d&apos;autres passionnés.
                </p>
                <p>
                  Nous croyons en une communauté respectueuse, inclusive et passionnée. La tribune des
                  fans est un lieu où les débats sportifs sont encouragés, où les opinions diverses sont
                  les bienvenues et où le respect mutuel est la norme.
                </p>
              </div>
            ) : (
              <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                <p>
                  Our mission is to create the best online space for French-speaking and English-speaking
                  sports fans. We want to offer a platform where every fan can express themselves freely,
                  share their passion, and connect with other enthusiasts.
                </p>
                <p>
                  We believe in a respectful, inclusive, and passionate community. Fans Tribune is a
                  place where sports debates are encouraged, where diverse opinions are welcome, and
                  where mutual respect is the norm.
                </p>
              </div>
            )}
          </section>

          {/* Section 4: Founder */}
          <section className="mb-8">
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100 md:text-2xl">
              {isFr ? 'Le fondateur' : 'The Founder'}
            </h2>
            {isFr ? (
              <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                <p>
                  La tribune des fans a été fondée par <strong>Pascal Grenon</strong>, connu sous le
                  pseudonyme <strong>QcFan</strong>. Fan de sport passionné depuis toujours, Pascal a
                  créé cette plateforme pour offrir aux fans un espace moderne et convivial pour
                  échanger sur leurs équipes et sports favoris.
                </p>
                <p>
                  L&apos;idée est née du constat qu&apos;il manquait une plateforme communautaire bilingue
                  dédiée aux fans de sport au Québec et au Canada. La tribune des fans comble ce
                  vide en offrant une expérience riche et engageante.
                </p>
              </div>
            ) : (
              <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                <p>
                  Fans Tribune was founded by <strong>Pascal Grenon</strong>, known by the username{' '}
                  <strong>QcFan</strong>. A lifelong passionate sports fan, Pascal created this platform
                  to offer fans a modern and friendly space to discuss their favorite teams and sports.
                </p>
                <p>
                  The idea was born from the observation that there was a lack of a bilingual community
                  platform dedicated to sports fans in Quebec and Canada. Fans Tribune fills this gap
                  by offering a rich and engaging experience.
                </p>
              </div>
            )}
          </section>

          {/* Section 5: Technology */}
          <section className="mb-8">
            <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100 md:text-2xl">
              {isFr ? 'Technologie moderne' : 'Modern Technology'}
            </h2>
            {isFr ? (
              <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                <p>
                  La tribune des fans est construite avec des technologies web modernes de pointe pour
                  offrir une expérience rapide, fiable et agréable. Notre plateforme utilise les
                  dernières avancées en développement web pour garantir des performances optimales
                  sur tous les appareils — ordinateurs, tablettes et téléphones mobiles.
                </p>
                <p>
                  Nous investissons continuellement dans l&apos;amélioration de notre plateforme pour
                  offrir de nouvelles fonctionnalités et une meilleure expérience utilisateur. La
                  sécurité et la confidentialité de nos utilisateurs sont au cœur de nos priorités.
                </p>
              </div>
            ) : (
              <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                <p>
                  Fans Tribune is built with cutting-edge modern web technologies to deliver a fast,
                  reliable, and enjoyable experience. Our platform uses the latest advances in web
                  development to ensure optimal performance across all devices — computers, tablets,
                  and mobile phones.
                </p>
                <p>
                  We continuously invest in improving our platform to offer new features and a better
                  user experience. The security and privacy of our users are at the heart of our
                  priorities.
                </p>
              </div>
            )}
          </section>

          {/* Contact CTA */}
          <section className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-6">
            <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? 'Nous contacter' : 'Contact Us'}
            </h2>
            <p className="text-gray-700 dark:text-gray-300">
              {isFr
                ? 'Vous avez des questions ou des suggestions\u00a0? N\'hésitez pas à nous écrire à '
                : 'Have questions or suggestions? Feel free to reach out at '}
              <a
                href="mailto:info@fanstribune.com"
                className="text-red-600 hover:underline font-medium"
              >
                info@fanstribune.com
              </a>
            </p>
          </section>
        </article>

        {/* Sidebar ad (hidden on mobile) */}
        <aside className="hidden lg:block shrink-0">
          <div className="sticky top-24">
            <AdSlot slotId="about-sidebar" format="rectangle" />
          </div>
        </aside>
      </div>
    </div>
  );
}
