import { getSql } from './db/client'
import { parallelMap } from '~/utils/parallel'

export interface InsertChunk {
  sourceType: 'url'
  sourceName: string
  content: string
  embedding: number[]
  metadata: Record<string, unknown>
}

export interface SearchResult {
  id: string
  sourceType: string
  sourceName: string
  content: string
  metadata: Record<string, unknown>
  similarity: number
}

/**
 * Concurrency cap for parallel inserts. Keep this below the postgres.js pool
 * size (max=10) AND below Supabase's per-IP connection budget. Anything above
 * ~5 risks `EDBHANDLEREXITED` on the free tier when many writes land at once.
 */
const INSERT_CONCURRENCY = 4

/**
 * Insert chunks + embeddings into the documents table with bounded concurrency.
 *
 * Plain `Promise.all` works for ~5 inserts but exhausts Supabase's pooled
 * connections at higher counts (we routinely insert 20–50 rows per URL),
 * which manifests as "connection to database closed" errors mid-write.
 */
export async function insertChunks(chunks: InsertChunk[]): Promise<number> {
  if (chunks.length === 0) return 0
  const sql = getSql()
  await parallelMap(chunks, INSERT_CONCURRENCY, (chunk) => sql`
    INSERT INTO documents (source_type, source_name, content, embedding, metadata)
    VALUES (
      ${chunk.sourceType},
      ${chunk.sourceName},
      ${chunk.content},
      ${JSON.stringify(chunk.embedding)}::vector,
      ${JSON.stringify(chunk.metadata)}::jsonb
    )
  `)
  return chunks.length
}

/** Similarity search via match_documents Postgres function. */
export async function searchSimilar(
  queryEmbedding: number[],
  topK = 4,
  sourceNames?: string[],
): Promise<SearchResult[]> {
  const sql = getSql()
  let results
  if (sourceNames && sourceNames.length > 0) {
    results = await sql`
      SELECT
        id,
        source_type,
        source_name,
        content,
        metadata,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS similarity
      FROM documents
      WHERE source_name IN ${sql(sourceNames)}
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${topK}
    `
  } else {
    results = await sql`
      SELECT * FROM match_documents(${JSON.stringify(queryEmbedding)}::vector, ${topK})
    `
  }
  return results.map((r: any) => ({
    id: r.id,
    sourceType: r.source_type,
    sourceName: r.source_name,
    content: r.content,
    metadata: r.metadata,
    similarity: r.similarity,
  }))
}

/** Delete all chunks for a given source URL. Returns the number deleted. */
export async function deleteBySource(sourceName: string): Promise<number> {
  const sql = getSql()
  const result = await sql`DELETE FROM documents WHERE source_name = ${sourceName}`
  return result.count
}
