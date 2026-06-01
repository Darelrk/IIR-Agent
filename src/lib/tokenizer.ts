/**
 * Token counting utilities for chunk size management.
 * Uses js-tiktoken (already bundled via @langchain/core) for accurate counts.
 * Falls back to a heuristic if the encoder fails to load.
 */

let encoder: { encode: (text: string) => number[]; decode: (tokens: number[]) => string } | null = null

function getEncoder() {
  if (encoder) return encoder
  try {
    // js-tiktoken is a transitive dep of @langchain/core and @langchain/textsplitters
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tiktoken = require('js-tiktoken')
    encoder = tiktoken.getEncoding('cl100k_base')
    return encoder
  } catch {
    return null
  }
}

/** Count tokens in a string. Uses tiktoken if available, otherwise heuristic. */
export function countTokens(text: string): number {
  if (!text) return 0
  const enc = getEncoder()
  if (enc) return enc.encode(text).length
  // Heuristic fallback: ~3.5 chars per token for English/prose
  return Math.ceil(text.length / 3.5)
}

/** Truncate text to fit within maxTokens. */
export function truncateToTokens(text: string, maxTokens: number): string {
  const enc = getEncoder()
  if (enc) {
    const tokens = enc.encode(text)
    if (tokens.length <= maxTokens) return text
    return enc.decode(tokens.slice(0, maxTokens))
  }
  // Heuristic: approximate chars = tokens * 3.5
  const approxChars = Math.floor(maxTokens * 3.5)
  return text.slice(0, approxChars)
}
