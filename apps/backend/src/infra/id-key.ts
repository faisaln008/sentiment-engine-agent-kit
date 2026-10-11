import { createHash } from 'node:crypto';

/**
 * Short digest of a chunk_id for the idempotency set (S-02): ids may be 512 chars, so storing them raw
 * would cost ~1 KB each x 5000 x sessions. 16 bytes (128 bits) of SHA-1 (accidental collision ~2^-128 per pair, ~2^-64 birthday bound over 2^64 ids; irrelevant for
 * dedupe) as a 22-char base64 string; ~1-2 us per call, far under the 0.05 ms hot-path budget.
 */
export function idKey(id: string): string {
  return createHash('sha1').update(id).digest().subarray(0, 16).toString('base64url');
}
