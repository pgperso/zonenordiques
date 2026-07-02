import Image from 'next/image';

const SIZE_MAP = {
  xs: { container: 'h-5 w-5', text: 'text-[10px]', px: 20 },
  sm: { container: 'h-7 w-7', text: 'text-xs', px: 28 },
  md: { container: 'h-8 w-8', text: 'text-xs', px: 32 },
  lg: { container: 'h-10 w-10', text: 'text-sm', px: 40 },
  xl: { container: 'h-12 w-12', text: 'text-lg', px: 48 },
} as const;

interface AvatarProps {
  url: string | null | undefined;
  name: string;
  size?: keyof typeof SIZE_MAP;
  className?: string;
  color?: string;
}

export function Avatar({ url, name, size = 'md', className = '', color }: AvatarProps) {
  const s = SIZE_MAP[size];
  const initial = name[0]?.toUpperCase() ?? '?';

  if (url) {
    return (
      <Image
        src={url}
        alt={name}
        width={s.px}
        height={s.px}
        className={`${s.container} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex ${s.container} items-center justify-center rounded-full ${s.text} font-bold text-white ${!color ? 'bg-brand-blue' : ''} ${className}`}
      style={color ? { backgroundColor: color } : undefined}
    >
      {initial}
    </div>
  );
}
