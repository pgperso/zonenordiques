import { z } from 'zod';

export const communitySchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit faire au moins 2 caractères').max(100, 'Le nom ne peut pas dépasser 100 caractères'),
  slug: z.string().min(1),
  description: z.string().max(500, 'La description ne peut pas dépasser 500 caractères').nullable().optional(),
});

export type CommunityInput = z.infer<typeof communitySchema>;
