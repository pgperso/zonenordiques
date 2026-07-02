import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { formatTime, ORIGINAL_CONTENT_CUTOFF, displayCommunityName } from '@arena/shared';
import { BRAND } from '@/lib/brand';
import { translatedField } from '@/lib/contentTranslation';
import { findContentAuthorBySlug, type ContentAuthor } from '@/lib/contentAuthors';

export const revalidate = 300;

interface AuthorPageProps {
  params: Promise<{ locale: string; username: string }>;
}

type MemberRow = {
  id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  description: string | null;
  avatar_url: string | null;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
};

type AuthorArticle = {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  source_lang: string | null;
  title_translated: string | null;
  excerpt_translated: string | null;
  cover_image_url: string | null;
  cover_position_y: number | null;
  view_count: number;
  like_count: number;
  published_at: string | null;
  author_name_override: string | null;
  communities: { name: string; name_en: string | null; slug: string };
};

function displayName(member: MemberRow): string {
  if (member.creator_display_name) return member.creator_display_name;
  if (member.first_name && member.last_name) return `${member.first_name} ${member.last_name}`;
  return member.username;
}

function displayAvatar(member: MemberRow): string | null {
  return member.creator_avatar_url ?? member.avatar_url ?? null;
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { locale, username } = await params;
  const supabase = await createClient();
  const isFr = locale === 'fr';

  const { data } = await supabase
    .from('members')
    .select('username, first_name, last_name, description, creator_display_name')
    .eq('username', username)
    .single();

  const persona = data ? null : findContentAuthorBySlug(username);

  if (!data && !persona) {
    return { title: 'Auteur introuvable', robots: { index: false, follow: false } };
  }

  const name = data ? displayName(data as unknown as MemberRow) : persona!.name;
  const description = data
    ? ((data as unknown as MemberRow).description
      ?? (isFr
        ? `Articles et chroniques sportives de ${name} sur ${BRAND.name}.`
        : `Sports articles and columns by ${name} on ${BRAND.nameEn}.`))
    : (isFr ? persona!.bioFr : persona!.bioEn);
  const title = isFr
    ? `${name} | ${BRAND.name}`
    : `${name} | ${BRAND.nameEn}`;
  const url = `${BRAND.url}/${locale}/auteurs/${username}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      url,
      siteName: BRAND.name,
      locale: isFr ? 'fr_CA' : 'en_CA',
      images: [{ url: BRAND.logoUrl, alt: name, width: BRAND.logoWidth, height: BRAND.logoHeight }],
    },
    twitter: { card: 'summary', title, description },
    alternates: {
      canonical: url,
      languages: {
        'fr-CA': `${BRAND.url}/fr/auteurs/${username}`,
        'en-CA': `${BRAND.url}/en/auteurs/${username}`,
        'x-default': `${BRAND.url}/fr/auteurs/${username}`,
      },
    },
    robots: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
    },
  };
}

export default async function AuthorPage({ params }: AuthorPageProps) {
  const { locale, username } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();

  const { data: memberData } = await supabase
    .from('members')
    .select('id, username, first_name, last_name, description, avatar_url, creator_display_name, creator_avatar_url')
    .eq('username', username)
    .single();

  const member = memberData as unknown as MemberRow | null;
  const persona = member ? null : findContentAuthorBySlug(username);

  if (!member && !persona) notFound();

  // Members are queried by author_id; personas are queried by the byline
  // string in author_name_override since they have no row in `members`.
  const articlesQuery = supabase
    .from('articles')
    .select(
      'id, slug, title, excerpt, source_lang, title_translated, excerpt_translated, cover_image_url, cover_position_y, view_count, like_count, published_at, author_name_override, communities!inner(name, name_en, slug)',
    )
    .eq('is_published', true)
    .eq('is_removed', false)
    .gte('published_at', ORIGINAL_CONTENT_CUTOFF)
    .order('published_at', { ascending: false })
    .limit(50);

  const { data: articlesData } = member
    ? await articlesQuery.eq('author_id', member.id)
    : await articlesQuery.eq('author_name_override', persona!.name);

  const articles = (articlesData ?? []) as unknown as AuthorArticle[];

  const totalViews = articles.reduce((sum, a) => sum + (a.view_count || 0), 0);
  const totalLikes = articles.reduce((sum, a) => sum + (a.like_count || 0), 0);

  const isFr = locale === 'fr';
  const name = member ? displayName(member) : persona!.name;
  const avatar = member ? displayAvatar(member) : null;
  const bio = member ? member.description : (isFr ? persona!.bioFr : persona!.bioEn);
  const personaForAvatar: ContentAuthor | null = persona;

  const profileJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name,
      url: `${BRAND.url}/${locale}/auteurs/${username}`,
      image: avatar ?? BRAND.logoUrl,
      description: bio ?? undefined,
    },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isFr ? 'Accueil' : 'Home', item: `${BRAND.url}/${locale}` },
      { '@type': 'ListItem', position: 2, name: isFr ? 'Auteurs' : 'Authors', item: `${BRAND.url}/${locale}/auteurs` },
      { '@type': 'ListItem', position: 3, name },
    ],
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-white dark:bg-[#1e1e1e]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([profileJsonLd, breadcrumbJsonLd]).replace(/</g, '\\u003c') }}
      />

      <div className="mx-auto w-full max-w-5xl px-4 py-8 md:py-12">
        {/* Header */}
        <header className="mb-8 flex flex-col items-center gap-4 border-b border-gray-200 dark:border-gray-700 pb-8 text-center md:flex-row md:items-start md:text-left">
          {avatar ? (
            <Image
              src={avatar}
              alt={name}
              width={96}
              height={96}
              className="h-24 w-24 shrink-0 rounded-full object-cover"
              priority
            />
          ) : personaForAvatar ? (
            <div
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white"
              style={{ backgroundColor: personaForAvatar.color }}
            >
              {personaForAvatar.initials}
            </div>
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gray-200 text-3xl font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">{name}</h1>
            {bio && (
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400 md:text-base">
                {bio}
              </p>
            )}
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 md:justify-start">
              <span>
                {isFr ? 'Articles' : 'Articles'} : <strong className="text-gray-900 dark:text-gray-100">{articles.length}</strong>
              </span>
              {totalViews > 0 && (
                <span>
                  {isFr ? 'Vues totales' : 'Total views'} : <strong className="text-gray-900 dark:text-gray-100">{totalViews.toLocaleString(isFr ? 'fr-CA' : 'en-CA')}</strong>
                </span>
              )}
              {totalLikes > 0 && (
                <span>
                  {isFr ? 'Mentions J\'aime' : 'Likes'} : <strong className="text-gray-900 dark:text-gray-100">{totalLikes.toLocaleString(isFr ? 'fr-CA' : 'en-CA')}</strong>
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Articles list */}
        <section>
          <h2 className="mb-5 text-lg font-bold text-gray-900 dark:text-gray-100">
            {isFr ? 'Articles publiés' : 'Published articles'}
          </h2>

          {articles.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {isFr ? 'Aucun article publié pour le moment.' : 'No published articles yet.'}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((a) => {
                const communityName = displayCommunityName(
                  { name: a.communities.name, name_en: a.communities.name_en },
                  locale,
                );
                const title = translatedField(a.source_lang, locale, a.title, a.title_translated);
                const excerpt = translatedField(a.source_lang, locale, a.excerpt, a.excerpt_translated);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/tribunes/${a.communities.slug}/articles/${a.slug}`}
                      className="group flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-lg dark:border-gray-700 dark:bg-[#1e1e1e]"
                    >
                      <div className="relative aspect-video w-full overflow-hidden">
                        {a.cover_image_url ? (
                          <Image
                            src={a.cover_image_url}
                            alt={title}
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                            style={{ objectPosition: `center ${a.cover_position_y ?? 50}%` }}
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
                        ) : (
                          <div className="h-full w-full bg-gray-200 dark:bg-gray-700" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                          {communityName}
                        </p>
                        <h3 className="line-clamp-2 text-sm font-semibold text-gray-900 group-hover:text-brand-blue dark:text-gray-100">
                          {title}
                        </h3>
                        {excerpt && (
                          <p className="mt-2 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                            {excerpt}
                          </p>
                        )}
                        <div className="mt-auto pt-3 text-[11px] text-gray-400">
                          {formatTime(a.published_at ?? new Date().toISOString())}
                          {a.view_count > 0 && (
                            <> · {a.view_count.toLocaleString(isFr ? 'fr-CA' : 'en-CA')} {isFr ? 'vues' : 'views'}</>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
