import { z } from 'zod';
import { CHAT_MAX_MESSAGE_LENGTH } from '../constants';

export const messageSchema = z.object({
  content: z.string().trim().max(CHAT_MAX_MESSAGE_LENGTH, `Le message ne peut pas dépasser ${CHAT_MAX_MESSAGE_LENGTH} caractères`).default(''),
  imageUrls: z.array(z.string().url()).max(4, 'Maximum 4 images par message').optional(),
}).refine(
  (data) => data.content.length > 0 || (data.imageUrls && data.imageUrls.length > 0),
  { message: 'Le message doit contenir du texte ou des images' },
);

export type MessageInput = z.infer<typeof messageSchema>;
