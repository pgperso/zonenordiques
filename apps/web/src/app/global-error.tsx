'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('Global error:', error);

  return (
    <html lang="fr">
      <body className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md px-6 text-center">
          <div className="mb-6 text-6xl">⚠️</div>
          <h1 className="mb-2 text-xl font-semibold text-gray-900">
            Une erreur inattendue est survenue
          </h1>
          <p className="mb-6 text-sm text-gray-500">
            Nous sommes désolés pour la gêne occasionnée. Veuillez réessayer.
          </p>
          <button
            onClick={() => reset()}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
