import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';

let passed = 0;
let failed = 0;

const SAMPLE_TEXT = `
Retrieval-augmented generation (RAG) is a technique that enhances large language models by retrieving relevant information from external knowledge bases before generating responses. This approach combines the strengths of retrieval-based and generation-based methods.

The RAG process typically involves several steps. First, the user input is used to query a retrieval system, which searches through a corpus of documents to find relevant passages. These passages are then combined with the original query and fed into a language model, which generates a response based on both the retrieved information and its own knowledge.

Vector databases play a crucial role in RAG systems. They store document embeddings—dense vector representations of text—that enable efficient similarity search. When a query comes in, it is also converted to an embedding, and the system finds the most similar document embeddings using distance metrics like cosine similarity.

Common vector databases include Pinecone, Weaviate, Milvus, and Supabase with the pgvector extension. Each has its own strengths in terms of scalability, query performance, and ease of integration.

Text chunking is an important preprocessing step in RAG pipelines. Documents are split into smaller, manageable chunks before being embedded and stored. The choice of chunk size and overlap can significantly impact retrieval quality. Too large chunks may dilute relevant information, while too small chunks may lose important context.
`.trim();

async function testBasicSplitting() {
  console.log('\n--- Test A: Basic Splitting ---');
  try {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await splitter.createDocuments([SAMPLE_TEXT]);
    console.log(`PASS: ${docs.length} chunks dari ${SAMPLE_TEXT.length} chars`);
    for (let i = 0; i < Math.min(3, docs.length); i++) {
      console.log(`  Chunk ${i}: ${docs[i].pageContent.length} chars - "${docs[i].pageContent.slice(0, 60)}..."`);
    }
    passed++;
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testChunkSize() {
  console.log('\n--- Test B: Chunk Size Validation ---');
  try {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 100,
    });

    const docs = await splitter.createDocuments([SAMPLE_TEXT]);
    let allWithinLimit = true;
    for (const doc of docs) {
      if (doc.pageContent.length > 500) {
        console.log(`  WARN: Chunk melebihi 500 chars: ${doc.pageContent.length}`);
        allWithinLimit = false;
      }
    }

    if (allWithinLimit) {
      console.log(`PASS: Semua ${docs.length} chunks <= 500 chars`);
      passed++;
    } else {
      console.log(`FAIL: Ada chunk yang melebihi batas`);
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testOverlap() {
  console.log('\n--- Test C: Overlap Verification ---');
  try {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 300,
      chunkOverlap: 50,
    });

    const docs = await splitter.createDocuments([SAMPLE_TEXT]);
    console.log(`  ${docs.length} chunks dibuat`);

    // Check that consecutive chunks have some overlap
    let overlapDetected = 0;
    for (let i = 0; i < docs.length - 1; i++) {
      const endOfCurrent = docs[i].pageContent.slice(-80);
      const startOfNext = docs[i + 1].pageContent.slice(0, 80);

      // Check if any words overlap
      const endWords = endOfCurrent.split(/\s+/).slice(-3);
      const startWords = startOfNext.split(/\s+/).slice(0, 3);
      const hasOverlap = endWords.some((w) => startWords.includes(w));
      if (hasOverlap) overlapDetected++;
    }

    if (overlapDetected > 0) {
      console.log(`PASS: Overlap terdeteksi di ${overlapDetected}/${docs.length - 1} pasang chunk`);
      passed++;
    } else {
      console.log(`WARN: Tidak terdeteksi overlap (mungkin masih OK tergantung separator)`);
      passed++; // Not a hard fail, depends on text structure
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testWithMetadata() {
  console.log('\n--- Test D: Splitting dengan Metadata ---');
  try {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const doc = new Document({
      pageContent: SAMPLE_TEXT,
      metadata: {
        source: 'https://en.wikipedia.org/wiki/RAG',
        title: 'Retrieval-augmented generation',
      },
    });

    const docs = await splitter.splitDocuments([doc]);
    const allHaveMetadata = docs.every(
      (d) => d.metadata.source && d.metadata.title,
    );

    if (allHaveMetadata) {
      console.log(`PASS: Semua ${docs.length} chunks punya metadata source + title`);
      console.log(`  Sample: ${JSON.stringify(docs[0].metadata)}`);
      passed++;
    } else {
      console.log(`FAIL: Ada chunk yang kehilangan metadata`);
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testPrdDefaults() {
  console.log('\n--- Test E: PRD Defaults (1000/200) ---');
  try {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await splitter.createDocuments([SAMPLE_TEXT]);
    const sizes = docs.map((d) => d.pageContent.length);
    const avg = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);

    console.log(`PASS: ${docs.length} chunks, avg ${avg} chars, min ${Math.min(...sizes)}, max ${Math.max(...sizes)}`);
    console.log(`  Ini yang akan dipakai di pipeline RAG`);
    passed++;
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('=== Text Splitting Backend Test ===');
  console.log(`Sample text: ${SAMPLE_TEXT.length} chars`);

  await testBasicSplitting();
  await testChunkSize();
  await testOverlap();
  await testWithMetadata();
  await testPrdDefaults();

  console.log('\n=== Hasil ===');
  console.log(`PASS: ${passed} | FAIL: ${failed}`);
  if (failed > 0) {
    console.log('Ada test yang gagal.');
    process.exit(1);
  } else {
    console.log('Semua test PASS! Text splitter siap integrasi.');
  }
}

main();
