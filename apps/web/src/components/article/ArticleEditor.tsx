'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useSupabase } from '@/hooks/useSupabase';
import { useCoverUpload } from '@/hooks/useCoverUpload';
import { createArticle, updateArticle } from '@/services/articleService';
import { revalidateAfterArticleChange } from '@/app/actions/revalidate';
import { slugify } from '@/lib/slugify';
import { CONTENT_AUTHORS as AUTHORS, getContentAuthor, isContentAuthor } from '@/lib/contentAuthors';
import { countWords, MIN_QUALITY_WORD_COUNT } from '@arena/shared';

// Word count thresholds tied to Google's perceived content quality.
// Articles below MIN_QUALITY_WORD_COUNT typically end up "Crawled,
// currently not indexed" and hurt the site's overall quality ratio for
// AdSense — see ORIGINAL_CONTENT_CUTOFF / isIndexableArticle in shared.
function wordCountLevel(count: number): { label: string; tone: 'danger' | 'warn' | 'ok' | 'good' | 'great' } {
  if (count === 0) return { label: 'Vide', tone: 'danger' };
  if (count < 300) return { label: 'Trop court — sera ignoré par Google', tone: 'danger' };
  if (count < MIN_QUALITY_WORD_COUNT) return { label: 'Court — risque de non-indexation par Google', tone: 'warn' };
  if (count < 800) return { label: 'Acceptable', tone: 'ok' };
  if (count < 1500) return { label: 'Bon — bien indexable', tone: 'good' };
  return { label: 'Excellent', tone: 'great' };
}

const WORD_COUNT_TONE_CLASSES: Record<'danger' | 'warn' | 'ok' | 'good' | 'great', string> = {
  danger: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
  warn: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
  ok: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  good: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300',
  great: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
};

const AUTHOR_OPTIONS = [
  { name: 'Mon profil', initials: '✓', color: '#0B4870', style: '' },
  ...AUTHORS,
];

interface ExistingArticle {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  cover_image_url: string | null;
  cover_position_y?: number | null;
  is_published: boolean;
  author_name_override?: string | null;
}

interface ArticleEditorProps {
  communityId: number;
  communitySlug: string;
  userId: string;
  existingArticle?: ExistingArticle;
  onPublished: (slug: string, communitySlug: string) => void;
  onCancel: () => void;
}

export function ArticleEditor({
  communityId,
  communitySlug,
  userId,
  existingArticle,
  onPublished,
  onCancel,
}: ArticleEditorProps) {
  const isEditMode = !!existingArticle;
  const [title, setTitle] = useState(existingArticle?.title ?? '');
  const [customSlug, setCustomSlug] = useState(existingArticle?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(isEditMode);
  const [selectedCommunityId, setSelectedCommunityId] = useState(communityId);
  const [selectedCommunitySlug, setSelectedCommunitySlug] = useState(communitySlug);
  const [communities, setCommunities] = useState<{ id: number; name: string; slug: string }[]>([]);
  const [excerpt, setExcerpt] = useState(existingArticle?.excerpt ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorNameOverride, setAuthorNameOverride] = useState(existingArticle?.author_name_override ?? '');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiDirectives, setAiDirectives] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiTopics, setAiTopics] = useState<{ title: string; description: string; topic: string }[]>([]);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiRefinePrompt, setAiRefinePrompt] = useState('');
  const [aiRefining, setAiRefining] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const supabase = useSupabase();

  // AI assistance is only available when publishing as one of our fictional
  // personas (Rex, DJ, Maika, Roxane). Any article published under the user's
  // own profile is treated as 100% human-written and cannot use AI — this
  // keeps is_ai_generated honest and prevents accidental mislabelling.
  const isPersonaAuthor = isContentAuthor(authorNameOverride);

  // If the user switches back to "Mon profil" while the AI panel is open,
  // force-close it and clear any pending AI state to avoid confusion.
  useEffect(() => {
    if (!isPersonaAuthor) {
      setShowAiPanel(false);
      setAiTopic('');
      setAiTopics([]);
      setAiGenerated(false);
    }
  }, [isPersonaAuthor]);
  const { coverPreview, coverPositionY, setCoverPositionY, handleCoverChange: onCoverChange, removeCover, uploadCover } = useCoverUpload(
    supabase, selectedCommunityId, existingArticle?.cover_image_url ?? null, '', existingArticle?.cover_position_y ?? 50,
  );
  const [isDraggingCover, setIsDraggingCover] = useState(false);
  const coverContainerRef = useRef<HTMLDivElement>(null);

  // Load the list of tribunes the user is allowed to publish into. The
  // previous implementation queried `community_members` (just "I follow
  // this tribune"), which left out major leagues the user hadn't joined
  // even when they otherwise had publication rights everywhere. The
  // correct source of truth is `community_member_roles`: a member with
  // the global `owner` role can publish to every active tribune, and
  // anyone else can publish to the tribunes where they hold owner /
  // admin / moderator / creator.
  useEffect(() => {
    let cancelled = false;

    const loadPublishableCommunities = async () => {
      const { data: ownerCheck } = await supabase
        .from('community_member_roles')
        .select('id, roles!inner(code)')
        .eq('member_id', userId)
        .eq('roles.code', 'owner')
        .limit(1);

      const isGlobalOwner = ((ownerCheck as unknown[] | null)?.length ?? 0) > 0;

      if (isGlobalOwner) {
        const { data } = await supabase
          .from('communities')
          .select('id, name, slug')
          .eq('is_active', true)
          .order('name');
        if (!cancelled && data) {
          setCommunities(data as unknown as { id: number; name: string; slug: string }[]);
        }
        return;
      }

      const { data: roleRows } = await supabase
        .from('community_member_roles')
        .select('community_id, roles!inner(code), communities!inner(id, name, slug, is_active)')
        .eq('member_id', userId)
        .in('roles.code', ['owner', 'admin', 'moderator', 'creator']);

      if (!cancelled && roleRows) {
        const seen = new Set<number>();
        const comms: { id: number; name: string; slug: string }[] = [];
        for (const row of roleRows as unknown as { communities: { id: number; name: string; slug: string; is_active: boolean } | null }[]) {
          const c = row.communities;
          if (!c || !c.is_active || seen.has(c.id)) continue;
          seen.add(c.id);
          comms.push({ id: c.id, name: c.name, slug: c.slug });
        }
        comms.sort((a, b) => a.name.localeCompare(b.name));
        setCommunities(comms);
      }
    };

    void loadPublishableCommunities();
    return () => { cancelled = true; };
  }, [supabase, userId, isEditMode]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
        validate: (href: string) => /^https?:\/\//.test(href),
      }),
      ImageExtension,
      Placeholder.configure({ placeholder: 'Écrivez votre article ici...' }),
    ],
    content: existingArticle?.body ?? '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[300px] px-4 py-3 focus:outline-none text-gray-900 dark:text-gray-100 prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-800 dark:prose-p:text-gray-200 prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-a:text-brand-blue',
      },
    },
  });

  const [wordCount, setWordCount] = useState(() => countWords(existingArticle?.body));
  useEffect(() => {
    if (!editor) return;
    const update = () => setWordCount(countWords(editor.getHTML()));
    update();
    editor.on('update', update);
    return () => { editor.off('update', update); };
  }, [editor]);

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const err = onCoverChange(e);
    if (err) setError(err);
  }

  async function handleSuggestTopics() {
    setAiSuggesting(true);
    setError(null);
    setAiTopics([]);
    try {
      const communityName = communities.find((c) => c.id === selectedCommunityId)?.name ?? communitySlug;
      const res = await fetch('/api/articles/suggest-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityName, directives: aiDirectives.trim() || undefined, isTaverne: selectedCommunitySlug === 'la-taverne' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de la recherche de sujets');
        return;
      }
      setAiTopics(data.topics ?? []);
    } catch {
      setError('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setAiSuggesting(false);
    }
  }

  function handleCancelAi() {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setAiGenerating(false);
    setAiSuggesting(false);
  }

  async function handleSelectTopicAndGenerate(selectedTopic: string, editBeforeGenerate = false) {
    if (aiGenerating) return; // Prevent double-click
    setAiTopic(selectedTopic);
    if (editBeforeGenerate) {
      // Let user edit the topic before generating
      setAiTopics([]);
      return;
    }
    setAiTopics([]);
    setAiGenerating(true);
    setError(null);

    const controller = new AbortController();
    aiAbortRef.current = controller;

    try {
      const communityName = communities.find((c) => c.id === selectedCommunityId)?.name ?? communitySlug;
      const authorData = authorNameOverride ? getContentAuthor(authorNameOverride) : null;
      const res = await fetch('/api/articles/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          topic: selectedTopic.slice(0, 200),
          communityName,
          authorStyle: authorData?.style || undefined,
          authorName: authorData?.name || undefined,
          directives: aiDirectives.trim().slice(0, 1000) || undefined,
          isTaverne: selectedCommunitySlug === 'la-taverne',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) setError('Limite atteinte (10/heure). Réessayez plus tard.');
        else if (res.status === 503) setError('Service indisponible. Réessayez.');
        else if (res.status === 404) setError('Aucune nouvelle trouvée pour ce sujet.');
        else setError(data.error ?? 'Erreur lors de la génération');
        return;
      }
      if (data.title) {
        setTitle(data.title);
        if (!slugTouched) setCustomSlug(slugify(data.title).slice(0, 60));
      }
      if (data.excerpt) setExcerpt(data.excerpt);
      if (data.body && editor) editor.commands.setContent(data.body);
      setAiGenerated(true);
      setAiRefinePrompt('');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // User cancelled
      setError('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setAiGenerating(false);
      aiAbortRef.current = null;
    }
  }

  async function handleAiGenerate() {
    if (!aiTopic.trim()) return;
    setAiGenerating(true);
    setError(null);
    try {
      const communityName = communities.find((c) => c.id === selectedCommunityId)?.name ?? communitySlug;
      const authorData = authorNameOverride ? getContentAuthor(authorNameOverride) : null;
      const res = await fetch('/api/articles/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: aiTopic.trim().slice(0, 200),
          communityName,
          authorStyle: authorData?.style || undefined,
          authorName: authorData?.name || undefined,
          directives: aiDirectives.trim().slice(0, 1000) || undefined,
          isTaverne: selectedCommunitySlug === 'la-taverne',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setError('Limite atteinte (10/heure). Réessayez plus tard.');
        } else if (res.status === 503) {
          setError('Service de nouvelles indisponible. Réessayez.');
        } else {
          setError(data.error ?? 'Erreur lors de la génération');
        }
        return;
      }
      // Pre-fill editor with sanitized content
      if (data.title) {
        setTitle(data.title);
        if (!slugTouched) setCustomSlug(slugify(data.title).slice(0, 60));
      }
      if (data.excerpt) setExcerpt(data.excerpt);
      if (data.body && editor) {
        // TipTap sanitizes HTML on setContent — safe to pass directly
        editor.commands.setContent(data.body);
      }
      setAiGenerated(true);
      setAiRefinePrompt('');
    } catch (err) {
      if (err instanceof TypeError) {
        setError('Erreur réseau. Vérifiez votre connexion.');
      } else {
        setError('Erreur serveur. Réessayez plus tard.');
      }
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleAiRefine() {
    if (!aiRefinePrompt.trim() || !editor) return;
    const currentBody = editor.getHTML();
    if (!currentBody || currentBody === '<p></p>') {
      setError('L\'article est vide. Générez d\'abord un article.');
      return;
    }
    setAiRefining(true);
    setError(null);
    try {
      const res = await fetch('/api/articles/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          excerpt,
          body: currentBody,
          instructions: aiRefinePrompt.trim(),
          isTaverne: selectedCommunitySlug === 'la-taverne',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l\'amélioration');
        return;
      }
      if (data.title) {
        setTitle(data.title);
        if (!slugTouched) setCustomSlug(slugify(data.title).slice(0, 60));
      }
      if (data.excerpt) setExcerpt(data.excerpt);
      if (data.body && data.body !== currentBody) {
        editor.commands.setContent(data.body);
      }
      setAiRefinePrompt('');
    } catch (err) {
      console.error('Refine error:', err);
      setError('Erreur réseau. Réessayez.');
    } finally {
      setAiRefining(false);
    }
  }

  const handleSave = useCallback(async (publish: boolean) => {
    if (!title.trim()) {
      setError('Le titre est requis');
      return;
    }
    if (publish && (!editor?.getHTML() || editor.isEmpty)) {
      setError("Le contenu de l'article est requis");
      return;
    }

    setSaving(true);
    setError(null);

    const coverImageUrl = await uploadCover();
    const slug = (customSlug.trim() || slugify(title)).slice(0, 60) || `article-${Date.now()}`;
    const body = editor?.getHTML() ?? '';

    // Rule: an article is AI-generated IF AND ONLY IF it's being published
    // under one of our fictional personas (Rex, DJ, Maika, Roxane). This is
    // enforced here AND matches the UI — the AI panel isn't even shown
    // unless a persona is selected, so there's no way to write manually
    // under a persona either (everything published as a persona is flagged).
    const aiGeneratedForPersist = isPersonaAuthor;

    if (isEditMode) {
      const { error: updateError } = await updateArticle(supabase, existingArticle.id, {
        title: title.trim(),
        slug,
        excerpt: excerpt.trim() || null,
        body,
        coverImageUrl,
        coverPositionY,
        isPublished: publish,
        authorNameOverride: authorNameOverride.trim() || null,
        isAiGenerated: false,
      });

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      const { error: insertError } = await createArticle(supabase, {
        communityId: selectedCommunityId,
        authorId: userId,
        title: title.trim(),
        slug,
        excerpt: excerpt.trim() || null,
        body,
        coverImageUrl,
        coverPositionY,
        isPublished: publish,
        authorNameOverride: authorNameOverride.trim() || null,
        isAiGenerated: false,
      });

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
    }

    // Bust the ISR cache so the new article shows up immediately on the
    // home gallery and the tribune hub instead of waiting up to 5 minutes
    // for natural revalidation. Best-effort: a failure here shouldn't
    // block the publish itself.
    if (publish) {
      try {
        await revalidateAfterArticleChange(selectedCommunitySlug, slug);
      } catch (e) {
        console.warn('[article-publish] revalidate failed', e);
      }
    }

    setSaving(false);
    onPublished(slug, selectedCommunitySlug);
  }, [title, excerpt, editor, uploadCover, communityId, selectedCommunityId, selectedCommunitySlug, customSlug, authorNameOverride, isPersonaAuthor, userId, supabase, onPublished, isEditMode, existingArticle]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {isEditMode ? "Modifier l'article" : 'Nouvel article'}
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Annuler
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Brouillon'}
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={saving}
            className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
          >
            {isEditMode ? 'Mettre à jour' : 'Publier'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Tribune selector */}
      {!isEditMode && communities.length > 1 && (
        <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e1e1e] px-3 py-3">
          <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">1. Publier dans :</p>
          <select
            value={selectedCommunityId}
            onChange={(e) => {
              const id = Number(e.target.value);
              setSelectedCommunityId(id);
              const comm = communities.find((c) => c.id === id);
              if (comm) {
                setSelectedCommunitySlug(comm.slug);
                // Reset to personal profile when switching to La Taverne
                if (comm.slug === 'la-taverne') setAuthorNameOverride('');
              }
            }}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
          >
            {communities.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Step 2: Author selector (hidden for La Taverne — personal profile only) */}
      {selectedCommunitySlug !== 'la-taverne' ? (
        <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e1e1e] px-3 py-3">
          <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">{!isEditMode && communities.length > 1 ? '2.' : '1.'} Publier en tant que :</p>
          <div className="flex flex-wrap gap-2">
            {AUTHOR_OPTIONS.map((author) => (
              <button
                key={author.name}
                type="button"
                onClick={() => setAuthorNameOverride(author.name === 'Mon profil' ? '' : author.name)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  (authorNameOverride === '' && author.name === 'Mon profil') || authorNameOverride === author.name
                    ? 'border-brand-blue bg-brand-blue/5 font-medium text-brand-blue'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:border-gray-600 hover:bg-white dark:bg-[#1e1e1e]'
                }`}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: author.color }}
                >
                  {author.initials}
                </span>
                {author.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-3 py-3">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            🍺 La Taverne — publié sous votre profil personnel. Tous les sujets sont permis!
          </p>
        </div>
      )}

      {/* Step 3: AI Generation — only offered when publishing as a persona. */}
      {!isEditMode && isPersonaAuthor && (
        <div className="mb-4">
          {!showAiPanel ? (
            <button
              onClick={() => setShowAiPanel(true)}
              className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 dark:bg-purple-950 dark:border-purple-800 px-4 py-2.5 text-sm font-medium text-purple-700 dark:text-purple-300 transition hover:bg-purple-100 dark:hover:bg-purple-900"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
              </svg>
              Générer avec l&apos;IA
            </button>
          ) : (
            <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Génération par IA</p>
                <button
                  onClick={() => { setShowAiPanel(false); setAiTopic(''); setAiTopics([]); setAiGenerated(false); }}
                  className="text-xs text-purple-400 hover:text-purple-600"
                >
                  Fermer
                </button>
              </div>

              {/* Directives optionnelles */}
              <textarea
                value={aiDirectives}
                onChange={(e) => setAiDirectives(e.target.value.slice(0, 1000))}
                placeholder={"Directives (optionnel) : collez des liens, décrivez un angle, donnez des consignes...\nEx: « Parle de l'échange de Caufield, ton sarcastique »\nEx: « https://www.rds.ca/article-xyz — fais un article sur ça »"}
                className="mb-3 w-full rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-[#1e1e1e] px-3 py-2 text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 focus:outline-none"
                rows={3}
                maxLength={1000}
                disabled={aiSuggesting || aiGenerating}
              />

              {/* Bouton trouver des sujets */}
              {aiTopics.length === 0 && !aiGenerating && (
                <button
                  onClick={handleSuggestTopics}
                  disabled={aiSuggesting}
                  className="w-full rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-purple-700 disabled:opacity-50"
                >
                  {aiSuggesting ? 'Recherche de sujets...' : 'Trouver des sujets'}
                </button>
              )}

              {/* Liste des sujets suggeres */}
              {aiTopics.length > 0 && !aiGenerating && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-purple-600 dark:text-purple-400">Choisissez un sujet :</p>
                  {aiTopics.map((t, i) => (
                    <div key={i} className="flex gap-1.5">
                      <button
                        onClick={() => handleSelectTopicAndGenerate(t.topic)}
                        className="flex-1 rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-[#1e1e1e] p-3 text-left transition hover:border-purple-400 hover:shadow-sm"
                      >
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t.title}</p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t.description}</p>
                      </button>
                      <button
                        onClick={() => handleSelectTopicAndGenerate(t.topic, true)}
                        title="Modifier avant de générer"
                        className="shrink-0 self-center rounded-lg border border-purple-200 dark:border-purple-700 p-2 text-purple-400 transition hover:bg-purple-100 dark:hover:bg-purple-900 hover:text-purple-600"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleSuggestTopics}
                    disabled={aiSuggesting}
                    className="w-full rounded-lg border border-purple-200 dark:border-purple-700 px-3 py-2 text-xs text-purple-500 transition hover:bg-purple-100 dark:hover:bg-purple-900 disabled:opacity-50"
                  >
                    {aiSuggesting ? 'Recherche...' : 'Chercher d\'autres sujets'}
                  </button>
                </div>
              )}

              {/* Generation en cours */}
              {aiGenerating && (
                <div className="space-y-2 py-4">
                  <div className="flex items-center justify-center gap-2 text-sm text-purple-600 dark:text-purple-400">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Génération en cours...
                  </div>
                  <div className="space-y-1 text-center text-xs text-purple-400">
                    <p>1. Recherchiste : collecte des nouvelles FR + EN</p>
                    <p>2. Rédacteur : écriture dans le style de l'auteur</p>
                    <p>3. Vérificateur : anti-plagiat et faits</p>
                    <p>4. Éditeur : polish final</p>
                  </div>
                  <p className="text-center text-xs text-purple-300">~15-20 secondes</p>
                  <button
                    onClick={handleCancelAi}
                    className="mx-auto block rounded-lg border border-purple-300 dark:border-purple-700 px-4 py-1.5 text-xs text-purple-500 transition hover:bg-purple-100 dark:hover:bg-purple-900"
                  >
                    Annuler
                  </button>
                </div>
              )}

              {/* Refine section — after article is generated */}
              {aiGenerated && !aiGenerating && !aiRefining && aiTopics.length === 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-green-600 dark:text-green-400">Article généré. Donnez des instructions pour l'améliorer :</p>
                  <textarea
                    value={aiRefinePrompt}
                    onChange={(e) => setAiRefinePrompt(e.target.value.slice(0, 1000))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && aiRefinePrompt.trim()) { e.preventDefault(); handleAiRefine(); } }}
                    placeholder={"Ex: « Rends le plus percutant », « Ajoute une section sur... », « Change le titre pour... »"}
                    className="w-full rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-[#1e1e1e] px-3 py-2 text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 focus:outline-none"
                    rows={2}
                    maxLength={1000}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAiRefine}
                      disabled={!aiRefinePrompt.trim()}
                      className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:opacity-50"
                    >
                      Améliorer
                    </button>
                    <button
                      onClick={() => { setAiGenerated(false); setAiTopics([]); setAiTopic(''); }}
                      className="rounded-lg border border-purple-200 dark:border-purple-700 px-4 py-2 text-sm text-purple-500 transition hover:bg-purple-100 dark:hover:bg-purple-900"
                    >
                      Nouveau sujet
                    </button>
                  </div>
                </div>
              )}

              {/* Refining spinner */}
              {aiRefining && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-purple-600 dark:text-purple-400">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Amélioration en cours...
                </div>
              )}

              {/* Champ sujet manuel ou editable */}
              {!aiGenerated && aiTopics.length === 0 && !aiSuggesting && !aiGenerating && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value.slice(0, 200))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !aiGenerating) handleAiGenerate(); }}
                    placeholder="Entrez ou modifiez le sujet..."
                    className="flex-1 rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-[#1e1e1e] px-3 py-2 text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 focus:outline-none"
                    maxLength={200}
                  />
                  <button
                    onClick={handleAiGenerate}
                    disabled={!aiTopic.trim()}
                    className="shrink-0 rounded-lg bg-purple-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-purple-600 disabled:opacity-50"
                  >
                    Générer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cover image with drag-to-reposition */}
      <div className="mb-4">
        {coverPreview ? (
          <div className="relative">
            <div
              ref={coverContainerRef}
              className={`relative h-48 w-full overflow-hidden rounded-xl ${isDraggingCover ? 'cursor-grabbing' : 'cursor-grab'}`}
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingCover(true);
                const startY = e.clientY;
                const startPos = coverPositionY;
                const rect = coverContainerRef.current!.getBoundingClientRect();

                function onMove(ev: MouseEvent) {
                  const delta = ((ev.clientY - startY) / rect.height) * -100;
                  setCoverPositionY(Math.max(0, Math.min(100, startPos + delta)));
                }
                function onUp() {
                  setIsDraggingCover(false);
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
              onTouchStart={(e) => {
                setIsDraggingCover(true);
                const startY = e.touches[0].clientY;
                const startPos = coverPositionY;
                const rect = coverContainerRef.current!.getBoundingClientRect();

                function onMove(ev: TouchEvent) {
                  ev.preventDefault();
                  const delta = ((ev.touches[0].clientY - startY) / rect.height) * -100;
                  setCoverPositionY(Math.max(0, Math.min(100, startPos + delta)));
                }
                function onEnd() {
                  setIsDraggingCover(false);
                  document.removeEventListener('touchmove', onMove);
                  document.removeEventListener('touchend', onEnd);
                }
                document.addEventListener('touchmove', onMove, { passive: false });
                document.addEventListener('touchend', onEnd);
              }}
            >
              <img
                src={coverPreview}
                alt="Couverture"
                className="h-full w-full object-cover select-none pointer-events-none"
                style={{ objectPosition: `center ${coverPositionY}%` }}
                draggable={false}
              />
              {/* Reposition hint */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2">
                <p className="text-center text-xs text-white/80">
                  <svg className="mr-1 inline h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-6L16.5 15m0 0L12 10.5m4.5 4.5V6.5" />
                  </svg>
                  Glissez pour repositionner
                </p>
              </div>
            </div>
            <button
              onClick={removeCover}
              className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <label className="flex h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 transition hover:border-gray-400">
            <div className="text-center text-sm text-gray-400">
              <svg className="mx-auto mb-1 h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
              Ajouter une image de couverture
            </div>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleCoverChange} />
          </label>
        )}
      </div>

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (!slugTouched) setCustomSlug(slugify(e.target.value).slice(0, 60));
        }}
        placeholder="Titre de l'article"
        className="mb-2 w-full border-none text-2xl font-bold text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:ring-0 focus:outline-none"
        maxLength={200}
      />

      {/* Slug */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-400">URL de l&apos;article</label>
          <span className={`text-[10px] ${customSlug.length <= 60 ? 'text-green-500' : 'text-red-500'}`}>
            {customSlug.length}/60
          </span>
        </div>
        <div className="mt-1 flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e1e1e] px-3 py-1.5">
          <span className="shrink-0 text-xs text-gray-400">…/articles/</span>
          <input
            type="text"
            value={customSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setCustomSlug(slugify(e.target.value).slice(0, 60));
            }}
            className="flex-1 border-none bg-transparent text-xs text-gray-700 dark:text-gray-300 focus:ring-0 focus:outline-none"
            placeholder="slug-auto-genere"
            maxLength={60}
          />
        </div>
      </div>

      {/* Excerpt — critical for SEO (meta description) */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-400">Résumé SEO <span className="text-orange-500">— recommandé pour le référencement</span></label>
          <span className={`text-[10px] ${excerpt.length > 0 ? (excerpt.length <= 155 ? 'text-green-500' : 'text-orange-500') : 'text-gray-300'}`}>
            {excerpt.length}/155
          </span>
        </div>
        <input
          type="text"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder="120-155 caractères idéal. Ex: Analyse sans filtre des Canadiens — séries, deadline, gardien..."
          className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue focus:outline-none"
          maxLength={200}
        />
      </div>

      {/* Toolbar */}
      {editor && (
        <div className="flex flex-wrap gap-1 rounded-t-lg border border-b-0 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e1e1e] px-2 py-1.5">
          <ToolbarButton
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Gras"
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italique"
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Titre"
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Sous-titre"
          >
            H3
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Liste"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Citation"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
          </ToolbarButton>
          <span className="mx-1 border-l border-gray-300 dark:border-gray-600" />
          <ToolbarButton
            active={false}
            onClick={() => {
              const url = window.prompt('URL du lien:');
              if (url && /^https?:\/\//.test(url)) editor.chain().focus().setLink({ href: url }).run();
            }}
            title="Lien"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
          </ToolbarButton>
        </div>
      )}

      {/* Editor */}
      <div className="rounded-b-lg border border-gray-200 dark:border-gray-700 [&_.tiptap]:min-h-[300px]">
        <EditorContent editor={editor} />
      </div>

      {/* Word count + quality indicator */}
      {(() => {
        const level = wordCountLevel(wordCount);
        const toneClass = WORD_COUNT_TONE_CLASSES[level.tone];
        const target = MIN_QUALITY_WORD_COUNT;
        const remaining = Math.max(0, target - wordCount);
        return (
          <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${toneClass}`}>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{wordCount} mots</span>
              <span className="opacity-70">·</span>
              <span>{level.label}</span>
            </div>
            {remaining > 0 && (
              <span className="opacity-80">
                Il reste {remaining} mot{remaining > 1 ? 's' : ''} pour atteindre le seuil ({target}+) recommandé pour l&apos;indexation Google.
              </span>
            )}
          </div>
        );
      })()}

      {/* Fixed bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Annuler
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? '...' : 'Brouillon'}
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={saving}
            className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
          >
            {isEditMode ? 'Mettre à jour' : 'Publier'}
          </button>
        </div>
      </div>

      {/* Spacer so content doesn't hide behind fixed bar */}
      <div className="h-16" />

      {/* Publish confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white dark:bg-[#1e1e1e] p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900 dark:text-gray-100">Confirmer la publication</h3>
            <div className="mb-5 space-y-2.5">
              <CheckItem label="Titre" value={title.trim()} ok={!!title.trim()} />
              <CheckItem label="Tribune" value={communities.find((c) => c.id === selectedCommunityId)?.name ?? communitySlug} ok={true} />
              <CheckItem label="Auteur" value={authorNameOverride || 'Mon profil créateur'} ok={true} />
              <CheckItem label="Résumé SEO" value={excerpt.trim() ? `${excerpt.trim().length} caractères` : 'Aucun'} ok={!!excerpt.trim()} warn={!excerpt.trim()} />
              <CheckItem
                label="Longueur"
                value={`${wordCount} mots${wordCount < MIN_QUALITY_WORD_COUNT ? ` — recommandé : ${MIN_QUALITY_WORD_COUNT}+ pour être indexé par Google` : ''}`}
                ok={wordCount >= MIN_QUALITY_WORD_COUNT}
                warn={wordCount < MIN_QUALITY_WORD_COUNT && wordCount > 0}
              />
              <CheckItem label="Slug URL" value={customSlug || slugify(title).slice(0, 60)} ok={!!(customSlug || title)} />
              <CheckItem label="Image de couverture" value={coverPreview ? 'Oui' : 'Aucune'} ok={!!coverPreview} warn={!coverPreview} />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-[#1e1e1e]"
              >
                Modifier
              </button>
              <button
                onClick={() => { setShowConfirm(false); handleSave(true); }}
                disabled={saving || !title.trim()}
                className="flex-1 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
              >
                {saving ? 'Publication...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckItem({ label, value, ok, warn }: { label: string; value: string; ok: boolean; warn?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className={`mt-0.5 shrink-0 ${ok && !warn ? 'text-green-500' : warn ? 'text-orange-400' : 'text-red-500'}`}>
        {ok && !warn ? '✓' : warn ? '⚠' : '✗'}
      </span>
      <div>
        <span className="font-medium text-gray-700 dark:text-gray-300">{label} : </span>
        <span className="text-gray-500 dark:text-gray-400">{value}</span>
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded px-2 py-1 text-xs font-medium transition ${
        active ? 'bg-gray-200 text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-700 dark:hover:text-gray-300 dark:text-gray-300'
      }`}
    >
      {children}
    </button>
  );
}
