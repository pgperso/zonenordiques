import type { PresenceStatus } from '@/hooks/usePresence';

interface StatusDotProps {
  status: PresenceStatus;
  size?: 'sm' | 'md';
}

export function StatusDot({ status, size = 'sm' }: StatusDotProps) {
  const dotSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  const position = size === 'sm' ? 'bottom-0 right-0' : '-bottom-px -right-px';
  const color = status === 'online' ? 'bg-green-500' : 'bg-yellow-400';

  return (
    <div className={`absolute ${position} rounded-full border-2 border-white dark:border-[#1e1e1e] ${dotSize} ${color}`} />
  );
}
