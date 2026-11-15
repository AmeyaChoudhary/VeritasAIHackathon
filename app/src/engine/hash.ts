// A short, stable hash of a message's own words, so the same message seen from two places
// (the keyboard and Gmail, or two exports) counts once. The words are normalised first:
// lowercase, straight apostrophes, single spaces. Synchronous, so the keyboard path and the
// readers make the same value. It is kept on the phone and never sent.

export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’`ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** FNV-1a, 64 bits, as 16 hex characters. */
export function textHash(text: string): string {
  const bytes = new TextEncoder().encode(normaliseText(text));
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}
