/**
 * edge-tts.ts — 微软 Edge 免费语音合成（零 API Key，只要联网）。
 *
 * 走 Edge「朗读」公网端点，复用社区已验证的 Sec-MS-GEC 令牌算法
 * （rany2/edge-tts 的 drm.py：Windows FileTime + TrustedClientToken → SHA256）。
 * 使用已安装的 `ws` 库（由 esbuild 一并打包进 dist/index.js），
 * 保持服务端「自包含单文件、运行时零 node_modules」。
 *
 * 默认音色 zh-CN-XiaoxiaoNeural（晓晓，适合儿童的女声）。
 *
 * ⚠️ 该端点需要联网；离线/内网部署请把 EDGE_TTS_ENABLED 设为 false，
 *    改用预生成音频（scripts/tts/generate-audio.mjs 可加 --engine edge 走免费合成）。
 */

import { WebSocket } from "ws";
import crypto from "node:crypto";
import { generateSecMsGecV2, TRUSTED_CLIENT_TOKEN } from "./gec.js";

// 微软已从 v1 升级到 v2 GEC：自定义初始向量 SHA256 + CS64 校验和。
// 版本前缀必须是 "2-"（实测 7.3.1 常量 = "2-143.0.3650.75"），用 "1-" 会 403。
const SEC_MS_GEC_VERSION = "2-143.0.3650.75";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

export class EdgeTTSNotAvailable extends Error {
  constructor(msg = "EdgeTTS 不可用（网络不可达或未启用）") {
    super(msg);
    this.name = "EdgeTTSNotAvailable";
  }
}

export interface TTSResult {
  buffer: Buffer;
  contentType: string;
}

function uuid(): string {
  return crypto.randomBytes(16).toString("hex");
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&apos;",
  );
}

/**
 * 合成一段文本，返回 mp3 音频 Buffer。
 * @param text  待朗读文本
 * @param voice 边缘音色名，默认 zh-CN-XiaoxiaoNeural
 */
export async function edgeTTSSynthesis(
  text: string,
  voice = "zh-CN-XiaoxiaoNeural",
): Promise<TTSResult> {
  const gec = generateSecMsGecV2();
  const muid = uuid().toUpperCase();
  const url =
    `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${gec}` +
    `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
    `&ConnectionId=${uuid()}`;

  const ws = new WebSocket(url, {
    host: "speech.platform.bing.com",
    origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.3650.75",
      Cookie: `muid=${muid}`,
    },
  });

  const chunks: Buffer[] = [];
  let done = false;

  const speechConfig = JSON.stringify({
    context: {
      synthesis: {
        audio: {
          metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
          outputFormat: OUTPUT_FORMAT,
        },
      },
    },
  });
  const configMessage =
    `X-Timestamp:${new Date().toString()}\r\n` +
    `Content-Type:application/json; charset=utf-8\r\n` +
    `Path:speech.config\r\n\r\n${speechConfig}`;

  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' ` +
    `xml:lang='zh-CN'><voice name='${voice}'>` +
    `<prosody rate='-10%'>${escapeXml(text)}</prosody></voice></speak>`;
  const ssmlMessage =
    `X-RequestId:${uuid()}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${new Date().toString()}Z\r\n` +
    `Path:ssml\r\n\r\n${ssml}`;

  return new Promise<TTSResult>((resolve, reject) => {
    const finish = (fn: (v: TTSResult) => void, val: TTSResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      fn(val);
    };
    const fail = (e: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      reject(e);
    };

    const timer = setTimeout(
      () => fail(new EdgeTTSNotAvailable("EdgeTTS 合成超时（30s）")),
      30000,
    );

    ws.on("message", (rawData: Buffer, isBinary: boolean) => {
      if (!isBinary) {
        const data = rawData.toString("utf8");
        if (data.includes("turn.end")) {
          finish(resolve, { buffer: Buffer.concat(chunks), contentType: "audio/mpeg" });
        }
        return;
      }
      const separator = "Path:audio\r\n";
      const idx = rawData.indexOf(separator);
      if (idx >= 0) {
        chunks.push(rawData.subarray(idx + separator.length));
      }
    });

    ws.on("error", (e: Error) => fail(new EdgeTTSNotAvailable(e.message || "EdgeTTS WebSocket 错误")));

    ws.on("open", () => {
      ws.send(configMessage, { compress: true }, (err) => {
        if (err) return fail(err);
        ws.send(ssmlMessage, { compress: true }, (err2) => {
          if (err2) fail(err2);
        });
      });
    });
  });
}
