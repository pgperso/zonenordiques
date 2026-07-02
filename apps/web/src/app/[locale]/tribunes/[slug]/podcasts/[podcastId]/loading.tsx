export default function PodcastLoading() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        {/* Cover skeleton */}
        <div className="mx-auto mb-4 h-48 w-48 animate-pulse rounded-2xl bg-gray-200" />
        {/* Title skeleton */}
        <div className="mx-auto mb-2 h-6 w-48 animate-pulse rounded bg-gray-200" />
        {/* Author skeleton */}
        <div className="mx-auto mb-6 h-4 w-32 animate-pulse rounded bg-gray-200" />
        {/* Player skeleton */}
        <div className="mx-auto h-12 w-full max-w-sm animate-pulse rounded-xl bg-gray-200" />
      </div>
    </div>
  );
}
