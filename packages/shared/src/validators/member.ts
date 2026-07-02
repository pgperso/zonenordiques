export function validateUsername(username: string): string | null {
  if (username.length < 3) return 'Le nom d\'utilisateur doit faire au moins 3 caractères';
  if (username.length > 50) return 'Le nom d\'utilisateur ne peut pas dépasser 50 caractères';
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return 'Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores';
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return 'Adresse courriel invalide';
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Le mot de passe doit faire au moins 8 caractères';
  return null;
}
