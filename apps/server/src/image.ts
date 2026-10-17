/**
 * image.ts — Google Gemini 文生图（儿童插画配图）。
 * 使用 gemini-2.0-flash-exp-image-generation（支持 IMAGE 输出）。
 * 属于可选能力：未配置 GEMINI_API_KEY 时 /api/ai/story 仍会返回故事文本，仅缺配图。
 */

export class ImageNotConfigured extends Error {
  constructor() {
    super("GEMINI_API_KEY 未配置");
    this.name = "ImageNotConfigured";
  }
}

export interface ImageResult {
  base64: string;
  mimeType: string;
}

export async function geminiImage(prompt: string): Promise<ImageResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ImageNotConfigured();

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    "gemini-2.0-flash-exp-image-generation:generateContent?key=" +
    key;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini 请求失败 ${res.status}: ${t.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
  };
  for (const c of data.candidates ?? []) {
    for (const p of c.content?.parts ?? []) {
      if (p.inlineData?.data) {
        return {
          base64: p.inlineData.data,
          mimeType: p.inlineData.mimeType || "image/png",
        };
      }
    }
  }
  throw new Error("Gemini 未返回图片");
}
