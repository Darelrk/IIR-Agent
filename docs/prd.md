# PRD: Web Fetch & Search RAG AI Chatbot

## 1. Ringkasan

Chatbot Retrieval-Augmented Generation (RAG) yang memungkinkan user memberikan URL atau mengetik query pencarian, lalu bertanya seputar konten halaman web yang sudah di-index. Sistem mendukung dua mode input:

1. **Web Fetch**: User paste URL → Tavily Extract ambil konten → chunk → embed → store.
2. **Web Search**: User ketik query → Tavily Search cari URL relevan → auto-extract top 3 → chunk → embed → store → auto-jawab.

Produk ini dibuat sebagai MVP yang ringan, cepat selesai, dan cocok dideploy ke Vercel. Fokus utama v1 adalah membuktikan workflow RAG end-to-end: input URL/query, ekstraksi konten, penyimpanan vector, retrieval relevan, dan jawaban streaming dari LLM.

## 2. Latar Belakang

User membutuhkan chatbot yang bisa menjawab berdasarkan sumber pengetahuan spesifik dari halaman web yang URL-nya diberikan oleh user. MVP tidak membutuhkan upload file, parsing dokumen lokal, OCR, crawling, atau web search penuh.

Karena target deployment adalah Vercel serverless, proses yang berat seperti crawling/search web dan parsing file besar tidak menjadi fokus. Untuk konten web, sistem hanya melakukan fetch terhadap URL yang diberikan user menggunakan layanan cloud Tavily Extract agar backend tetap ringan.

## 3. Tujuan Produk

### 3.1 Tujuan Utama

- Membuat chatbot RAG yang bisa menjawab berdasarkan konten URL yang telah di-index.
- Mendukung input URL untuk mengambil konten halaman web via Tavily Extract.
- Menyimpan chunk dan embedding ke Supabase pgvector.
- Menggunakan NVIDIA NIM untuk embedding dan chat completion.
- Memberikan jawaban secara streaming agar terasa responsif.
- Menjaga scope tetap minimal agar MVP cepat selesai.

### 3.2 Kriteria Sukses MVP

MVP dianggap berhasil jika:

- User bisa input 1 URL dan sistem berhasil mengambil konten, chunking, embedding, dan menyimpannya.
- User bisa bertanya setelah URL di-index dan mendapat jawaban berbasis context dari halaman tersebut.
- Jawaban menyertakan sumber chunk/URL yang digunakan.
- Chat response berjalan streaming dari server ke UI.
- Aplikasi bisa berjalan lokal dan siap dideploy ke Vercel.

## 4. Scope

### 4.1 In Scope v1

- Fetch konten dari URL yang diberikan user.
- **Web search otomatis**: user ketik query (bukan URL), sistem cari via Tavily Search, extract top 3 URL, index otomatis.
- Validasi URL sebelum diproses.
- Ekstraksi konten halaman web menggunakan Tavily Extract.
- Chunking konten web dengan overlap.
- Embedding chunk menggunakan NVIDIA NIM embedding model.
- Storage chunk + metadata + embedding ke Supabase pgvector.
- Similarity search dengan cosine distance.
- Chat RAG dengan top-k context.
- Streaming response dari LLM ke UI.
- UI single-page: input URL/query, status indexing, chat box, source display.
- Tanpa login/authentication.
- Tanpa persistent chat history.

### 4.2 Out of Scope v1

- Upload file PDF/DOCX/TXT/CSV.
- Parsing dokumen lokal.
- OCR gambar/scanned PDF.
- Supabase Storage untuk file.
- Autentikasi user.
- Multi-user isolation.
- Multi-session / multi-project workspace.
- Persistent chat history.
- Crawling link lain dari halaman yang di-fetch.
- Background job queue.
- Admin dashboard.
- Fine-tuning model.
- Reranker khusus.

## 5. Tech Stack

| Layer | Teknologi | Keterangan |
|-------|-----------|------------|
| Framework | **TanStack Start** | TypeScript, file-based routing, server functions, SSR |
| UI | **React + TanStack Start** | Single-page chat UI dengan server functions |
| RAG Engine | **LangChain.js** | Text splitting, prompt assembly, retrieval pipeline |
| LLM | **NVIDIA NIM** (`nvidia/nemotron-3-super-120b-a12b`) | Cloud API, OpenAI-compatible endpoint |
| Embedding | **NVIDIA NIM** (`nvidia/nv-embedqa-e5-v5`) | 1024 dimensi, cocok untuk QA retrieval |
| Web Fetch | **Tavily Extract** | Fetch konten URL via cloud, tidak membebani server |
| Web Search | **Tavily Search** | Cari URL relevan dari query, cloud-based |
| Vector DB | **Supabase pgvector** | PostgreSQL + vector extension |
| Deployment | **Vercel** | Serverless deployment |
| Auth | Tidak ada | Langsung pakai untuk MVP |

### 5.1 Alasan Pemilihan Stack

- **TanStack Start** dipilih karena user ingin stack modern TypeScript dengan routing dan server function tanpa memakai Next.js.
- **LangChain.js** dipilih agar text splitting dan pipeline RAG tetap berada dalam ekosistem JavaScript/TypeScript.
- **NVIDIA NIM** dipilih karena menyediakan model LLM dan embedding via cloud API yang kompatibel dengan OpenAI SDK.
- **Tavily Extract** dipilih karena web fetch dilakukan di cloud, sehingga backend Vercel tidak perlu parsing halaman berat.
- **Supabase pgvector** dipilih karena mudah dipakai, gratis untuk MVP, dan cukup untuk vector search sederhana.

## 6. Model dan API AI

### 6.1 Chat Model

Model chat utama:

```txt
nvidia/nemotron-3-super-120b-a12b
```

Endpoint NVIDIA NIM OpenAI-compatible:

```txt
https://integrate.api.nvidia.com/v1
```

Parameter awal yang direkomendasikan:

```txt
temperature: 0.2-0.7
top_p: 0.95
max_tokens: 4096-8192
stream: true
```

Catatan:

- Untuk jawaban RAG, temperature sebaiknya rendah/menengah agar model lebih patuh terhadap context.
- Streaming harus diaktifkan untuk endpoint chat agar UI terasa responsif.
- Jika model mengembalikan reasoning internal, UI hanya perlu menampilkan jawaban final kecuali nanti user ingin menampilkan reasoning.

### 6.2 Embedding Model

Model embedding utama:

```txt
nvidia/nv-embedqa-e5-v5
```

Spesifikasi:

- Dimensi embedding: `1024`.
- Disimpan di kolom `VECTOR(1024)` pada Supabase pgvector.
- Digunakan untuk embedding chunk konten URL dan embedding query user.

Catatan penting:

- Jangan memakai nama model `NV-Embed-QA` untuk implementasi final karena model tersebut pernah gagal/404 pada pengujian sebelumnya.
- Gunakan nama model lengkap `nvidia/nv-embedqa-e5-v5`.

## 7. Fitur

### 7.1 Web Fetch URL

User dapat memasukkan URL sebagai sumber knowledge base RAG.

Behavior:

- Server menerima `{ url: string }`.
- Server memvalidasi URL.
- Server memanggil Tavily Extract.
- Tavily mengembalikan `raw_content`, title, dan metadata URL.
- Konten dipecah menjadi chunk.
- Setiap chunk dibuat embedding.
- Chunk disimpan ke Supabase.
- UI menampilkan judul halaman dan jumlah chunk.

Batasan:

- Hanya fetch URL yang diberikan user.
- Tidak melakukan web search.
- Tidak crawling link lain di dalam halaman.
- Jika halaman tidak bisa diekstrak, tampilkan error yang jelas.

Metadata minimal:

```json
{
  "source_type": "url",
  "source_name": "https://example.com/article",
  "title": "Example Article",
  "chunk_index": 0,
  "total_chunks": 8
}
```

### 7.2 Chat RAG

User dapat bertanya setelah ada URL yang di-index.

Behavior:

- Server menerima message user.
- Message dibuat embedding.
- Server mencari chunk paling relevan di Supabase dengan similarity search.
- Top-k chunk digabung menjadi context.
- Context dan pertanyaan dikirim ke NVIDIA NIM chat model.
- Server mengirim jawaban secara streaming ke UI.
- UI menampilkan jawaban dan sumber yang digunakan.

Default retrieval:

```txt
top_k: 4
similarity: cosine
chunk_size: 1000
chunk_overlap: 200
```

### 7.3 Source Display

Setiap jawaban chat sebaiknya menampilkan sumber context agar user bisa memahami asal jawaban.

Informasi sumber minimal:

- `source_name` atau URL.
- `source_type` bernilai `url`.
- `title` jika tersedia.
- `chunk_index`.
- `similarity_score`.
- potongan preview content opsional.

Contoh:

```json
{
  "source_name": "https://example.com/article",
  "source_type": "url",
  "title": "Example Article",
  "chunk_index": 3,
  "similarity_score": 0.82
}
```

## 8. Arsitektur

```txt
Browser (TanStack Start UI)
  │
  ├── Input URL ────→ Server Function /api/fetch-url
  │                     → Tavily Extract
  │                     → RecursiveCharacterTextSplitter
  │                     → NVIDIA NIM embedding
  │                     → Supabase pgvector insert
  │
  ├── Input Query ──→ Server Function /api/web-search
  │                     → Tavily Search (top 3 URLs)
  │                     → Tavily Extract (per URL)
  │                     → RecursiveCharacterTextSplitter
  │                     → NVIDIA NIM embedding
  │                     → Supabase pgvector insert
  │                     → Auto-trigger chat
  │
  └── Chat ─────────→ Server Function /api/chat
                        → NVIDIA NIM embed query
                        → Supabase match_documents RPC
                        → Build RAG prompt
                        → NVIDIA NIM chat completion streaming
                        → SSE stream response to UI
```

### 8.1 Prinsip Arsitektur

- Semua API key hanya digunakan di server function.
- Browser tidak boleh memanggil NVIDIA, Tavily, atau Supabase write API secara langsung.
- Backend hanya memproses URL yang diberikan user.
- Supabase menyimpan hasil akhir yang diperlukan untuk RAG: content chunk, embedding, metadata.
- Setiap modul dipisah agar mudah diuji:
  - `embedding.ts` untuk embedding.
  - `splitter.ts` untuk chunking.
  - `vector.ts` untuk insert/search Supabase.
  - `tavily.ts` untuk extract URL.
  - `chain.ts` untuk prompt dan chat RAG.

## 9. Flow Data

### 9.1 Web Fetch

```txt
User input URL
  → UI kirim { url } ke /api/fetch-url
  → Server validasi URL
  → Server panggil Tavily Extract dengan urls: [url]
  → Tavily return raw_content + title
  → Server cek raw_content tidak kosong
  → RecursiveCharacterTextSplitter(chunk_size=1000, overlap=200)
  → NVIDIA embedding untuk setiap chunk
  → INSERT chunk + embedding + metadata ke Supabase documents
  → Return { success, title, chunks_count }
```

Failure cases:

- URL invalid.
- Tavily gagal fetch.
- Konten kosong atau terlalu pendek.
- Halaman diblokir.
- Embedding/insert gagal.

### 9.2 Chat

```txt
User kirim message
  → UI POST /api/chat
  → Server validasi message tidak kosong
  → NVIDIA embedding untuk query
  → Supabase similarity search top-k=4
  → Format context dari chunk relevan
  → Build system prompt + user message
  → NVIDIA NIM chat completions stream
  → Server teruskan token stream ke UI
  → Di akhir stream, server kirim sources
```

Failure cases:

- Message kosong.
- Belum ada URL di-index.
- Retrieval tidak menemukan chunk relevan.
- NVIDIA chat API gagal.
- Stream terputus.

## 10. Struktur Proyek

```txt
iir-agent/
├── app/
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx              # Halaman utama chat UI
│   │   └── api/
│   │       ├── fetch-url.ts       # Server function: fetch URL
│   │       └── chat.ts            # Server function: chat streaming
│   ├── lib/
│   │   ├── langchain/
│   │   │   ├── chain.ts           # RAG prompt + chat completion
│   │   │   ├── embedding.ts       # NVIDIA embedding wrapper
│   │   │   └── splitter.ts        # Content chunking
│   │   ├── loaders/
│   │   │   └── url.ts             # Tavily-loaded document normalization
│   │   ├── supabase/
│   │   │   ├── client.ts          # Supabase server client
│   │   │   └── vector.ts          # Vector insert/search operations
│   │   ├── nvidia.ts              # OpenAI SDK client for NVIDIA NIM
│   │   └── tavily.ts              # Tavily Extract client
│   └── components/
│       ├── ChatBox.tsx            # Render messages + sources
│       ├── ChatInput.tsx          # Input pertanyaan
│       ├── UrlInput.tsx           # Input URL + status
│       └── SourceList.tsx         # List sumber jawaban
├── docs/
│   ├── prd.md
│   └── DESIGN.md
├── public/
├── app.config.ts
├── package.json
└── tsconfig.json
```

## 11. Schema Supabase

### 11.1 Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 11.2 Table: documents

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type = 'url'),
  source_name TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Catatan:

- `source_type` v1 hanya menerima `url`.
- `source_name` berisi URL asli atau canonical URL hasil Tavily jika tersedia.
- `metadata` menyimpan title, chunk index, total chunks, dan metadata lain dari Tavily.

### 11.3 Index

```sql
CREATE INDEX documents_embedding_idx
ON documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

Catatan:

- Untuk data kecil, index belum terlalu penting, tetapi tetap disiapkan agar query similarity lebih siap saat data bertambah.
- Setelah insert data cukup banyak, jalankan `ANALYZE documents;` agar planner Postgres lebih optimal.

### 11.4 RPC: match_documents

Similarity search sebaiknya dibungkus dalam Postgres function agar server function cukup memanggil RPC.

```sql
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding VECTOR(1024),
  match_count INT DEFAULT 4
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  source_name TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    documents.id,
    documents.source_type,
    documents.source_name,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### 11.5 Data Retention v1

Untuk MVP, semua URL dapat disimpan dalam satu table global tanpa user/session isolation. Jika nanti ditambah auth atau multi-session, schema perlu ditambah:

- `user_id`.
- `session_id` atau `workspace_id`.
- `document_id` parent table.
- delete/re-index flow.

## 12. API / Server Functions

### 12.1 Ringkasan Endpoint

| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/api/fetch-url` | POST | `{ url: string }` | `{ success, title, chunks_count }` |
| `/api/web-search` | POST | `{ query: string }` | `{ success, query, urls: [{url, title, chunks_count}], total_chunks }` |
| `/api/chat` | POST | `{ message: string }` | SSE/stream: token content + final sources |

### 12.2 POST `/api/fetch-url`

Request:

```json
{
  "url": "https://example.com/article"
}
```

Validasi:

- URL wajib ada.
- URL harus valid dan memakai `http` atau `https`.
- URL tidak boleh kosong.
- Untuk MVP, cukup proses satu URL per request.

Success response:

```json
{
  "success": true,
  "title": "Example Article",
  "source_name": "https://example.com/article",
  "chunks_count": 8
}
```

Error response:

```json
{
  "success": false,
  "error": "Konten URL kosong atau tidak bisa diekstrak"
}
```

### 12.3 POST `/api/chat`

Request:

```json
{
  "message": "Apa poin utama halaman ini?"
}
```

Streaming output dapat memakai Server-Sent Events atau readable stream. Format event yang disarankan:

```txt
event: token
data: {"content":"Poin"}

event: token
data: {"content":" utama"}

event: sources
data: {"sources":[{"source_name":"https://example.com/article","chunk_index":0,"similarity":0.82}]}

event: done
data: {"success":true}
```

Jika tidak memakai SSE event names, minimal response stream tetap harus bisa membedakan:

- token jawaban.
- metadata sources.
- done/error.

Error response non-stream:

```json
{
  "success": false,
  "error": "Belum ada URL yang di-index"
}
```

## 13. Prompting dan Retrieval Strategy

### 13.1 System Prompt Awal

```txt
Kamu adalah asisten RAG. Jawab pertanyaan user hanya berdasarkan context dari URL yang sudah di-index.
Jika context tidak cukup untuk menjawab, katakan bahwa informasi tersebut tidak ditemukan di sumber URL.
Gunakan Bahasa Indonesia kecuali user meminta bahasa lain.
Jawaban harus ringkas, akurat, dan menyebutkan sumber jika tersedia.
```

### 13.2 Context Format

Context sebaiknya diformat dengan penanda sumber agar model bisa mengaitkan jawaban dengan chunk.

```txt
[Source 1]
Nama: https://example.com/article
Judul: Example Article
Tipe: url
Chunk: 0
Konten:
...

[Source 2]
Nama: https://example.com/article
Judul: Example Article
Tipe: url
Chunk: 1
Konten:
...
```

### 13.3 Retrieval Defaults

| Parameter | Nilai Awal | Catatan |
|-----------|------------|---------|
| chunk_size | 1000 | cukup besar untuk konteks paragraf |
| chunk_overlap | 200 | menjaga kontinuitas antar chunk |
| top_k | 4 | hemat token untuk MVP |
| similarity metric | cosine | sesuai pgvector `vector_cosine_ops` |
| minimum similarity | opsional 0.2-0.4 | bisa ditambah jika jawaban terlalu ngawur |

### 13.4 Jika Context Tidak Cukup

Model harus menjawab seperti:

```txt
Saya tidak menemukan informasi tersebut di URL yang sudah di-index.
```

Jangan memaksa jawaban dari pengetahuan umum jika pertanyaan jelas meminta informasi dari sumber URL.

## 14. UI / UX

Desain visual mengacu pada design system di [`docs/DESIGN.md`](./DESIGN.md) — Anthropic/Claude.com: warm cream canvas (`#faf9f5`), coral accent (`#cc785c`), dark navy surfaces (`#181715`), Cormorant Garamond + Inter, color-block depth tanpa shadow.

Spesifikasi komponen visual (ChatBox, ChatInput, UrlInput, SourceList) mengikuti tokens dan pola dari `docs/DESIGN.md`. PRD ini hanya menjelaskan kebutuhan fungsional UI agar tidak menduplikasi design system.

### 14.1 Layout MVP

Halaman utama terdiri dari:

1. Header sederhana dengan nama produk.
2. Panel web fetch:
   - Input URL.
   - Tombol fetch/index.
   - Status indexing terakhir.
3. Chat area:
   - List pesan user dan assistant.
   - Streaming assistant message.
   - Source list per jawaban.
4. Chat input sticky di bagian bawah area chat.

### 14.2 State UI

UI perlu menangani state berikut:

- Idle: belum ada proses.
- Fetching/indexing: URL sedang diambil dan diproses.
- Index success: tampilkan title/source dan jumlah chunk.
- Index error: tampilkan error jelas.
- Chat loading: response sedang streaming.
- Chat done: tampilkan jawaban dan sumber.
- Chat error: tampilkan error tanpa menghapus pesan user.

## 15. Environment Variables

```txt
NVIDIA_API_KEY=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
TAVILY_API_KEY=tvly-...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
```

Catatan:

- Semua environment variable dipakai di server side.
- Jangan expose API key ke client bundle.
- Jika nanti butuh operasi Supabase yang lebih privileged, dapat ditambah `SUPABASE_SERVICE_ROLE_KEY` khusus server, tetapi untuk MVP awal cukup mengikuti env di atas.
- Di Vercel, semua env harus diisi pada Project Settings → Environment Variables.

## 16. Error Handling

### 16.1 Prinsip Error

- Error harus jelas untuk user, tetapi tidak membocorkan stack trace/API key.
- Server log boleh menyimpan detail teknis untuk debugging.
- UI harus tetap stabil meski fetch/chat gagal.
- Jika sebagian chunk gagal disimpan, response harus menyatakan proses gagal agar data tidak setengah valid tanpa diketahui user.

### 16.2 Error Message yang Disarankan

| Kasus | Pesan User |
|-------|------------|
| URL invalid | `URL tidak valid.` |
| Tavily gagal | `Konten URL tidak bisa diambil.` |
| Konten kosong | `Konten URL kosong atau tidak bisa diekstrak.` |
| Belum ada URL | `Belum ada URL yang di-index. Masukkan URL terlebih dahulu.` |
| Retrieval kosong | `Tidak ditemukan konteks relevan dari URL.` |
| LLM gagal | `AI gagal menjawab saat ini. Coba lagi.` |

## 17. Batasan Teknis dan Risiko

### 17.1 Vercel Serverless

Risiko:

- Timeout saat proses fetch/index URL terlalu lama.
- Request ke Tavily/NVIDIA bisa lambat.
- Streaming behavior perlu diuji di deployment.

Mitigasi MVP:

- Proses satu URL per request.
- Batasi panjang konten yang di-index jika Tavily mengembalikan konten sangat besar.
- Chunk dan embed secara sederhana.
- Tampilkan error jelas jika fetch/index gagal.

### 17.2 Supabase Free Tier

Risiko:

- Storage database terbatas.
- Query vector bisa lambat jika data bertambah banyak.
- Tidak ada isolation user di v1.

Mitigasi MVP:

- Fokus data kecil untuk demo/MVP.
- Simpan hanya content chunk, embedding, dan metadata penting.
- Tambahkan cleanup manual nanti jika diperlukan.

### 17.3 Akurasi RAG

Risiko:

- Jawaban hallucination jika context kurang relevan.
- Chunk terlalu besar/kecil bisa menurunkan retrieval.
- Konten hasil ekstraksi halaman web bisa tidak rapi.

Mitigasi MVP:

- System prompt melarang jawaban di luar context.
- Tampilkan sources agar user bisa verifikasi.
- Mulai dari chunk size 1000 overlap 200, lalu tuning setelah testing.

## 18. Testing Plan

### 18.1 API Connectivity

- Test NVIDIA chat completion dengan model `nvidia/nemotron-3-super-120b-a12b`.
- Test NVIDIA embedding dengan model `nvidia/nv-embedqa-e5-v5`.
- Test Tavily Extract dengan 1 URL publik.
- Test Supabase connection dan pgvector extension.

### 18.2 Web Fetch Tests

- Input URL valid → konten berhasil diambil.
- Input URL valid → chunk berhasil tersimpan.
- Input URL invalid → error benar.
- URL yang tidak bisa diekstrak → error benar.
- URL dengan konten pendek/kosong → error benar.

### 18.3 Chat Tests

- Tanya pertanyaan yang jawabannya ada di URL → jawaban benar + sources muncul.
- Tanya pertanyaan yang tidak ada di URL → model mengaku tidak menemukan informasi.
- Tanya sebelum ada URL di-index → error `Belum ada URL yang di-index`.
- Streaming token muncul bertahap di UI.
- Sources dikirim di akhir stream.

### 18.4 Deployment Tests

- Build lokal berhasil.
- Deploy Vercel berhasil.
- Env production terbaca.
- Fetch/chat berjalan di environment Vercel.
- Streaming tetap berjalan di production.

## 19. Acceptance Criteria

### 19.1 Fetch URL

- User dapat memasukkan URL.
- Sistem mengambil konten melalui Tavily.
- Sistem menampilkan title/source dan jumlah chunk.
- Data chunk masuk ke table `documents`.
- Error URL invalid atau konten kosong tampil jelas.

### 19.2 Chat

- User dapat mengirim pertanyaan.
- Sistem mengambil top-k chunk dari Supabase.
- Jawaban dikirim streaming.
- Jawaban relevan dengan konten URL.
- Sources ditampilkan di bawah jawaban.
- Jika context tidak cukup, sistem tidak mengarang.

### 19.3 UI

- UI mengikuti referensi `docs/DESIGN.md`.
- Status fetch/chat terlihat jelas.
- Error tampil tanpa crash.
- Layout usable di desktop dan mobile dasar.

## 20. Roadmap Setelah MVP

Jika MVP web fetch sudah stabil, fitur lanjutan yang bisa dipertimbangkan:

1. Auth dan user-specific source isolation.
2. Persistent chat history.
3. Multiple knowledge base/session.
4. Delete/re-index URL.
5. Web search opsional.
6. Crawling terbatas untuk halaman dalam domain yang sama.
7. Upload file PDF/DOCX/TXT/CSV.
8. Background queue untuk ingestion besar.
9. Reranking hasil retrieval.
10. Admin dashboard untuk melihat sumber dan chunk.

## 21. Catatan Implementasi Awal

Prioritas implementasi yang disarankan:

1. Setup project TanStack Start.
2. Setup Supabase schema + `match_documents` RPC.
3. Buat NVIDIA client via OpenAI SDK.
4. Test chat model dan embedding model.
5. Implement text splitting dan vector insert.
6. Implement `/api/fetch-url` via Tavily.
7. Implement `/api/chat` streaming.
8. Implement UI dasar sesuai `docs/DESIGN.md`.
9. Test end-to-end lokal.
10. Deploy ke Vercel dan test production.
