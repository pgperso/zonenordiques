import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import { BRAND } from '@/lib/brand';

interface CommunityCardProps {
  name: string;
  slug: string;
  description: string | null;
  memberCount: number;
  logoUrl: string | null;
}

export function CommunityCard({
  name,
  slug,
  description,
  memberCount,
  logoUrl,
}: CommunityCardProps) {
  return (
    <Link
      href={`/tribunes/${slug}`}
      className="group rounded-xl border border-gray-200 dark:border-gray-700 p-4 transition hover:border-gray-300 dark:border-gray-600 hover:shadow-md sm:p-5"
    >
      <div className="mb-2 flex items-center gap-2.5 sm:mb-3 sm:gap-3">
        <Image src={logoUrl || BRAND.logo} alt={name} width={48} height={48} className="h-10 w-10 shrink-0 object-contain sm:h-12 sm:w-12" />
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-brand-blue sm:text-base">
            {name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
            {memberCount} membre{memberCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      {description && (
        <p className="line-clamp-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">{description}</p>
      )}
    </Link>
  );
}
