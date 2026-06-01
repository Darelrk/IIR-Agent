/**
 * Typed shapes for API responses consumed by the client.
 *
 * These mirror the JSON returned from `src/routes/api/*.ts`. They are kept as
 * pure types (no runtime validation) — server handlers are the source of truth.
 */

import type { Source } from '~/components/SourceList'
import type { Session } from '~/components/Sidebar'

// ---------- /api/sessions ----------

export interface SessionsListResponse {
  sessions: Session[]
}

export type CreatedSessionResponse = Session

// ---------- /api/sessions/$id ----------

export interface PersistedMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** JSONB; postgres.js may return either a parsed object or its serialized string. */
  sources: Source[] | string | null
  created_at: string
}

export interface SessionDetailResponse {
  session: Session
  messages: PersistedMessage[]
}

// ---------- /api/fetch-url ----------

export type FetchUrlResponse =
  | {
      success: true
      title: string
      source_name: string
      chunks_count: number
      cached?: boolean
    }
  | { success: false; error: string }

// ---------- /api/web-search ----------

export interface IndexedWebUrl {
  url: string
  title: string
  chunks_count: number
}

export type WebSearchResponse =
  | {
      success: true
      query: string
      urls: IndexedWebUrl[]
      total_chunks: number
      errors?: string[]
    }
  | { success: false; error: string }
