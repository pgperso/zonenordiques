import { z } from 'zod';

export const articleSchema = z.object({
  title: z.string().trim().min(3, 'Le titre doit faire au moins 3 caractères').max(200, 'Le titre ne peut pas dépasser 200 caractères'),
  body: z.string().min(10, 'Le contenu doit faire au moins 10 caractères').max(100000, 'Le contenu est trop long'),
  slug: z.string().min(1),
  excerpt: z.string().max(500).nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
});

export type ArticleInput = z.infer<typeof articleSchema>;
