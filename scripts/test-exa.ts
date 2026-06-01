import 'dotenv/config';
import { extractUrls, searchWeb } from '../src/lib/exa';

const apiKey = process.env.EXA_API_KEY;
if (!apiKey) {
  console.error('FAIL: EXA_API_KEY tidak ditemukan di .env');
  process.exit(1);
}

let passed = 0;
let failed = 0;

async function testSearchSingle() {
  console.log('\n--- Test A: Search Web ---');
  try {
    const results = await searchWeb('Retrieval-augmented generation', 3);
    if (results && results.length > 0) {
      console.log(`PASS: Search berhasil`);
      console.log(`  Count: ${results.length}`);
      for (const r of results) {
        console.log(`  - Title: ${r.title}`);
        console.log(`    URL: ${r.url}`);
        console.log(`    Content preview: ${r.content.slice(0, 100)}...`);
        console.log(`    Score: ${r.score}`);
      }
      passed++;
    } else {
      console.log('FAIL: Tidak ada results');
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testExtractSingleUrl() {
  console.log('\n--- Test B: Extract 1 URL ---');
  try {
    const pages = await extractUrls([
      'https://en.wikipedia.org/wiki/Retrieval-augmented_generation',
    ]);

    if (pages && pages.length > 0) {
      const page = pages[0];
      console.log(`PASS: URL berhasil di-fetch`);
      console.log(`  URL: ${page.url}`);
      console.log(`  Title: ${page.title}`);
      console.log(`  Content length: ${page.rawContent?.length || 0} chars`);
      if (page.rawContent && page.rawContent.length > 100) {
        console.log(`PASS: Konten cukup panjang (${page.rawContent.length} chars)`);
        console.log(`  Preview: ${page.rawContent.slice(0, 150)}...`);
        passed++;
      } else {
        console.log('FAIL: Konten terlalu pendek atau kosong');
        failed++;
      }
    } else {
      console.log('FAIL: Tidak ada results');
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('=== Exa Backend Test ===');
  console.log(`API Key: ${apiKey.slice(0, 10)}...`);

  await testSearchSingle();
  await testExtractSingleUrl();

  console.log('\n=== Hasil ===');
  console.log(`PASS: ${passed} | FAIL: ${failed}`);
  if (failed > 0) {
    console.log('Ada test yang gagal. Periksa output di atas.');
    process.exit(1);
  } else {
    console.log('Semua test PASS! Exa Search siap digunakan.');
  }
}

main();
