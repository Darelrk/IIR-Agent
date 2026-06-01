/**
 * Tunable constants — single source of truth.
 * Group constants by concern. Pure data, no runtime logic.
 */

export const RAG = {
  /** Max tokens per chunk (model limit 512, safe margin 400). */
  CHUNK_SIZE_TOKENS: 400,
  /** Token overlap between adjacent chunks (~16%). */
  CHUNK_OVERLAP_TOKENS: 64,
  /** Pre-embed guard: skip/retry chunks above this token count. */
  CHUNK_MAX_EMBED_TOKENS: 480,
  /** Hard token limit for the embedding model (NVIDIA nv-embedqa-e5-v5). */
  EMBED_MAX_TOKENS: 512,
  /** Default top-k similarity results returned to the LLM. */
  TOP_K: 4,
  /** Max parallel embed requests to NVIDIA NIM (avoid rate-limit). */
  EMBED_CONCURRENCY: 6,
  /** Minimum similarity score to consider a vector result "relevant". */
  SIMILARITY_THRESHOLD: 0.45,
} as const

export const RATE_LIMIT = {
  /** Max requests per identifier within a window. */
  MAX_REQUESTS: 20,
  /** Sliding window size in seconds. */
  WINDOW_SECONDS: 60,
} as const

export const LIMITS = {
  /** Max URL string length accepted at /api/fetch-url. */
  URL_MAX_LENGTH: 2048,
  /** Max user message length at /api/chat. */
  MESSAGE_MAX_LENGTH: 10_000,
  /** Max persisted message content at /api/sessions/:id/messages. */
  CONTENT_MAX_LENGTH: 100_000,
  /** Max chat session title length. */
  SESSION_TITLE_MAX: 100,
} as const

export const WEB_SEARCH = {
  /** Max URLs auto-indexed from a single Tavily search. */
  MAX_URLS: 3,
  /** Tavily search results requested per query (we slice top MAX_URLS from this). */
  TAVILY_MAX_RESULTS: 5,
} as const

export const ROUTING = {
  /** Keywords that signal the user wants current/recent information. */
  FRESHNESS_SIGNALS: [
    'terkini', 'hari ini', 'latest', 'terbaru', 'sekarang',
    'current', 'today', 'recent', 'baru', 'update', 'berita',
    'terakhir', 'last', 'menjabat', 'aktif',
    'saat ini', 'kini', 'tahun ini', 'bulan ini', 'minggu ini',
    'teranyar', 'belakangan', 'barusan', 'trend', 'tren', 'viral',
    'new', 'news', 'now', 'present', 'currently', 'recently',
    'ongoing', 'active',
  ],
  /** Max URLs to fetch+index from a single web search fallback. */
  WEB_SEARCH_MAX_URLS: 2,
  /** Timeout per URL fetch during web search fallback (ms). */
  WEB_SEARCH_TIMEOUT_MS: 10_000,
} as const

export const CACHE = {
  /** URL metadata cache TTL in seconds (24h). */
  URL_TTL_SECONDS: 86_400,
} as const
