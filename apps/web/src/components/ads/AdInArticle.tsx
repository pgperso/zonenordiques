'use client';

import { AdSlot } from './AdSlot';

export function AdInArticle() {
  return (
    <div className="my-8 flex justify-center">
      <AdSlot slotId="article-in-content" format="in-article" className="w-full max-w-xl" />
    </div>
  );
}
