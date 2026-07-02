'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import imageCompression from 'browser-image-compression';
import { createClient } from '@/lib/supabase/client';
import { setIdentity } from '@/services/poolService';
import { TeamLogo } from '@/components/pool/TeamLogo';

export function TeamIdentityEditor({
  entryId, memberId, initialName, initialLogo,
}: {
  entryId: number;
  memberId: string;
  initialName: string;
  initialLogo: string | null;
}) {
  const t = useTranslations('pool.identity');
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [logo, setLogo] = useState<string | null>(initialLogo);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error(t('notImage')); return; }
    setUploading(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.2, maxWidthOrHeight: 256, useWebWorker: false, fileType: 'image/webp',
      });
      const supabase = createClient();
      // Subfolder keeps it separate from the profile avatar (which lives at the
      // member-id root and gets cleaned up on profile-avatar changes).
      const path = `${memberId}/pool/${Date.now()}.webp`;
      const { error } = await supabase.storage.from('avatars').upload(path, compressed, {
        contentType: 'image/webp', cacheControl: '31536000',
      });
      if (error) { toast.error(t('uploadFailed', { error: error.message })); return; }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setLogo(data.publicUrl);
      toast.success(t('logoUploaded'));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!name.trim()) { toast.error(t('nameRequired')); return; }
    setBusy(true);
    const { error } = await setIdentity(createClient(), entryId, name.trim(), logo);
    setBusy(false);
    if (error) { toast.error(error); return; }
    toast.success(t('identitySaved'));
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <TeamLogo logo={initialLogo} name={initialName} size={28} />
          {initialName}
        </span>
        <button onClick={() => setOpen(true)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-[#252525]">
          {t('editNameLogo')}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('teamName')}</label>
      <input
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-[#252525]"
      />

      <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">{t('logo')}</p>
      <div className="mt-2 flex items-center gap-4">
        {/* Live preview — uploaded image, or the default initial monogram. */}
        <TeamLogo logo={logo} name={name || '?'} size={56} />
        <div className="flex flex-col gap-2">
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-[#252525]"
          >
            {uploading ? t('uploading') : logo ? t('replaceImage') : t('uploadImage')}
          </button>
          {logo && (
            <button
              type="button"
              onClick={() => setLogo(null)}
              className="text-left text-xs font-medium text-red-600 underline hover:text-red-700"
            >
              {t('removeImage')}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button onClick={save} disabled={busy || uploading}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900">
          {busy ? t('saving') : t('saveNameLogo')}
        </button>
        <button onClick={() => setOpen(false)} disabled={busy}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-600">
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}
