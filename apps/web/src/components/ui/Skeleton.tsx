/**
 * A single pulsing placeholder block. Compose several to mirror the shape
 * of content that is still loading, so the layout does not jump when the
 * real data arrives.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className}`}
      aria-hidden="true"
    />
  );
}
