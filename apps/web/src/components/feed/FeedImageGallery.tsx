'use client';

import { memo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

interface FeedImageGalleryProps {
  imageUrls: string[];
}

export const FeedImageGallery = memo(function FeedImageGallery({ imageUrls }: FeedImageGalleryProps) {
  const t = useTranslations('tribune');
  const tc = useTranslations('common');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const count = imageUrls.length;

  if (count === 0) return null;

  return (
    <>
      <div className="mt-2 max-w-[420px]">
        {count === 1 && (
          <button
            onClick={() => setLightboxIndex(0)}
            className="block w-full overflow-hidden rounded-xl"
            aria-label={t('viewImageFullscreen')}
          >
            <Image
              src={imageUrls[0]}
              alt="Image 1"
              width={420}
              height={280}
              className="w-full rounded-xl object-cover"
              style={{ maxHeight: '300px' }}
              sizes="(max-width: 768px) 100vw, 420px"
            />
          </button>
        )}
        {count === 2 && (
          <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl">
            {imageUrls.map((url, i) => (
              <button
                key={url}
                onClick={() => setLightboxIndex(i)}
                className="block overflow-hidden"
                aria-label={t('viewImageNFullscreen', { n: i + 1 })}
              >
                <Image
                  src={url}
                  alt={`Image ${i + 1}`}
                  width={210}
                  height={210}
                  className="h-[200px] w-full object-cover"
                  sizes="210px"
                />
              </button>
            ))}
          </div>
        )}
        {count >= 3 && (
          <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl" style={{ height: '260px' }}>
            {imageUrls.slice(0, 4).map((url, i) => (
              <button
                key={url}
                onClick={() => setLightboxIndex(i)}
                className={`block overflow-hidden ${i === 0 && count === 3 ? 'row-span-2' : ''}`}
                aria-label={t('viewImageNFullscreen', { n: i + 1 })}
              >
                <Image
                  src={url}
                  alt={`Image ${i + 1}`}
                  width={210}
                  height={i === 0 && count === 3 ? 260 : 130}
                  className="h-full w-full object-cover"
                  sizes="210px"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <LightboxKeyHandler
        isOpen={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
        onPrev={() => setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev))}
        onNext={() => setLightboxIndex((prev) => (prev !== null && prev < imageUrls.length - 1 ? prev + 1 : prev))}
      />
      {lightboxIndex !== null && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-label={t('imageViewer')}
        >
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute right-4 top-4 text-2xl text-white hover:text-gray-300"
            aria-label={tc('close')}
          >
            &times;
          </button>
          {lightboxIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
              className="absolute left-4 text-3xl text-white hover:text-gray-300"
              aria-label={t('previousImage')}
            >
              &lsaquo;
            </button>
          )}
          {lightboxIndex < imageUrls.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
              className="absolute right-4 text-3xl text-white hover:text-gray-300"
              aria-label={t('nextImage')}
            >
              &rsaquo;
            </button>
          )}
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={imageUrls[lightboxIndex]}
              alt={`Image ${lightboxIndex + 1}`}
              width={1920}
              height={1080}
              className="max-h-[90vh] w-auto object-contain"
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
});

function LightboxKeyHandler({
  isOpen,
  onClose,
  onPrev,
  onNext,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, onPrev, onNext]);

  return null;
}
