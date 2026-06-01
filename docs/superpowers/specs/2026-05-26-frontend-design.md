# Frontend Design Spec: IIR Agent Web Fetch RAG Chatbot

## Context

Backend RAG pipeline sudah 100% selesai (NVIDIA NIM, Tavily Extract, Text Splitting, Upstash Redis, Supabase pgvector). Sekarang perlu bangun frontend untuk meng-expose pipeline ini ke user.

**Goal:** Single-page chat UI yang memungkinkan user paste URL (auto-fetch + auto-index), lalu bertanya dari semua URL yang sudah di-index.

---

## Keputusan Desain

| Decision | Choice |
|----------|--------|
| Design system | Ikuti `docs/DESIGN.md` (Anthropic/Claude.com style) |
| Layout | Single-page chat, max-width 720px, centered |
| URL input | Auto-detect URL di chat input (satu input field, dual purpose) |
| URL display | Badges (pills) — compact, skala bagus |
| URL scope | Multiple URLs (stack) — bisa index beberapa URL |
| Chat streaming | Typewriter streaming (SSE) |
| Framework | TanStack Start |

---

## Design Tokens (dari DESIGN.md)

### Colors
- Canvas: `#faf9f5`
- Card: `#efe9de`
- Soft: `#f5f0e8`
- Primary/Coral: `#cc785c`
- Primary Active: `#a9583e`
- Dark Surface: `#181715`
- Hairline: `#e6dfd8`
- Ink: `#141413`
- Body: `#3d3d3a`
- Muted: `#6c6a64`
- Success: `#5db872`
- Warning: `#e8a55a`
- Error: `#c64545`

### Typography
- Display: Cormorant Garamond, weight 500, tracking -0.02em
- Body: Inter, weight 400-500
- Code: JetBrains Mono
- Hierarchy: display-lg(48px), display-md(36px), title-lg(22px), title-md(18px), body-md(16px), body-sm(14px), caption(13px)

### Spacing
- Base unit: 4px
- Card padding: 24px (mobile) / 32px (desktop)
- Section gap: 24px
- Max content width: 720px

### Border Radius
- sm: 6px, md: 8px, lg: 12px, xl: 16px, pill: 9999px

---

## Layout

```
┌──────────────────────────────────────────┐
│            IIR Agent                      │
│        Web Fetch RAG Chatbot              │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │ [badge1] [badge2] [badge3 ⏳]      │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │ User: https://example.com           │  │
│  │       → Auto-indexed: 36 chunks     │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │ User: Apa poin utama?               │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │ Bot: Poin utama adalah...           │  │
│  │ ─────────────────────────           │  │
│  │ Sources: [wikipedia.org (0.85)]     │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │ [Paste URL atau tanyakan...]    [↑] │  │
│  └─────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

---

## Komponen

### 1. `ChatPage` (halaman utama)
- State: `messages[]`, `indexedUrls[]`, `isStreaming`
- Compose: `UrlBadges`, `ChatBox`, `ChatInput`
- Layout: centered, max-width 720px, min-height 100dvh

### 2. `UrlBadges`
- Props: `urls: IndexedUrl[]`
- Render pill badges per URL yang sudah di-index
- Badge: `✓ Title (N chunks)` — green success
- Badge loading: `⏳ Fetching...` — amber warning, dengan pulse animation
- Badge error: `✕ Error` — red error
- Horizontal scroll jika banyak

### 3. `ChatBox`
- Props: `messages: Message[]`, `isStreaming: boolean`
- Render messages: user (right, coral bg) dan bot (left, soft bg)
- Bot message: typewriter streaming effect
- Per bot message: ada `Sources` section di bawah
- Auto-scroll ke bawah saat ada message baru

### 4. `ChatInput`
- Props: `onSubmit(text: string)`, `disabled: boolean`
- Single input field, dual purpose
- Placeholder: "Paste URL atau tanyakan sesuatu..."
- Submit: Enter key atau klik tombol kirim (↑ icon)
- Auto-detect: jika input mengandung URL → trigger fetch-url flow
- Disabled saat streaming

### 5. `SourceList`
- Props: `sources: Source[]`
- Render di dalam bot message, di bawah konten
- Format: `source_name (chunk N, similarity: 0.XX)`
- Style: pill badges, muted colors

---

## UX Flow

### Flow 1: User paste URL
```
1. User paste "https://en.wikipedia.org/wiki/Vector_database" di chat input
2. System detect URL → kirim ke /api/fetch-url
3. Chat input kosongkan, badge muncul: "⏳ Fetching Vector database..."
4. Server: Tavily extract → split → embed (passage) → insert Supabase → cache Redis
5. Badge update: "✓ Vector database (36 chunks)"
6. Bot auto-reply: "URL berhasil di-index. Tanyakan sesuatu tentang halaman ini."
7. Chat input aktif kembali
```

### Flow 2: User tanya pertanyaan
```
1. User ketik "Apa poin utama?" → Enter
2. User message muncul di chat (right, coral)
3. Bot message muncul (left, empty, streaming indicator)
4. Server: embed query → search top-4 → build prompt → stream response
5. Token muncul satu-per-satu (typewriter effect)
6. Setelah selesai, Sources muncul di bawah bot message
7. Auto-scroll ke bawah
```

### Flow 3: User paste URL baru (sudah ada URL lain)
```
1. User paste URL baru
2. Badge baru muncul: "⏳ Fetching..."
3. Proses sama seperti Flow 1
4. Badge lama tetap ada
5. Bot reply: "URL baru berhasil di-index. Sekarang ada 2 sumber."
```

---

## API Integration

### POST `/api/fetch-url`
- Input: `{ url: string }`
- Output: `{ success, title, chunks_count }`
- Flow: rate limit → cache check → Tavily → split → embed (passage) → insert → cache
- Panggil module: `tavily.ts`, `splitter.ts`, `nvidia.ts`, `vector.ts`, `redis.ts`

### POST `/api/chat`
- Input: `{ message: string }`
- Output: SSE stream
- Events: `token {content}`, `sources [{source_name, similarity}]`, `done {success}`
- Flow: rate limit → embed query → search → build prompt → stream
- Panggil module: `chain.ts` → `ragQuery(question)`

---

## State Management

```typescript
interface ChatState {
  messages: Message[];
  indexedUrls: IndexedUrl[];
  isStreaming: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
}

interface IndexedUrl {
  url: string;
  title: string;
  chunks: number;
  status: 'fetching' | 'indexed' | 'error';
}

interface Source {
  sourceName: string;
  similarity: number;
  chunkIndex: number;
}
```

State management: React `useState` + `useReducer` lokal. Tidak perlu global state (single page, tidak ada routing complexity).

---

## Error Handling

| Scenario | UI Behavior |
|----------|-------------|
| URL fetch gagal | Badge: "✕ URL gagal" + error message di chat |
| URL kosong/tidak bisa diekstrak | Bot reply: "Konten URL kosong atau tidak bisa diekstrak" |
| Rate limit exceeded | Bot reply: "Terlalu banyak request. Coba lagi dalam 1 menit." |
| Tidak ada chunk relevan | Bot reply: "Tidak menemukan informasi di URL yang sudah di-index" |
| NVIDIA API error | Bot reply: "Terjadi kesalahan pada AI. Coba lagi." |
| Stream disconnect | Partial response tetap ditampilkan + indicator "⚠️ Stream terputus" |

---

## TanStack Start Structure

```
app/
├── routes/
│   ├── __root.tsx          # Root layout (fonts, global CSS)
│   └── index.tsx           # ChatPage (single page)
├── components/
│   ├── ChatPage.tsx        # Main page component
│   ├── ChatBox.tsx         # Message list + streaming
│   ├── ChatInput.tsx       # Dual-purpose input (URL + question)
│   ├── UrlBadges.tsx       # Indexed URL badges
│   └── SourceList.tsx      # Source display per message
├── lib/
│   ├── nvidia.ts           # (sudah ada)
│   ├── tavily.ts           # (sudah ada)
│   ├── splitter.ts         # (sudah ada)
│   ├── vector.ts           # (sudah ada)
│   ├── redis.ts            # (sudah ada)
│   ├── chain.ts            # (sudah ada)
│   └── db/                 # (sudah ada)
├── routes/
│   └── api/
│       ├── fetch-url.ts    # POST /api/fetch-url
│       └── chat.ts         # POST /api/chat (SSE)
app.config.ts
tsconfig.json
```

---

## Verification

1. `npm run dev` — TanStack Start dev server running
2. Buka browser → paste URL → badge muncul, auto-fetch
3. Ketik pertanyaan → streaming response muncul
4. Paste URL kedua → badge baru muncul
5. Tanya pertanyaan cross-URL → sources dari kedua URL
6. Test error: URL invalid, empty content, rate limit
7. Mobile responsive: layout collapse ke single column
