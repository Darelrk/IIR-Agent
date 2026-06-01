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
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error('EXA_API_KEY tidak ditemukan di environment');

  const res = await fetch('https://api.exa.ai/contents', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ urls, text: true }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Exa extractUrls failed:', res.status, text);
    return [];
  }

  const data = (await res.json()) as {
    results?: Array<{ url: string; title?: string; text?: string }>;
    statuses?: Array<{ id: string; status: string; error?: { tag: string; httpStatusCode?: number } }>;
  };

  if (data.statuses) {
    for (const s of data.statuses) {
      if (s.status === 'error') {
        console.warn(`Exa extract gagal untuk ${s.id}:`, s.error);
      }
    }
  }

  return (data.results || []).map((r) => ({
    url: r.url,
    rawContent: r.text || '',
    title: r.title || '',
  }));
}

export async function searchWeb(
  query: string,
  maxResults = 5,
): Promise<SearchResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error('EXA_API_KEY tidak ditemukan di environment');

  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      type: 'auto',
      numResults: maxResults,
      contents: { highlights: true },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Exa searchWeb failed:', res.status, text);
    return [];
  }

  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      url: string;
      score: number;
      highlights?: string[];
    }>;
  };

  return (data.results || []).map((r) => ({
    title: r.title || '',
    url: r.url,
    content: r.highlights && r.highlights.length > 0 ? r.highlights.join('\n') : '',
    score: r.score || 0,
  }));
}
