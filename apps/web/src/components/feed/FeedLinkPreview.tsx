'use client';

import { useState } from 'react';
import type { LinkPreview } from '@arena/shared';

interface FeedLinkPreviewProps {
  previews: LinkPreview[];
}

export function FeedLinkPreview({ previews }: FeedLinkPreviewProps) {
  if (!previews || previews.length === 0) return null;

  return (
    <div className="mt-2 flex max-w-md flex-col gap-2">
      {previews.map((preview, idx) => (
        <PreviewCard key={idx} preview={preview} />
      ))}
    </div>
  );
}

function isXTwitter(domain: string): boolean {
  return domain === 'x.com' || domain === 'twitter.com';
}

function isYouTube(domain: string): boolean {
  return domain === 'youtube.com' || domain === 'youtu.be';
}

function extractXHandle(url: string): string | null {
  const match = url.match(/(?:x\.com|twitter\.com)\/(@?[\w]+)/i);
  if (match && !['home', 'search', 'explore', 'settings', 'i'].includes(match[1].toLowerCase())) {
    return '@' + match[1].replace(/^@/, '');
  }
  return null;
}

function PreviewCard({ preview }: { preview: LinkPreview }) {
  const [imgError, setImgError] = useState(false);
  const isX = isXTwitter(preview.domain);
  const isYT = isYouTube(preview.domain);
  const xHandle = isX ? extractXHandle(preview.url) : null;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#272525] transition hover:border-gray-300 dark:hover:border-gray-600"
    >
      {/* X/Twitter: branded header with author */}
      {isX && (
        <div className="flex items-center gap-2 bg-black px-3 py-2">
          <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          {xHandle && (
            <span className="text-sm font-semibold text-white">{xHandle}</span>
          )}
        </div>
      )}

      {/* YouTube: red header with logo */}
      {isYT && (
        <div className="flex items-center gap-2 bg-red-600 px-3 py-2">
          <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          <span className="text-sm font-semibold text-white">YouTube</span>
        </div>
      )}

      {/* Image (non-X, non-YT header links) */}
      {!isX && preview.image && !imgError && (
        <div className="relative overflow-hidden bg-gray-100 dark:bg-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.image}
            alt={preview.title || ''}
            className="h-36 w-full object-cover transition group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
          {/* YouTube play button overlay */}
          {isYT && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600/90 shadow-lg transition group-hover:scale-110">
                <svg className="ml-1 h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-3">
        {!isX && (
          <p className="mb-0.5 text-[11px] font-medium text-gray-400 dark:text-gray-500">
            {preview.domain}
          </p>
        )}
        {preview.title && !isX && (
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 group-hover:text-brand-blue">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className={isX ? 'text-base leading-relaxed text-gray-800 dark:text-gray-200 line-clamp-4' : 'mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2'}>
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
}
