import 'dotenv/config';
import { getRedis, getCachedUrl, setCachedUrl, deleteCachedUrl, checkRateLimit } from '../app/lib/redis';

let passed = 0;
let failed = 0;

async function testConnection() {
  console.log('\n--- Test A: Connection ---');
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    if (pong === 'PONG') {
      console.log('PASS: Redis connected');
      passed++;
    } else {
      console.log(`FAIL: Unexpected ping response: ${pong}`);
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testUrlCache() {
  console.log('\n--- Test B: URL Cache ---');
  const testUrl = 'https://example.com/test-article';
  try {
    // Clean up first
    await deleteCachedUrl(testUrl);

    // Should be null initially
    const before = await getCachedUrl(testUrl);
    if (before !== null) {
      console.log(`FAIL: Expected null before set, got: ${JSON.stringify(before)}`);
      failed++;
      return;
    }

    // Set cache
    await setCachedUrl(testUrl, {
      url: testUrl,
      title: 'Test Article',
      chunks: 5,
      fetchedAt: new Date().toISOString(),
    });

    // Get cache
    const after = await getCachedUrl(testUrl);
    if (after && after.title === 'Test Article' && after.chunks === 5) {
      console.log(`PASS: Cache set + get berhasil`);
      console.log(`  ${JSON.stringify(after)}`);
      passed++;
    } else {
      console.log(`FAIL: Cache data mismatch: ${JSON.stringify(after)}`);
      failed++;
    }

    // Cleanup
    await deleteCachedUrl(testUrl);
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testCacheTTL() {
  console.log('\n--- Test C: Cache TTL ---');
  const testUrl = 'https://example.com/ttl-test';
  try {
    await deleteCachedUrl(testUrl);

    // Set with 2 second TTL
    await setCachedUrl(testUrl, {
      url: testUrl,
      title: 'TTL Test',
      chunks: 1,
      fetchedAt: new Date().toISOString(),
    }, 2);

    // Should exist now
    const immediate = await getCachedUrl(testUrl);
    if (immediate) {
      console.log(`  Cache exists immediately: OK`);
    }

    // Wait 3 seconds
    await new Promise((r) => setTimeout(r, 3000));

    // Should be gone
    const afterTTL = await getCachedUrl(testUrl);
    if (afterTTL === null) {
      console.log(`PASS: Cache expired after TTL`);
      passed++;
    } else {
      console.log(`FAIL: Cache still exists after TTL`);
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testRateLimit() {
  console.log('\n--- Test D: Rate Limiting ---');
  const testId = `test-${Date.now()}`;
  try {
    // First 3 requests should be allowed (limit=3, window=10s)
    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit(testId, 3, 10);
      if (!result.allowed) {
        console.log(`FAIL: Request ${i + 1} should be allowed`);
        failed++;
        return;
      }
    }

    // 4th should be blocked
    const blocked = await checkRateLimit(testId, 3, 10);
    if (!blocked.allowed) {
      console.log(`PASS: Rate limit works - 4th request blocked`);
      console.log(`  Remaining: ${blocked.remaining}, Reset in: ${blocked.resetIn}s`);
      passed++;
    } else {
      console.log(`FAIL: 4th request should be blocked`);
      failed++;
    }
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('=== Upstash Redis Backend Test ===');

  const url = process.env.UPSTASH_REDIS_REST_URL;
  if (!url) {
    console.error('FAIL: UPSTASH_REDIS_REST_URL tidak ditemukan di .env');
    console.error('Tambahkan UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN ke .env');
    process.exit(1);
  }
  console.log(`Redis URL: ${url.slice(0, 30)}...`);

  await testConnection();
  await testUrlCache();
  await testCacheTTL();
  await testRateLimit();

  console.log('\n=== Hasil ===');
  console.log(`PASS: ${passed} | FAIL: ${failed}`);
  if (failed > 0) {
    console.log('Ada test yang gagal.');
    process.exit(1);
  } else {
    console.log('Semua test PASS! Redis siap integrasi.');
  }
}

main();
