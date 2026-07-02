'use client';

export function FeedSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex animate-pulse gap-3">
          <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="h-4 w-12 rounded bg-gray-100 dark:bg-[#1e1e1e]" />
            </div>
            <div className="h-4 w-3/4 rounded bg-gray-100 dark:bg-[#1e1e1e]" />
            {i % 3 === 0 && <div className="h-32 w-full rounded-xl bg-gray-100 dark:bg-[#1e1e1e]" />}
            <div className="flex gap-4">
              <div className="h-4 w-10 rounded bg-gray-100 dark:bg-[#1e1e1e]" />
              <div className="h-4 w-10 rounded bg-gray-100 dark:bg-[#1e1e1e]" />
              <div className="h-4 w-10 rounded bg-gray-100 dark:bg-[#1e1e1e]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
