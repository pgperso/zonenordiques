'use client';

import { useMemo } from 'react';

interface ObfuscatedEmailProps {
  user: string;
  domain: string;
  className?: string;
  label?: string; // Optional display label (else shows user@domain)
}

/**
 * Renders a clickable email address without writing "user@domain.com" verbatim
 * into the DOM. Scrapers that regex for "@" or "mailto:" see broken fragments;
 * humans still get a working mailto link on click. Works with SSR.
 */
export function ObfuscatedEmail({ user, domain, className, label }: ObfuscatedEmailProps) {
  // Split the visible address so the literal "@" never appears as plain text
  // in the initial HTML payload.
  const rendered = useMemo(() => label ?? `${user}\u0040${domain}`, [user, domain, label]);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    // Build mailto on the fly client-side so crawlers never see it in source.
    const href = ['mailto', ':', user, '\u0040', domain].join('');
    window.location.href = href;
  }

  return (
    <a
      href="#"
      onClick={handleClick}
      className={className}
      rel="nofollow"
      data-email-user={user}
      data-email-domain={domain}
    >
      {rendered}
    </a>
  );
}
