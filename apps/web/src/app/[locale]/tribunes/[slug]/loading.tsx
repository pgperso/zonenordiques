export default function CommunityLoading() {
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main content skeleton */}
      <div className="flex flex-1 flex-col">
        {/* Community header skeleton */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 animate-pulse rounded-full bg-gray-200" />
            <div className="flex-1">
              <div className="mb-2 h-5 w-40 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </div>
        {/* Feed skeleton */}
        <div className="flex-1 space-y-4 overflow-hidden p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
              <div className="flex-1">
                <div className="mb-2 h-3 w-28 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
