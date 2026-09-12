import { customAlphabet } from 'nanoid';

// Excludes visually ambiguous characters (0/O, 1/I/L) since codes are read
// aloud and typed by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const generate = customAlphabet(ALPHABET, 4);

export function generateRoomCode(): string {
  return generate();
}
