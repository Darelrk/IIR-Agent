import { tavily, type TavilyClient } from '@tavily/core';

let _client: TavilyClient | null = null;

function getClient(): TavilyClient {
  if (!_client) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error('TAVILY_API_KEY tidak ditemukan di environment');
    _client = tavily({ apiKey });
  }
  return _client;
}

export interface FetchedPage {
  url: string;
  rawContent: string;
  title: string;
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export async function extractUrls(urls: string[]): Promise<FetchedPage[]> {
  const client = getClient();
  const result = await client.extract(urls, {
    extractDepth: 'advanced',
    format: 'markdown',
  });

  if (result.failedResults && result.failedResults.length > 0) {
    for (const f of result.failedResults) {
      console.warn(`Tavily extract gagal: ${f.url} - ${f.error}`);
    }
  }

  return (result.results || []).map((r) => {
    // Tavily extract may or may not return a title field; cast defensively
    const tavilyTitle = (r as { title?: string }).title;
    return {
      url: r.url,
      rawContent: r.rawContent || '',
      title: tavilyTitle || '',
    };
  });
}

export async function searchWeb(
  query: string,
  maxResults = 5,
): Promise<SearchResult[]> {
  const client = getClient();
  const result = await client.search(query, {
    searchDepth: 'advanced',
    maxResults,
    includeRawContent: false,
  });

  return result.results.map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score,
  }));
}
