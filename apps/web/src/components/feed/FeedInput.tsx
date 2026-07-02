'use client';

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, X, SendHorizontal, Mic } from 'lucide-react';
import Image from 'next/image';
import { CHAT_MAX_MESSAGE_LENGTH, MAX_IMAGES_PER_MESSAGE } from '@arena/shared';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useMentionAutocomplete, type MentionMember } from '@/hooks/useMentionAutocomplete';
import { useVoiceDictation } from '@/hooks/useVoiceDictation';
import { Avatar } from '@/components/ui/Avatar';

interface FeedInputProps {
  onSend: (content: string, imageUrls?: string[]) => Promise<void>;
  disabled: boolean;
  placeholder?: string;
  communityId: number;
  userId: string | null;
  autoFocus?: boolean;
}

export function FeedInput({ onSend, disabled, placeholder, communityId, userId, autoFocus }: FeedInputProps) {
  const t = useTranslations('tribune');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { images, uploading, addImages, removeImage, clearImages, uploadAll } = useImageUpload();

  // Voice dictation: dictationBaseRef holds the textarea content at the
  // moment recognition started, so transcripts append to what the user had
  // already typed instead of overwriting it. The hook itself owns the
  // accumulation of finalized + interim segments, so we only ever join
  // base + the hook's emitted text.
  const dictationBaseRef = useRef('');
  const dictation = useVoiceDictation({
    lang: locale === 'fr' ? 'fr-CA' : 'en-CA',
    onTranscript: ({ text }) => {
      const joined = dictationBaseRef.current
        ? `${dictationBaseRef.current.replace(/\s+$/, '')} ${text}`
        : text;
      const next = joined.length > CHAT_MAX_MESSAGE_LENGTH
        ? joined.slice(0, CHAT_MAX_MESSAGE_LENGTH)
        : joined;
      setContent(next);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
      }
    },
  });
  const toggleDictation = useCallback(() => {
    if (dictation.listening) {
      dictation.stop();
    } else {
      dictationBaseRef.current = content;
      dictation.start();
    }
  }, [dictation, content]);
  useEffect(() => {
    if (!dictation.error) return;
    // Each error code maps to actionable copy so users know whether to
    // retry, change settings, or check their hardware. `os-blocked` is the
    // single most common cause in production: Chrome shows the site as
    // allowed but Windows / macOS privacy settings refuse the capture.
    const key = ({
      'not-allowed': 'dictationDenied',
      'no-device': 'dictationNoDevice',
      'device-busy': 'dictationDeviceBusy',
      'insecure-context': 'dictationInsecure',
      'service-unavailable': 'dictationServiceUnavailable',
      'unsupported': 'dictationError',
      'recognition-failed': 'dictationError',
      'unknown': 'dictationError',
    } as const)[dictation.error] ?? 'dictationError';
    setError(t(key));
  }, [dictation.error, t]);

  // @mention autocomplete. pendingCursorRef carries the caret position to
  // restore after a mention is spliced into the (React-controlled) value.
  const mention = useMentionAutocomplete(communityId);
  const pendingCursorRef = useRef<number | null>(null);

  // Auto-focus when reply mode activates
  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  // Restore the caret after a mention splice changes the value.
  useLayoutEffect(() => {
    if (pendingCursorRef.current != null && textareaRef.current) {
      const pos = pendingCursorRef.current;
      pendingCursorRef.current = null;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos);
    }
  }, [content]);

  const chooseMention = useCallback(
    (member: MentionMember) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const cursor = ta.selectionStart ?? content.length;
      const { text, cursor: newCursor } = mention.apply(member, content, cursor);
      setContent(text);
      pendingCursorRef.current = newCursor;
    },
    [content, mention],
  );

  // Auto-dismiss the error after 4s so it doesn't linger.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if ((!trimmed && images.length === 0) || disabled || uploading) return;

    let imageUrls: string[] = [];
    if (images.length > 0 && userId) {
      imageUrls = await uploadAll(communityId, userId);
    }

    const savedContent = content;
    setContent('');
    mention.reset();
    clearImages();
    // Reset the dictation session so the next utterance starts from a
    // blank slate. Without this the still-running SpeechRecognition would
    // keep emitting cumulative transcripts joined to the (now-cleared)
    // base ref, so the message we just sent would reappear in the textarea.
    if (dictation.listening) dictation.stop();
    dictationBaseRef.current = '';
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    const textarea = textareaRef.current;
    try {
      await onSend(trimmed, imageUrls.length > 0 ? imageUrls : undefined);
      setError(null);
    } catch (err) {
      // Restore what the user typed so they can edit + retry instead of losing it.
      setContent(savedContent);
      const message = err instanceof Error ? err.message : 'Échec de l\u2019envoi';
      setError(message);
    }
    textarea?.focus();
  }, [content, disabled, uploading, images, userId, communityId, onSend, uploadAll, clearImages, dictation]);

  function handleKeyDown(e: React.KeyboardEvent) {
    // While the mention popup is open it owns the arrow / enter / escape keys.
    if (mention.open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mention.move(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); mention.move(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const m = mention.suggestions[mention.activeIndex];
        if (m) { e.preventDefault(); chooseMention(m); return; }
      }
      if (e.key === 'Escape') { e.preventDefault(); mention.reset(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    if (value.length <= CHAT_MAX_MESSAGE_LENGTH) {
      setContent(value);
      mention.detect(value, e.target.selectionStart ?? value.length);
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addImages(e.target.files);
      e.target.value = '';
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      imageFiles.forEach((f) => dt.items.add(f));
      addImages(dt.files);
    }
  }

  const canAddMoreImages = images.length < MAX_IMAGES_PER_MESSAGE;

  return (
    <div className="relative shrink-0 px-4 pb-4 pt-2">
      {/* @mention autocomplete — floats above the input */}
      {mention.open && (
        <div className="absolute bottom-full left-4 right-4 z-20 mb-1 max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-[#272525]">
          {mention.suggestions.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => {
                // Keep textarea focus so the caret splice lands correctly.
                e.preventDefault();
                chooseMention(m);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                i === mention.activeIndex
                  ? 'bg-brand-blue/10'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Avatar url={m.avatarUrl} name={m.username} size="sm" />
              <span className="truncate text-gray-900 dark:text-gray-100">@{m.username}</span>
            </button>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Single unified container */}
      <div className="overflow-hidden rounded-lg bg-gray-100 dark:bg-[#272525]">
        {/* Image previews inside the bar */}
        {images.length > 0 && (
          <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 p-3">
            {images.map((img) => (
              <div key={img.id} className="relative flex-shrink-0">
                <Image
                  src={img.previewUrl}
                  alt={t('preview')}
                  width={80}
                  height={80}
                  className="h-16 w-16 rounded-lg object-cover"
                />
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-xs text-white transition hover:bg-red-600"
                >
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </div>
            ))}
            {/* Add more button inline with previews */}
            {canAddMoreImages && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 transition hover:border-gray-400 hover:text-gray-500 dark:text-gray-400 disabled:opacity-50"
                title={t('addMoreImages')}
              >
                <Plus className="h-5 w-5" strokeWidth={2} />
              </button>
            )}
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end">
          {/* + button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || !canAddMoreImages}
            className="flex h-10 w-10 shrink-0 items-center justify-center text-gray-400 transition hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400 disabled:opacity-50"
            title={t('addImages')}
          >
            <Plus className="h-5 w-5" strokeWidth={2} />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => mention.reset()}
            disabled={disabled || uploading}
            placeholder={uploading ? t('uploadingImages') : (placeholder ?? t('writeMessage'))}
            rows={1}
            className="flex-1 resize-none bg-transparent px-1 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none disabled:text-gray-400"
          />

          {/* Mic button — only on browsers that expose Web Speech API */}
          {dictation.supported && (
            <button
              type="button"
              onClick={toggleDictation}
              disabled={disabled || uploading}
              className={`flex h-10 w-10 shrink-0 items-center justify-center transition disabled:opacity-50 ${
                dictation.listening
                  ? 'text-red-500 animate-pulse'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              title={dictation.listening ? t('stopDictation') : t('startDictation')}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? t('stopDictation') : t('startDictation')}
            >
              <Mic className="h-5 w-5" strokeWidth={2} />
            </button>
          )}

          {/* Send button — visible on all viewports so users dictating with
              the mic don't have to reach for the keyboard to press Enter. */}
          <button
            onClick={handleSend}
            disabled={disabled || uploading || (!content.trim() && images.length === 0)}
            className="flex h-10 w-10 shrink-0 items-center justify-center text-brand-blue transition hover:text-brand-blue-dark disabled:text-gray-300"
            title={tc('send')}
            aria-label={tc('send')}
          >
            {uploading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
            ) : (
              <SendHorizontal className="h-5 w-5" strokeWidth={2} />
            )}
          </button>

          {/* Upload spinner */}
          {uploading && (
            <div className="flex items-center px-3 py-2.5">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
            </div>
          )}
        </div>
      </div>

      {/* Error message (auto-dismisses after 4s) */}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Character counter */}
      {content.length > CHAT_MAX_MESSAGE_LENGTH * 0.8 && (
        <p className="mt-1 text-right text-xs text-gray-400">
          {content.length}/{CHAT_MAX_MESSAGE_LENGTH}
        </p>
      )}
    </div>
  );
}
