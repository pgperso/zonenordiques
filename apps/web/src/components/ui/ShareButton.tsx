'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { Share2, Link2, Mail, Check } from 'lucide-react';

interface ShareButtonProps {
  /** Absolute URL to share. */
  url: string;
  /** Title / text that accompanies the link. */
  title: string;
  /** Show a "Partager" text label next to the icon (default: icon only). */
  label?: boolean;
  className?: string;
}

// Brand glyphs — lucide dropped brand icons, so the paths live here.
const FACEBOOK_PATH =
  'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z';
const X_PATH =
  'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const WHATSAPP_PATH =
  'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z';
const LINKEDIN_PATH =
  'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z';
const REDDIT_PATH =
  'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.341.341 0 0 1 .377-.24l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12c-.688 0-1.25.561-1.25 1.25 0 .687.562 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.232.095.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z';

function BrandIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

/**
 * Universal share control. One button → a popover of destinations:
 * the visitor's system share sheet (mobile), the major social networks,
 * email, and copy-link. The popover is fixed-positioned so it is never
 * clipped by an `overflow-hidden` card.
 */
export function ShareButton({ url, title, label = false, className }: ShareButtonProps) {
  const locale = useLocale();
  const isFr = locale === 'fr';
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // navigator.share is client + secure-context only — resolve after mount
  // to avoid an SSR/CSR hydration mismatch.
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const close = useCallback(() => setOpen(false), []);

  // A fixed-positioned popover detaches from its button on scroll/resize —
  // close it rather than let it float away. Also close on outside click/Esc.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  function toggle() {
    if (open) {
      close();
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const MENU_H = 340;
    const above = r.bottom + MENU_H > window.innerHeight && r.top > MENU_H;
    setCoords({
      top: above ? r.top - 6 : r.bottom + 6,
      left: Math.max(r.right, 188),
      above,
    });
    setCopied(false);
    setOpen(true);
  }

  const enc = encodeURIComponent;
  const targets = [
    {
      key: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
      path: FACEBOOK_PATH,
    },
    {
      key: 'x',
      label: 'X',
      href: `https://x.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`,
      path: X_PATH,
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/?text=${enc(`${title} ${url}`)}`,
      path: WHATSAPP_PATH,
    },
    {
      key: 'linkedin',
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
      path: LINKEDIN_PATH,
    },
    {
      key: 'reddit',
      label: 'Reddit',
      href: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(title)}`,
      path: REDDIT_PATH,
    },
  ];

  async function nativeShare() {
    close();
    try {
      await navigator.share({ title, url });
    } catch {
      /* the visitor cancelled the share sheet — nothing to do */
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          // Cards wrap content in a stretched link — never navigate on share.
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={isFr ? 'Partager' : 'Share'}
        className={
          className ??
          'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-gray-800'
        }
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {label && <span className="text-xs font-medium">{isFr ? 'Partager' : 'Share'}</span>}
      </button>

      {open && coords && (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[80] w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-[#272525]"
          style={{
            top: coords.top,
            left: coords.left,
            transform: `translate(-100%, ${coords.above ? '-100%' : '0'})`,
          }}
        >
          {canNativeShare && (
            <button
              type="button"
              role="menuitem"
              onClick={nativeShare}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Share2 className="h-4 w-4 shrink-0 text-brand-blue" aria-hidden="true" />
              {isFr ? 'Plus d’options…' : 'More options…'}
            </button>
          )}

          {targets.map((tgt) => (
            <a
              key={tgt.key}
              role="menuitem"
              href={tgt.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <BrandIcon path={tgt.path} className="h-4 w-4 shrink-0" />
              {tgt.label}
            </a>
          ))}

          <a
            role="menuitem"
            href={`mailto:?subject=${enc(title)}&body=${enc(url)}`}
            onClick={close}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
            {isFr ? 'Courriel' : 'Email'}
          </a>

          <button
            type="button"
            role="menuitem"
            onClick={copyLink}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {copied ? (
              <Check className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
            ) : (
              <Link2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {copied
              ? isFr ? 'Lien copié !' : 'Link copied!'
              : isFr ? 'Copier le lien' : 'Copy link'}
          </button>
        </div>
      )}
    </>
  );
}
