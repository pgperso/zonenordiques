import { NextResponse } from 'next/server';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { createClient } from '@/lib/supabase/server';
import { canManageCommunityPodcasts } from '@/lib/authz';
import { isSameOrigin, CROSS_SITE_REFUSED } from '@/lib/requestGuards';
import {
  PODCAST_AUDIO_MAX_BYTES,
  PODCAST_AUDIO_TYPES,
  MediaTooLargeError,
  deletePodcastAudio,
  resolvePodcastAudio,
  savePodcastAudio,
} from '@/lib/mediaStorage';

// Large bodies are streamed straight to disk; never buffered or cached.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function authorize(communityId: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const allowed = await canManageCommunityPodcasts(supabase, user.id, communityId);
  return allowed ? { ok: true as const } : { ok: false as const, status: 403 };
}

/**
 * Upload podcast audio: the raw file is the request body.
 * POST /api/podcasts/audio?communityId=11   (Content-Type: audio/mpeg, …)
 * → { url }
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });

  const communityId = Number(new URL(request.url).searchParams.get('communityId'));
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json({ error: 'Tribune invalide' }, { status: 400 });
  }

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!PODCAST_AUDIO_TYPES[contentType]) {
    return NextResponse.json({ error: 'Format non supporté. Utilisez MP3, M4A, OGG ou WebM.' }, { status: 415 });
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > PODCAST_AUDIO_MAX_BYTES) {
    return NextResponse.json({ error: 'Le fichier ne doit pas dépasser 100 Mo.' }, { status: 413 });
  }

  const auth = await authorize(communityId);
  if (!auth.ok) return NextResponse.json({ error: 'Non autorisé' }, { status: auth.status });
  if (!request.body) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });

  try {
    const url = await savePodcastAudio(
      request.body as unknown as WebReadableStream<Uint8Array>,
      communityId,
      contentType,
    );
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof MediaTooLargeError) {
      return NextResponse.json({ error: 'Le fichier ne doit pas dépasser 100 Mo.' }, { status: 413 });
    }
    console.error('[podcasts/audio] upload failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Échec de l'envoi du fichier" }, { status: 500 });
  }
}

/**
 * Delete podcast audio we host. Ignores URLs that aren't ours (legacy
 * Supabase files are removed by the caller through Storage, as before).
 * DELETE /api/podcasts/audio?url=<audio_url>
 */
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });

  const url = new URL(request.url).searchParams.get('url') ?? '';
  const target = resolvePodcastAudio(url);
  if (!target) return NextResponse.json({ ok: true, skipped: true });

  const auth = await authorize(target.communityId);
  if (!auth.ok) return NextResponse.json({ error: 'Non autorisé' }, { status: auth.status });

  try {
    await deletePodcastAudio(target.file);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[podcasts/audio] delete failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Échec de la suppression' }, { status: 500 });
  }
}
