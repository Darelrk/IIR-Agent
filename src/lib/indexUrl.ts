import { RAG } from '~/config'
import { parallelMap } from '~/utils/parallel'
import { countTokens } from './tokenizer'
import { embedPassage } from './nvidia'
import { getCachedUrl, setCachedUrl } from './redis'
import { splitText } from './splitter'
import { extractUrls } from './exa'
import { insertChunks, type InsertChunk } from './vector'

export interface IndexedUrlResult {
  url: string
  title: string
  chunksCount: number
  /** True when result came from Redis cache (no network/embedding work done). */
  cached: boolean
}

export class IndexUrlError extends Error {
  /** HTTP-style status code for the API caller to map to a response. */
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'IndexUrlError'
    this.status = status
  }
}

export interface IndexUrlOptions {
  /** Optional title hint (e.g. from Tavily search result) used as fallback. */
  titleHint?: string
  /** Extra metadata merged into every chunk (e.g. search query). */
  extraMetadata?: Record<string, unknown>
}

function isTokenOverflowError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase()
  return msg.includes('exceeds') && msg.includes('token')
}

/**
 * Idempotent end-to-end indexer for a single URL.
 *
 * Pipeline:
 *   Redis cache hit? → return cached metadata
 *   Tavily extract → split (token-based) → embed (with adaptive retry) → insert → cache
 *
 * Throws IndexUrlError with an HTTP-style status on user-facing failures.
 */
export async function indexUrl(
  url: string,
  options: IndexUrlOptions = {},
): Promise<IndexedUrlResult> {
  // 1. Cache check
  const cached = await getCachedUrl(url)
  if (cached) {
    return {
      url: cached.url,
      title: cached.title,
      chunksCount: cached.chunks,
      cached: true,
    }
  }

  // 2. Extract content from URL
  const pages = await extractUrls([url])
  if (pages.length === 0 || !pages[0].rawContent) {
    throw new IndexUrlError('Konten URL kosong atau tidak bisa diekstrak', 422)
  }

  const rawContent = pages[0].rawContent
  const title =
    pages[0].title?.trim() ||
    options.titleHint?.trim() ||
    safeHostname(url)

  // 3. Split content into chunks (token-based splitter)
  const chunks = await splitText(rawContent, {
    source_type: 'url',
    source_name: url,
    title,
    ...options.extraMetadata,
  })

  if (chunks.length === 0) {
    throw new IndexUrlError('Tidak ada chunk yang bisa dibuat dari konten URL', 422)
  }

  // 4. Embed chunks in parallel (concurrency-capped to avoid NVIDIA rate-limit).
  //    Pre-embed token guard: re-split chunks that exceed the model limit.
  //    Adaptive retry: if embed still fails with token overflow, split further.
  const expandedChunks: { chunk: (typeof chunks)[0]; originalIndex: number }[] = []
  for (let i = 0; i < chunks.length; i++) {
    const tokenCount = countTokens(chunks[i].pageContent)
    if (tokenCount > RAG.CHUNK_MAX_EMBED_TOKENS) {
      // Pre-emptively re-split oversized chunks
      const subChunks = await splitText(chunks[i].pageContent, chunks[i].metadata)
      for (const sub of subChunks) {
        expandedChunks.push({ chunk: sub, originalIndex: i })
      }
    } else {
      expandedChunks.push({ chunk: chunks[i], originalIndex: i })
    }
  }

  const embedded = await parallelMap(expandedChunks, RAG.EMBED_CONCURRENCY, async ({ chunk, originalIndex }) => {
    try {
      const embedding = await embedPassage(chunk.pageContent)
      const row: InsertChunk = {
        sourceType: 'url',
        sourceName: url,
        content: chunk.pageContent,
        embedding,
        metadata: {
          ...chunk.metadata,
          chunk_index: originalIndex,
          total_chunks: chunks.length,
        },
      }
      return [row]
    } catch (embedErr: any) {
      // Adaptive retry: if token overflow, split further and retry
      if (isTokenOverflowError(embedErr)) {
        try {
          const subChunks = await splitText(chunk.pageContent, chunk.metadata)
          const subRows: InsertChunk[] = []
          for (const sub of subChunks) {
            try {
              const subEmbedding = await embedPassage(sub.pageContent)
              subRows.push({
                sourceType: 'url',
                sourceName: url,
                content: sub.pageContent,
                embedding: subEmbedding,
                metadata: {
                  ...sub.metadata,
                  chunk_index: originalIndex,
                  total_chunks: chunks.length,
                },
              })
            } catch {
              console.warn(`Sub-chunk embedding gagal untuk ${url}, skip`)
            }
          }
          return subRows.length > 0 ? subRows : null
        } catch {
          console.warn(`Chunk ${originalIndex} re-split gagal untuk ${url}, skip`)
          return null
        }
      }
      console.warn(`Chunk ${originalIndex} embedding gagal untuk ${url}: ${embedErr?.message}`)
      return null
    }
  })

  const insertData: InsertChunk[] = embedded
    .filter((rows): rows is InsertChunk[] => rows !== null)
    .flat()

  if (insertData.length === 0) {
    throw new IndexUrlError('Semua chunk gagal di-embed', 502)
  }

  // 5. Persist to Postgres (batched insert)
  await insertChunks(insertData)

  // 6. Cache metadata
  await setCachedUrl(url, {
    url,
    title,
    chunks: insertData.length,
    fetchedAt: new Date().toISOString(),
  })

  return { url, title, chunksCount: insertData.length, cached: false }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
