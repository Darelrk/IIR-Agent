import 'dotenv/config';
import OpenAI from 'openai';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const CHAT_MODEL = 'meta/llama-3.3-70b-instruct';
const EMBED_MODEL = 'nvidia/nv-embedqa-e5-v5';

const apiKey = process.env.NVIDIA_API_KEY;
if (!apiKey) {
  console.error('FAIL: NVIDIA_API_KEY tidak ditemukan di .env');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey,
  baseURL: NVIDIA_BASE_URL,
});

let passed = 0;
let failed = 0;

async function testChatCompletion() {
  console.log('\n--- Test A: Chat Completion (non-stream) ---');
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: 'Apa itu RAG? Jawab dalam 1 kalimat.' }],
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 256,
    });

    const content = completion.choices[0]?.message?.content;
    if (content && content.length > 0) {
      console.log(`PASS: Response diterima (${content.length} chars)`);
      console.log(`Preview: ${content.slice(0, 120)}...`);
      passed++;
    } else {
      console.log('FAIL: Response kosong');
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.status || ''} ${err.message}`);
    failed++;
  }
}

async function testEmbedding() {
  console.log('\n--- Test B: Embedding ---');
  try {
    const result = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: 'test query untuk embedding',
      encoding_format: 'float',
      // @ts-expect-error - NVIDIA NIM requires input_type for asymmetric models
      input_type: 'query',
    });

    const embedding = result.data[0]?.embedding;
    if (Array.isArray(embedding)) {
      console.log(`PASS: Embedding dimensi = ${embedding.length}`);
      if (embedding.length === 1024) {
        console.log('PASS: Dimensi sesuai spec (1024)');
        passed++;
      } else {
        console.log(`FAIL: Dimensi expected 1024, got ${embedding.length}`);
        failed++;
      }
      passed++;
    } else {
      console.log('FAIL: Embedding bukan array');
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.status || ''} ${err.message}`);
    failed++;
  }
}

async function testStreaming() {
  console.log('\n--- Test C: Streaming ---');
  try {
    const stream = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: 'Sebutkan 3 warna primer.' }],
      stream: true,
      max_tokens: 128,
    });

    let tokenCount = 0;
    let fullContent = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        tokenCount++;
        fullContent += delta;
      }
    }

    if (tokenCount > 0) {
      console.log(`PASS: Streaming ${tokenCount} chunks diterima`);
      console.log(`Preview: ${fullContent.slice(0, 100)}...`);
      passed++;
    } else {
      console.log('FAIL: Tidak ada token streaming');
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.status || ''} ${err.message}`);
    failed++;
  }
}

async function testErrorHandling() {
  console.log('\n--- Test D: Error Handling ---');

  // Test 1: Bad API key
  try {
    const badClient = new OpenAI({
      apiKey: 'nvapi-invalid-key',
      baseURL: NVIDIA_BASE_URL,
    });
    await badClient.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: 'test' }],
    });
    console.log('FAIL: Seharusnya error 401 dengan key salah');
    failed++;
  } catch (err: any) {
    if (err.status === 401 || err.status === 403) {
      console.log(`PASS: Error ${err.status} dengan key salah (expected)`);
      passed++;
    } else {
      console.log(`PASS: Error dengan key salah: ${err.message}`);
      passed++;
    }
  }

  // Test 2: Bad model name
  try {
    await openai.chat.completions.create({
      model: 'nvidia/model-tidak-ada',
      messages: [{ role: 'user', content: 'test' }],
    });
    console.log('FAIL: Seharusnya error dengan model salah');
    failed++;
  } catch (err: any) {
    console.log(`PASS: Error dengan model salah: ${err.status || ''} ${err.message.slice(0, 80)}`);
    passed++;
  }
}

async function main() {
  console.log('=== NVIDIA NIM Backend Test ===');
  console.log(`Chat Model: ${CHAT_MODEL}`);
  console.log(`Embed Model: ${EMBED_MODEL}`);
  console.log(`Base URL: ${NVIDIA_BASE_URL}`);

  await testChatCompletion();
  await testEmbedding();
  await testStreaming();
  await testErrorHandling();

  console.log('\n=== Hasil ===');
  console.log(`PASS: ${passed} | FAIL: ${failed}`);
  if (failed > 0) {
    console.log('Ada test yang gagal. Periksa output di atas.');
    process.exit(1);
  } else {
    console.log('Semua test PASS! Siap integrasi ke TanStack Start.');
  }
}

main();
