import 'dotenv/config';
import { extractUrls } from '../src/lib/tavily';
import { splitText } from '../src/lib/splitter';
import { embedPassage } from '../src/lib/nvidia';
import { insertChunks, searchSimilar, deleteBySource } from '../src/lib/vector';
import { getCachedUrl, setCachedUrl } from '../src/lib/redis';
import { ragQuery } from '../src/lib/chain';

const TEST_URL = 'https://en.wikipedia.org/wiki/Vector_database';
const TEST_QUESTION = 'Apa poin utama dari halaman ini?';

let passed = 0;
let failed = 0;

async function main() {
  console.log('=== RAG Pipeline End-to-End Test ===\n');

  // ========== STEP 1: Fetch URL ==========
  console.log('[1/8] Fetch URL via Tavily...');
  let rawContent: string;
  let title: string;
  try {
    const pages = await extractUrls([TEST_URL]);
    if (pages.length === 0 || !pages[0].rawContent) {
      console.log('FAIL: Tavily tidak mengembalikan konten');
      process.exit(1);
    }
    rawContent = pages[0].rawContent;
    title = 'Vector database';
    console.log(`  PASS: ${rawContent.length} chars fetched`);
    console.log(`  Preview: ${rawContent.slice(0, 100)}...`);
    passed++;
  } catch (err: any) {
    console.log(`FAIL: Tavily extract gagal: ${err.message}`);
    process.exit(1);
  }

  // ========== STEP 2: Split text ==========
  console.log('\n[2/8] Split text into chunks...');
  let chunks: Awaited<ReturnType<typeof splitText>>;
  try {
    chunks = await splitText(rawContent, {
      source_type: 'url',
      source_name: TEST_URL,
      title,
    });
    console.log(`  PASS: ${chunks.length} chunks (avg ${Math.round(chunks.reduce((a, c) => a + c.pageContent.length, 0) / chunks.length)} chars)`);
    passed++;
  } catch (err: any) {
    console.log(`FAIL: Split gagal: ${err.message}`);
    process.exit(1);
  }

  // ========== STEP 3: Embed + insert ==========
  console.log('\n[3/8] Embed chunks (passage) + insert ke Supabase...');
  try {
    const insertData = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await embedPassage(chunk.pageContent);
      insertData.push({
        sourceType: 'url' as const,
        sourceName: TEST_URL,
        content: chunk.pageContent,
        embedding,
        metadata: {
          ...chunk.metadata,
          chunk_index: i,
          total_chunks: chunks.length,
        },
      });
      process.stdout.write(`\r  Embedding: ${i + 1}/${chunks.length}`);
    }
    console.log('');

    const inserted = await insertChunks(insertData);
    console.log(`  PASS: ${inserted} chunks inserted ke Supabase`);
    passed++;
  } catch (err: any) {
    console.log(`FAIL: Embed/insert gagal: ${err.message}`);
    process.exit(1);
  }

  // ========== STEP 4: Cache URL ==========
  console.log('\n[4/8] Cache URL metadata ke Redis...');
  try {
    await setCachedUrl(TEST_URL, {
      url: TEST_URL,
      title,
      chunks: chunks.length,
      fetchedAt: new Date().toISOString(),
    });
    const cached = await getCachedUrl(TEST_URL);
    if (cached) {
      console.log(`  PASS: Cached (title: ${cached.title}, chunks: ${cached.chunks})`);
      passed++;
    } else {
      console.log('FAIL: Cache tidak ditemukan setelah set');
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: Redis cache gagal: ${err.message}`);
    failed++;
  }

  // ========== STEP 5: RAG Query ==========
  console.log(`\n[5/8] Query: "${TEST_QUESTION}"`);
  let responseText = '';
  let sources: any[] = [];
  try {
    const result = await ragQuery(TEST_QUESTION);
    sources = result.sources;

    console.log(`  PASS: ${sources.length} chunks relevan ditemukan`);
    for (const s of sources) {
      console.log(`    - ${s.sourceName} (sim: ${s.similarity.toFixed(3)})`);
    }
    passed++;

    // ========== STEP 6: Stream response ==========
    console.log('\n[6/8] Stream response dari NVIDIA NIM...');
    for await (const chunk of result.stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        responseText += delta;
        process.stdout.write(delta);
      }
    }
    console.log('');

    if (responseText.length > 0) {
      console.log(`  PASS: Response ${responseText.length} chars`);
      passed++;
    } else {
      console.log('FAIL: Response kosong');
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: RAG query gagal: ${err.message}`);
    failed++;
  }

  // ========== STEP 7: Print sources ==========
  console.log('\n[7/8] Sources:');
  if (sources.length > 0) {
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      console.log(`  ${i + 1}. ${s.sourceName} (chunk, sim: ${s.similarity.toFixed(3)})`);
      console.log(`     ${s.content.slice(0, 80)}...`);
    }
    passed++;
  } else {
    console.log('  Tidak ada sources');
    failed++;
  }

  // ========== STEP 8: Cleanup ==========
  console.log('\n[8/8] Cleanup test data...');
  try {
    const deleted = await deleteBySource(TEST_URL);
    console.log(`  PASS: ${deleted} rows deleted dari Supabase`);
    passed++;
  } catch (err: any) {
    console.log(`FAIL: Cleanup gagal: ${err.message}`);
    failed++;
  }

  // ========== Summary ==========
  console.log('\n=== Hasil ===');
  console.log(`PASS: ${passed} | FAIL: ${failed}`);
  if (failed > 0) {
    console.log('Ada test yang gagal.');
    process.exit(1);
  } else {
    console.log('Pipeline end-to-end berhasil!');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
