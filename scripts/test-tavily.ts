import 'dotenv/config';
import { tavily } from '@tavily/core';

const apiKey = process.env.TAVILY_API_KEY;
if (!apiKey) {
  console.error('FAIL: TAVILY_API_KEY tidak ditemukan di .env');
  process.exit(1);
}

const tvly = tavily({ apiKey });

let passed = 0;
let failed = 0;

async function testExtractSingleUrl() {
  console.log('\n--- Test A: Extract 1 URL ---');
  try {
    const result = await tvly.extract([
      'https://en.wikipedia.org/wiki/Retrieval-augmented_generation',
    ]);

    if (result.results && result.results.length > 0) {
      const page = result.results[0];
      console.log(`PASS: URL berhasil di-fetch`);
      console.log(`  URL: ${page.url}`);
      console.log(`  Raw content length: ${page.rawContent?.length || 0} chars`);
      if (page.rawContent && page.rawContent.length > 100) {
        console.log(`PASS: Konten cukup panjang (${page.rawContent.length} chars)`);
        console.log(`  Preview: ${page.rawContent.slice(0, 150)}...`);
        passed++;
      } else {
        console.log('FAIL: Konten terlalu pendek atau kosong');
        failed++;
      }
      passed++;
    } else {
      console.log('FAIL: Tidak ada results');
      failed++;
    }

    if (result.failedResults && result.failedResults.length > 0) {
      console.log(`  Warning: ${result.failedResults.length} URL gagal`);
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testExtractMultipleUrls() {
  console.log('\n--- Test B: Extract Multiple URLs ---');
  try {
    const result = await tvly.extract([
      'https://en.wikipedia.org/wiki/Artificial_intelligence',
      'https://en.wikipedia.org/wiki/Machine_learning',
    ]);

    console.log(`  Successful: ${result.results?.length || 0}`);
    console.log(`  Failed: ${result.failedResults?.length || 0}`);

    if (result.results && result.results.length >= 1) {
      console.log(`PASS: Minimal 1 URL berhasil di-fetch`);
      for (const page of result.results) {
        console.log(`  - ${page.url} (${page.rawContent?.length || 0} chars)`);
      }
      passed++;
    } else {
      console.log('FAIL: Tidak ada URL yang berhasil');
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testExtractErrorHandling() {
  console.log('\n--- Test C: Error Handling ---');

  // Test invalid URL
  try {
    const result = await tvly.extract(['https://this-url-definitely-does-not-exist-12345.com']);
    if (result.failedResults && result.failedResults.length > 0) {
      console.log(`PASS: Invalid URL masuk failedResults (expected)`);
      passed++;
    } else if (result.results && result.results.length === 0) {
      console.log(`PASS: Invalid URL return empty results (expected)`);
      passed++;
    } else {
      console.log('FAIL: Seharusnya gagal untuk URL invalid');
      failed++;
    }
  } catch (err: any) {
    console.log(`PASS: Error untuk URL invalid: ${err.message.slice(0, 80)}`);
    passed++;
  }
}

async function testExtractMarkdownFormat() {
  console.log('\n--- Test D: Extract dengan format markdown ---');
  try {
    const result = await tvly.extract(
      ['https://en.wikipedia.org/wiki/Vector_database'],
      { extractDepth: 'advanced', format: 'markdown' },
    );

    if (result.results && result.results.length > 0) {
      const page = result.results[0];
      console.log(`PASS: Extract advanced + markdown berhasil`);
      console.log(`  URL: ${page.url}`);
      console.log(`  Content length: ${page.rawContent?.length || 0} chars`);
      console.log(`  Preview: ${page.rawContent?.slice(0, 150)}...`);
      passed++;
    } else {
      console.log('FAIL: Tidak ada results untuk advanced extract');
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('=== Tavily Extract Backend Test ===');
  console.log(`API Key: ${apiKey.slice(0, 10)}...`);

  await testExtractSingleUrl();
  await testExtractMultipleUrls();
  await testExtractErrorHandling();
  await testExtractMarkdownFormat();

  console.log('\n=== Hasil ===');
  console.log(`PASS: ${passed} | FAIL: ${failed}`);
  if (failed > 0) {
    console.log('Ada test yang gagal. Periksa output di atas.');
    process.exit(1);
  } else {
    console.log('Semua test PASS! Tavily Extract siap integrasi.');
  }
}

main();
