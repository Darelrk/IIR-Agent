import { ROUTING } from '~/config'

const URL_REGEX = /https?:\/\/[^\s]+/

/** Simple patterns that don't need any retrieval — direct LLM answer. */
const CONVERSATIONAL_PATTERNS = [
  // Greetings
  /^(hi|hello|hey|halo|hai|selamat|good\s?(morning|afternoon|evening|night))[\s!.?]*$/i,
  // How are you / apa kabar
  /^(apa\s+kabar|how\s+are\s+you|how\s+do\s+you\s+do|siapa\s+kamu|who\s+are\s+you|what'?s?\s+your\s+name)[\s!.?]*$/i,
  // Thanks / goodbye
  /^(terima\s+kasih|thanks|thank\s+you|bye|sampai\s+jumpa|goodbye|see\s+you)[\s!.?]*$/i,
  // Simple acknowledgments
  /^(ok|oke|okay|baik|sip|noted|understood|paham|siap)[\s!.?]*$/i,
]

export type RouteDecision =
  | { action: 'conversational' }
  | { action: 'vector' }
  | { action: 'web_search' }
  | { action: 'direct_fetch'; url: string }
  | { action: 'hybrid' }

/**
 * Classify a user query and decide the optimal retrieval strategy.
 *
 * 3-tier approach (per production best practice):
 *  1. Pattern match: URL → direct_fetch, freshness → web_search, greeting → conversational
 *  2. Default: hybrid (vector first, fallback web search)
 *
 * "Use the smallest capability that works" — don't run full RAG for "hello".
 */
export function routeQuery(query: string): RouteDecision {
  const lower = query.toLowerCase().trim()

  // 1. Explicit URL → direct fetch
  const urlMatch = lower.match(URL_REGEX)
  if (urlMatch) {
    return { action: 'direct_fetch', url: urlMatch[0] }
  }

  // 2. Freshness signals → web search (high priority, time-sensitive)
  if (ROUTING.FRESHNESS_SIGNALS.some((s: string) => lower.includes(s))) {
    return { action: 'web_search' }
  }

  // 3. Conversational / greeting → direct LLM (no retrieval needed)
  if (CONVERSATIONAL_PATTERNS.some((p) => p.test(lower))) {
    return { action: 'conversational' }
  }

  // 4. Very short queries (< 15 chars, no question words) → likely conversational
  if (lower.length < 15 && !/[?]|apa|siapa|bagaimana|kenapa|mengapa|kapan|dimana|mana|what|who|how|why|when|where|which/.test(lower)) {
    return { action: 'conversational' }
  }

  // 5. Default: hybrid (vector first, fallback web)
  return { action: 'hybrid' }
}
