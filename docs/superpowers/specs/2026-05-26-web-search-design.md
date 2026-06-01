# Design Spec: Combo Web Search + Web Fetch

## Context

Chatbot RAG saat ini hanya mendukung **web fetch** — user paste URL, sistem fetch URL itu saja. User ingin menambah **web search** — user ketik query, sistem cari otomatis via Tavily Search, extract top results, index, lalu jawab.

Tavily SDK v0.7.3 (`@tavily/core`) sudah terinstall dan punya `search()` method — tidak perlu library baru.

---

## Keputusan Desain

| Decision | Choice |
|----------|--------|
| Detection | Regex URL detection — URL → fetch, non-URL → search |
| Flow | Fully automatic — search + extract + index + chat sekaligus |
| Jumlah URL | Top 3 dari search results |
| Library | `@tavily/core` (sudah terinstall) — `client.search()` |

---

## Detection Logic

```typescript
const URL_REGEX = /https?:\/\/[^\s]+/

function handleSubmit(text: string) {
  if (URL_REGEX.test(text)) {
    handleFetchUrl(text)        // existing flow
  } else {
    handleWebSearch(text)       // NEW flow
  }
}
```

---

## Flow: Web Search

```
User ketik query (bukan URL)
  → Tampilkan user message di chat
  → Badge: "⏳ Searching: [query]..."
  → POST /api/web-search { query }
  → Server: Tavily search(query, { maxResults: 5 })
  → Server: Ambil top 3 URLs dari results
  → Server: Loop setiap URL:
      a. Tavily extract([url]) — ambil full content
      b. RecursiveCharacterTextSplitter (1000/200)
      c. NVIDIA embedPassage untuk setiap chunk
      d. INSERT ke Supabase documents
      e. Cache metadata ke Redis
  → Return { success, urls: [{url, title, chunks}], total_chunks }
  → Badge update: "✓ N URL ter-index (X chunks total)"
  → System message: "Web search: N URL berhasil di-index"
  → Auto-call /api/chat dengan query asli → streaming response
```

---

## New API: POST `/api/web-search`

**Input:**
```json
{ "query": "siapa presiden Indonesia" }
```

**Success:**
```json
{
  "success": true,
  "query": "siapa presiden Indonesia",
  "urls": [
    { "url": "https://...", "title": "...", "chunks_count": 24 },
    { "url": "https://...", "title": "...", "chunks_count": 18 },
    { "url": "https://...", "title": "...", "chunks_count": 22 }
  ],
  "total_chunks": 64
}
```

**Error:**
```json
{ "success": false, "error": "Tidak ada hasil ditemukan untuk query tersebut" }
```

---

## New Module: `src/lib/tavily.ts` (update)

```typescript
export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
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
```

---

## Files Changed

| # | File | Action | Purpose |
|---|------|--------|---------|
| 1 | `src/lib/tavily.ts` | Edit | Tambah `searchWeb()` + `SearchResult` interface |
| 2 | `src/routes/api/web-search.ts` | **Buat** | Server function: search → extract → chunk → embed → store |
| 3 | `src/routes/index.tsx` | Edit | Tambah `handleWebSearch()`, update detection logic |
| 4 | `docs/prd.md` | Edit | Update scope: web search masuk In Scope |

---

## UX

### Badge States
- `⏳ Searching: "siapa presiden..."` — amber, pulse animation
- `✓ Wikipedia: Presiden Indonesia (24 chunks)` — green per URL
- `✕ Error: search gagal` — red

### System Messages
- Success: "Web search: **3 URL** berhasil di-index (**64 chunks** total)."
- Partial: "Web search: 2 dari 3 URL berhasil di-index. 1 URL gagal di-fetch."
- Error: "Web search gagal: Tidak ada hasil ditemukan."

### Auto-Chat
Setelah web search + index selesai, otomatis kirim query ke `/api/chat` supaya user langsung dapat jawaban.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Search returns 0 results | Error: "Tidak ada hasil ditemukan" |
| All 3 URLs gagal extract | Error: "Semua URL gagal di-fetch" |
| 1-2 URL gagal, sisanya OK | Partial success + warning |
| Rate limit exceeded | 429 error |
| Tavily API down | 502 error |

---

## Verification

1. Ketik "siapa presiden Indonesia" → search → 3 URL ter-index → jawaban streaming
2. Ketik URL langsung → fetch (existing flow tetap jalan)
3. Ketik query yang tidak ada hasilnya → error jelas
4. Badge states: fetching → indexed/error
5. Auto-chat setelah search selesai
