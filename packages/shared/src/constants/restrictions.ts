export const RESTRICTION_TYPES = {
  CHAT_MUTE: 'chat:mute',
  COMMUNITY_BAN: 'community:ban',
} as const;

export const RESTRICTION_DISPLAY_NAMES: Record<string, string> = {
  'chat:mute': 'Muté du chat',
  'community:ban': 'Banni de la communauté',
};
