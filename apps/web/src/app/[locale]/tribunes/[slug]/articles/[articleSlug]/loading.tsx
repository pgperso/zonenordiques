export default function ArticleLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#1e1e1e]">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Cover skeleton */}
        <div className="mb-6 h-64 animate-pulse rounded-xl bg-gray-200" />
        {/* Title skeleton */}
        <div className="mb-4 h-8 w-3/4 animate-pulse rounded bg-gray-200" />
        {/* Author skeleton */}
        <div className="mb-6 flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        </div>
        {/* Body skeleton */}
        <div className="space-y-3">
          <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-4/6 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
