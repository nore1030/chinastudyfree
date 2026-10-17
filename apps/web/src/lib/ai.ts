/**
 * ai.ts — 前端访问在线 AI 后端的统一入口。
 *
 * NEXT_PUBLIC_AI_BASE 在构建时注入：
 *   - Web / Docker / 桌面(Tauri)：留空 → 走同源 /api
 *   - 移动端(Capacitor)：构建时设为自托管地址（如 https://study.example.com）
 *
 * 任意接口在后端未配置 Key 时返回 { ok:false, code:"..._NOT_CONFIGURED" }，
 * 调用方应自动降级为离线预生成内容。
 */
// 在 Tauri 桌面端内，AI 服务由本进程在 localhost:8787 拉起，自动指向，
// 无需在构建期注入 NEXT_PUBLIC_AI_BASE；其余形态(Web/Docker/移动端)使用注入值。
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const AI_BASE: string = isTauri
  ? "http://localhost:8787"
  : process.env.NEXT_PUBLIC_AI_BASE ?? "";

export function aiUrl(path: string): string {
  return `${AI_BASE}${path}`;
}

export interface AIQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation?: string;
  knowledge_point?: string;
}

/** 调用在线出题接口；后端未配置时抛出带 code 的错误。 */
export async function generateQuiz(opts: {
  subject?: string;
  grade?: number | string;
  topic?: string;
  count?: number;
  difficulty?: "easy" | "medium" | "hard";
}): Promise<AIQuestion[]> {
  const res = await fetch(aiUrl("/api/ai/quiz"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  // 先判 HTTP 状态再解析 JSON：代理 502 / 静态兜底页等非 JSON 响应
  // 会让 res.json() 抛 SyntaxError（信息对用户无意义）。
  if (!res.ok) {
    let msg = `AI 出题失败（HTTP ${res.status}）`;
    try {
      const d = await res.json();
      msg = d.error || msg;
    } catch {
      /* 响应不是 JSON，用默认消息 */
    }
    const err = new Error(msg) as Error & { code?: string };
    throw err;
  }
  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.error || "AI 出题失败") as Error & { code?: string };
    err.code = data.code;
    throw err;
  }
  return data.questions as AIQuestion[];
}

/** 在线语音合成：返回可播放的 object URL（调用方负责 revoke）。 */
export async function synthesizeSpeech(text: string, voice?: string): Promise<string> {
  const res = await fetch(aiUrl("/api/ai/tts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    let msg = "TTS 失败";
    try {
      const d = await res.json();
      msg = d.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
