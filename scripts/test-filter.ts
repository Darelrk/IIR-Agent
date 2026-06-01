import 'dotenv/config';
import { embedText } from '../src/lib/nvidia';
import { searchSimilar } from '../src/lib/vector';

async function main() {
  const query = 'siapa presiden baru indonesia';
  console.log(`Running similarity search for: "${query}"`);

  const queryEmbedding = await embedText(query);

  // Test 1: general search
  console.log('\n--- Test 1: General search (no filter) ---');
  const resultsAll = await searchSimilar(queryEmbedding, 4);
  console.log(`Found ${resultsAll.length} results:`);
  for (const r of resultsAll) {
    console.log(`- ${r.sourceName} (sim: ${r.similarity.toFixed(4)}): ${r.content.slice(0, 100).replace(/\n/g, ' ')}...`);
  }

  // Test 2: filtered search
  console.log('\n--- Test 2: Filtered search (restrict to specific KPU / Kemhan / DPN URLs) ---');
  const filterUrls = [
    'https://kab-jayawijaya.kpu.go.id/blog/read/8295_presiden-ke-8-republik-indonesia-prabowo-subianto',
    'https://www.kemhan.go.id/2024/10/21/pelantikan-prabowo-subianto-dan-gibran-rakabuming-raka-sebagai-presiden-dan-wakil-presiden-ri-2024-2029.html',
    'https://www.dpn.go.id/pelantikan-resmi-prabowo-subianto-dan-gibran-rakabuming-raka-sebagai-presiden-dan-wakil-presiden-ri'
  ];

  const resultsFiltered = await searchSimilar(queryEmbedding, 4, filterUrls);
  console.log(`Found ${resultsFiltered.length} results:`);
  for (const r of resultsFiltered) {
    console.log(`- ${r.sourceName} (sim: ${r.similarity.toFixed(4)}): ${r.content.slice(0, 100).replace(/\n/g, ' ')}...`);
  }
}

main().catch(console.error);
