import { TokenTextSplitter } from '@langchain/textsplitters'
import { Document } from '@langchain/core/documents'
import { RAG } from '~/config'

export function createSplitter(opts?: { chunkSize?: number; chunkOverlap?: number }) {
  return new TokenTextSplitter({
    chunkSize: opts?.chunkSize ?? RAG.CHUNK_SIZE_TOKENS,
    chunkOverlap: opts?.chunkOverlap ?? RAG.CHUNK_OVERLAP_TOKENS,
  })
}

export async function splitText(
  text: string,
  metadata: Record<string, unknown> = {},
): Promise<Document[]> {
  const splitter = createSplitter()
  return splitter.createDocuments([text], [metadata])
}

export async function splitDocuments(docs: Document[]): Promise<Document[]> {
  const splitter = createSplitter()
  return splitter.splitDocuments(docs)
}
