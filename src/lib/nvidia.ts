import OpenAI from 'openai';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const CHAT_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
export const EMBED_MODEL = 'nvidia/nv-embedqa-e5-v5';
export const EMBED_DIMENSION = 1024;

function getClient(): OpenAI {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY tidak ditemukan di environment');
  return new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL });
}

export async function chatComplete(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { temperature?: number; top_p?: number; max_tokens?: number },
) {
  const openai = getClient();
  return openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    temperature: opts?.temperature ?? 0.7,
    top_p: opts?.top_p ?? 0.95,
    max_tokens: opts?.max_tokens ?? 8192,
  });
}

export async function chatStream(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { temperature?: number; top_p?: number; max_tokens?: number },
) {
  const openai = getClient();
  return openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    temperature: opts?.temperature ?? 0.7,
    top_p: opts?.top_p ?? 0.95,
    max_tokens: opts?.max_tokens ?? 8192,
    stream: true,
  });
}

async function embedWith(input: string, inputType: 'query' | 'passage'): Promise<number[]> {
  const openai = getClient();
  const result = await openai.embeddings.create({
    model: EMBED_MODEL,
    input,
    encoding_format: 'float',
    // @ts-expect-error - NVIDIA NIM requires input_type for asymmetric models
    input_type: inputType,
  });
  return result.data[0].embedding;
}

/** Embed a user query (untuk similarity search) */
export async function embedText(text: string): Promise<number[]> {
  return embedWith(text, 'query');
}

/** Embed a document passage (untuk indexing/storing) */
export async function embedPassage(text: string): Promise<number[]> {
  return embedWith(text, 'passage');
}
