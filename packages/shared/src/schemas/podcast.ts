import { z } from 'zod';

export const podcastSchema = z.object({
  title: z.string().trim().min(3, 'Le titre doit faire au moins 3 caractères').max(500, 'Le titre ne peut pas dépasser 500 caractères'),
  description: z.string().max(5000, 'La description est trop longue').nullable().optional(),
  audioUrl: z.string().url('URL audio invalide').nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  youtubeVideoId: z.string().max(20).nullable().optional(),
  isLive: z.boolean().optional(),
}).refine(
  (data) => data.audioUrl || data.youtubeVideoId,
  { message: 'Un fichier audio ou un ID YouTube est requis' },
);

export type PodcastInput = z.infer<typeof podcastSchema>;
