import { routeQuery } from '../src/lib/router';

const queries = [
  'siapa presiden baru indonesia',
  'Presiden Indonesia Terakhir (berdasarkan sumber yang tersedia)',
  'who is the last president of US',
  'siapa presiden indonesia yang aktif saat ini',
  'apa perkembangan AI saat ini',
  'siapa presiden indonesia yang menjabat kini',
  'what is ongoing in Jakarta now',
  'what is the recently updated news',
  'siapa presiden pertama indonesia',
  'halo apa kabar',
  'https://google.com'
];

console.log('=== Test Routing Classification ===');
for (const q of queries) {
  const res = routeQuery(q);
  console.log(`Query: "${q}" -> Action: ${res.action}`);
}
