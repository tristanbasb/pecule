const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Identifiant court et aléatoire (fonctionne aussi hors contexte sécurisé, ex. accès via le réseau local). */
export function uid(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 36];
  return out;
}

export const nowIso = () => new Date().toISOString();
