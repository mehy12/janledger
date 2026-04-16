import { createHash } from 'crypto';

/**
 * Generate a SHA-256 hash from arbitrary data.
 * The data is JSON-stringified before hashing for deterministic output.
 */
export function generateHash(data: unknown): string {
  const serialized = JSON.stringify(data);
  return createHash('sha256').update(serialized).digest('hex');
}
