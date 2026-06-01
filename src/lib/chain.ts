import { embedText, chatStream } from './nvidia'
import { searchSimilar, type SearchResult } from './vector'
import { RAG, WEB_SEARCH } from '~/config'
import { routeQuery } from './router'
import { indexUrl } from './indexUrl'
import { searchWeb } from './exa'

const SYSTEM_PROMPT = `Kamu adalah asisten RAG. Jawab pertanyaan user hanya berdasarkan context dari URL yang sudah di-index.
Jika context tidak cukup untuk menjawab, katakan bahwa informasi tersebut tidak ditemukan di sumber URL.
Gunakan Bahasa Indonesia kecuali user meminta bahasa lain.

Gaya jawaban:
- Berikan jawaban yang **lengkap dan terstruktur**, bukan jawaban satu baris atau terlalu compact.
- Bangun jawaban dengan beberapa paragraf bila topiknya kompleks. Mulai dari konteks/latar belakang singkat, lalu poin utama, lalu detail/contoh dari sumber.
- Gunakan markdown untuk struktur:
  - **Heading** (## atau ###) untuk membagi topik besar.
  - **Bold** untuk istilah kunci atau nama penting.
  - **List berbutir** dengan penjelasan, bukan hanya keyword tunggal.
  - Tabel jika ada perbandingan.
  - Blockquote (>) untuk kutipan langsung dari sumber jika relevan.
- Sertakan detail spesifik dari sumber: angka, tanggal, nama, definisi, contoh.
- Akhiri dengan ringkasan singkat atau implikasi praktis bila relevan.

JANGAN gunakan format kutipan inline seperti [1], [Sumber 1], atau 【】. Sumber akan ditampilkan secara terpisah oleh sistem.
JANGAN mengarang atau menambahkan informasi di luar context.`;

const CONVERSATIONAL_PROMPT = `Kamu adalah asisten AI yang ramah dan helpful. Gunakan Bahasa Indonesia kecuali user meminta bahasa lain. Jawab dengan natural dan singkat untuk percakapan umum.`;

/** Source enriched with title (from metadata) for display */
export interface RagSource extends SearchResult {
  title: string;
}

export interface RagResponse {
  stream: AsyncIterable<any>;
  sources: RagSource[];
}

/** Build RAG prompt dari context + question */
export function buildRagPrompt(context: string, question: string) {
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: `Context dari URL yang sudah di-index:\n\n${context}\n\nPertanyaan: ${question}`,
    },
  ];
}

function extractTitle(source: SearchResult): string {
  const t = source.metadata?.title;
  if (typeof t === 'string' && t.trim().length > 0) return t.trim();
  // Fallback: hostname
  try {
    return new URL(source.sourceName).hostname.replace(/^www\./, '');
  } catch {
    return source.sourceName;
  }
}

/** Build context string from search results */
function buildContext(sources: RagSource[]): string {
  return sources
    .map(
      (s, i) =>
        `[Sumber ${i + 1}] (${s.title} — ${s.sourceName}, similarity: ${s.similarity.toFixed(3)})\n${s.content}`,
    )
    .join('\n\n---\n\n');
}

/**
 * Search → fetch → index top URLs from Tavily, then run vector query.
 * Used as fallback when vector search returns nothing or low confidence.
 */
async function webSearchAndQuery(question: string): Promise<RagResponse> {
  // 1. Search via Exa (was Tavily)
  const searchResults = await searchWeb(question, WEB_SEARCH.TAVILY_MAX_RESULTS);

  if (searchResults.length === 0) {
    throw new Error('Tidak ada hasil web search ditemukan.');
  }

  // 2. Index top URLs
  const topResults = searchResults.slice(0, WEB_SEARCH.MAX_URLS);
  const indexedUrls: string[] = [];
  for (const r of topResults) {
    try {
      await indexUrl(r.url, {
        titleHint: r.title,
        extraMetadata: { searchQuery: question },
      });
      indexedUrls.push(r.url);
    } catch (err: any) {
      console.warn(`Gagal index URL dari web search: ${r.url} — ${err.message}`);
    }
  }

  if (indexedUrls.length === 0) {
    throw new Error('Gagal meng-index semua URL dari hasil web search.');
  }

  // 3. Now run vector search (restricted only to the newly indexed URLs)
  const queryEmbedding = await embedText(question);
  const rawSources = await searchSimilar(queryEmbedding, RAG.TOP_K, indexedUrls);

  if (rawSources.length === 0) {
    throw new Error('Web search berhasil tapi tidak ada chunk relevan ditemukan setelah indexing.');
  }

  const sources: RagSource[] = rawSources.map((s) => ({
    ...s,
    title: extractTitle(s),
  }));

  const context = buildContext(sources);
  const messages = buildRagPrompt(context, question);
  const stream = await chatStream(messages);

  return { stream, sources };
}

/** Direct LLM response — no retrieval, no indexing. For greetings & simple chat. */
async function conversationalResponse(question: string): Promise<RagResponse> {
  const messages = [
    { role: 'system' as const, content: CONVERSATIONAL_PROMPT },
    { role: 'user' as const, content: question },
  ];
  const stream = await chatStream(messages);
  return { stream, sources: [] };
}

/** Full RAG pipeline: route → embed query → search → build prompt → stream */
export async function ragQuery(question: string): Promise<RagResponse> {
  // 0. Smart routing
  const decision = routeQuery(question);

  // 0a. Conversational — direct LLM, no retrieval
  if (decision.action === 'conversational') {
    return conversationalResponse(question);
  }

  // 1. Direct URL fetch path
  if (decision.action === 'direct_fetch') {
    // Index the URL first, then query
    try {
      await indexUrl(decision.url, { extraMetadata: { searchQuery: question } });
    } catch (err: any) {
      console.warn(`Gagal index URL langsung: ${decision.url} — ${err.message}`);
    }

    const queryEmbedding = await embedText(question);
    const rawSources = await searchSimilar(queryEmbedding, RAG.TOP_K, [decision.url]);

    if (rawSources.length === 0) {
      throw new Error('Tidak ada chunk relevan ditemukan untuk URL tersebut.');
    }

    const sources: RagSource[] = rawSources.map((s) => ({
      ...s,
      title: extractTitle(s),
    }));

    const context = buildContext(sources);
    const messages = buildRagPrompt(context, question);
    const stream = await chatStream(messages);

    return { stream, sources };
  }

  // 2. Web search path (freshness signals)
  if (decision.action === 'web_search') {
    return webSearchAndQuery(question);
  }

  // 3. Vector search (default / hybrid / after direct fetch)
  const queryEmbedding = await embedText(question);
  const rawSources = await searchSimilar(queryEmbedding, RAG.TOP_K);

  // Hybrid fallback: if vector results are empty or low confidence, try web search
  if (
    decision.action === 'hybrid' &&
    (rawSources.length === 0 || rawSources[0].similarity < RAG.SIMILARITY_THRESHOLD)
  ) {
    return webSearchAndQuery(question);
  }

  if (rawSources.length === 0) {
    throw new Error('Tidak ada chunk yang relevan ditemukan. Pastikan URL sudah di-index.');
  }

  // Enrich with title
  const sources: RagSource[] = rawSources.map((s) => ({
    ...s,
    title: extractTitle(s),
  }));

  // 4. Build context dari search results
  const context = buildContext(sources);

  // 5. Build prompt + stream
  const messages = buildRagPrompt(context, question);
  const stream = await chatStream(messages);

  return { stream, sources };
}
