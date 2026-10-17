/**
 * tts.ts — 阿里云 DashScope 语音合成（CosyVoice / Sambert）。
 * 文档: https://help.aliyun.com/zh/model-studio/text-to-speech
 * 返回 base64 解码后的音频 Buffer，由 index.ts 以二进制流回传给前端。
 */

export class TTSNotConfigured extends Error {
  constructor() {
    super("DASHSCOPE_API_KEY 未配置");
    this.name = "TTSNotConfigured";
  }
}

export interface TTSResult {
  buffer: Buffer;
  contentType: string;
}

import { edgeTTSSynthesis, EdgeTTSNotAvailable } from "./edge-tts.js";

export async function dashscopeTTS(
  text: string,
  voice?: string,
  model?: string,
): Promise<TTSResult> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new TTSNotConfigured();

  const m = model || process.env.TTS_MODEL || "cosyvoice-v1";
  const v = voice || process.env.TTS_VOICE || "longxiaochun";

  const res = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: m,
        input: { model: m, text, voice: v },
        parameters: {
          voice: v,
          text_type: "plain",
          output_audio: { format: "mp3", sample_rate: 24000 },
        },
      }),
    },
  );

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`TTS 请求失败 ${res.status}: ${t.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    output?: { choices?: Array<{ message?: { output?: { audio?: string } } }> };
  };
  const audioField = data?.output?.choices?.[0]?.message?.output?.audio;
  if (!audioField) throw new Error("TTS 返回缺少音频字段");
  const parsed =
    typeof audioField === "string" ? JSON.parse(audioField) : audioField;
  const b64: string | undefined = parsed?.audio;
  if (!b64) throw new Error("TTS 未返回音频数据");
  return {
    buffer: Buffer.from(b64, "base64"),
    contentType: parsed?.content_type || "audio/mpeg",
  };
}

/**
 * 统一合成入口：优先 DashScope（若配置了 DASHSCOPE_API_KEY），
 * 失败或没配 Key 时自动降级到**免费的 EdgeTTS**（微软 Edge 朗读，需联网）。
 *
 * 这样终端用户无需任何付费 Key 即可获得语音——只要运行环境能联网。
 * 离线/内网部署请把 EDGE_TTS_ENABLED 设为 false，并改用预生成音频
 * （scripts/tts/generate-audio.mjs，可加 --engine edge 走免费合成）。
 */
export const EDGE_TTS_DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";

export async function synthesize(
  text: string,
  voice?: string,
  model?: string,
): Promise<TTSResult> {
  const useEdge = process.env.EDGE_TTS_ENABLED !== "false";
  if (process.env.DASHSCOPE_API_KEY) {
    try {
      return await dashscopeTTS(text, voice, model);
    } catch (e) {
      if (e instanceof TTSNotConfigured || !useEdge) throw e;
      console.warn("[tts] DashScope 失败，降级 EdgeTTS:", (e as Error).message);
    }
  }
  if (useEdge) {
    return await edgeTTSSynthesis(text, voice || EDGE_TTS_DEFAULT_VOICE);
  }
  throw new TTSNotConfigured();
}
