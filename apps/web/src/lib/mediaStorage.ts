import 'server-only';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

/**
 * Podcast audio lives on the VPS disk, not in Supabase Storage.
 *
 * Audio was ~95% of the Supabase storage bill and most of its egress (every
 * play streams the whole file). On the la-zone VPS, nginx serves
 * `MEDIA_DIR` at `/media/` on every brand host (deploy/server/nginx), with
 * fixed-price bandwidth and Cloudflare caching in front.
 *
 * Files are stored under `podcast-audio/<communityId>/<name>` and referenced
 * by an absolute URL on the uploading brand's canonical host, so feeds and
 * JSON-LD (which need absolute URLs) work unchanged.
 */

export const MEDIA_DIR = process.env.MEDIA_DIR?.trim() || '/srv/la-zone/media';
const MEDIA_PREFIX = '/media/';
export const PODCAST_AUDIO_MAX_BYTES = 100 * 1024 * 1024;

export const PODCAST_AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

export class MediaTooLargeError extends Error {}

function publicOrigin(): string {
  const host = process.env.NEXT_PUBLIC_CANONICAL_HOST?.trim() || 'www.zonenordiques.com';
  return `https://${host}`;
}

/**
 * Stream an upload body to disk under podcast-audio/<communityId>/.
 * Writes to a temp name first and renames, so a half-written file is never
 * reachable; aborts (and removes the temp file) past the size limit.
 */
export async function savePodcastAudio(
  body: WebReadableStream<Uint8Array>,
  communityId: number,
  contentType: string,
): Promise<string> {
  const ext = PODCAST_AUDIO_TYPES[contentType];
  if (!ext) throw new Error(`unsupported type ${contentType}`);

  const relDir = path.posix.join('podcast-audio', String(communityId));
  const name = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
  const dir = path.join(MEDIA_DIR, relDir);
  await mkdir(dir, { recursive: true });

  const finalPath = path.join(dir, name);
  const tmpPath = `${finalPath}.part`;
  let bytes = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (bytes > PODCAST_AUDIO_MAX_BYTES) cb(new MediaTooLargeError('too large'));
      else cb(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(body), limit, createWriteStream(tmpPath, { mode: 0o644 }));
    if (bytes === 0) throw new Error('empty upload');
    await rename(tmpPath, finalPath);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    throw err;
  }

  return `${publicOrigin()}${MEDIA_PREFIX}${relDir}/${name}`;
}

/**
 * The on-disk location and community of a podcast-audio URL we issued, or
 * null for anything else (legacy Supabase URLs, external links, crafted paths).
 */
export function resolvePodcastAudio(url: string): { file: string; communityId: number } | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = pathname.match(/^\/media\/podcast-audio\/(\d+)\/([A-Za-z0-9-]+\.(?:mp3|m4a|ogg|webm))$/);
  if (!m) return null;
  return {
    file: path.join(MEDIA_DIR, 'podcast-audio', m[1], m[2]),
    communityId: Number(m[1]),
  };
}

export async function deletePodcastAudio(file: string): Promise<void> {
  await unlink(file).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') throw err;
  });
}
