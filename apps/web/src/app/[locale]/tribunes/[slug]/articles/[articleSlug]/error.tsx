'use client';

export default function ArticleError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center bg-white dark:bg-[#1e1e1e] px-4">
      <h2 className="mb-2 text-lg font-bold text-gray-900 dark:text-gray-100">Article indisponible</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Une erreur est survenue lors du chargement de cet article.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-blue-dark"
      >
        Réessayer
      </button>
    </div>
  );
}
