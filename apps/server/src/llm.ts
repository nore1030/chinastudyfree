/**
 * llm.ts — OpenAI 兼容的大模型调用封装。
 * 用于出题 / 知识点讲解 / 故事文本生成。支持任意 OpenAI 兼容端点
 * （OpenAI、DeepSeek、Moonshot、通义千问、本地 Ollama 等）。
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  /** 要求模型返回 JSON（使用 response_format=json_object） */
  json?: boolean;
  maxTokens?: number;
}

export class LLMNotConfigured extends Error {
  constructor() {
    super("LLM_API_KEY 未配置");
    this.name = "LLMNotConfigured";
  }
}

export async function chatLLM(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const base = process.env.LLM_BASE_URL?.replace(/\/$/, "") || "https://api.openai.com/v1";
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  if (!key) throw new LLMNotConfigured();

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.8,
  };
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM 请求失败 ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM 返回内容为空");
  return content;
}

/** 尝试把模型返回的字符串解析为 JSON，容忍代码块包裹。 */
export function parseJSON<T = unknown>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
