"use client";

import { useState } from "react";
import { generateQuiz, synthesizeSpeech, type AIQuestion } from "@/lib/ai";

/**
 * /ai — 在线 AI 能力演示页。
 * 验证「保留在线 AI 生成」：出题 / 语音合成。后端未配置 Key 时提示降级为离线内容。
 * 可在桌面、Web、Docker 同源使用；移动端需构建时写入 NEXT_PUBLIC_AI_BASE。
 */
export default function AIDemoPage() {
  const [subject, setSubject] = useState("数学");
  const [grade, setGrade] = useState("三年级");
  const [topic, setTopic] = useState("两位数加减法");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<AIQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setQuestions([]);
    try {
      const qs = await generateQuiz({ subject, grade, topic, count });
      setQuestions(qs);
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(
        err.code?.includes("NOT_CONFIGURED")
          ? "在线 AI 未配置（服务端缺少 API Key）。已自动降级：可使用本地预生成题库与离线语音。"
          : err.message,
      );
    } finally {
      setLoading(false);
    }
  }

  async function play(text: string) {
    try {
      setAudioUrl(null);
      const url = await synthesizeSpeech(text);
      setAudioUrl(url);
      const audio = new Audio(url);
      audio.play();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-extrabold text-[#58CC02]">聪聪 · 在线 AI 实验室</h1>
      <p className="mb-6 text-sm text-gray-500">实时出题与语音合成（需服务端配置大模型 / TTS Key）</p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="text-xs text-gray-600">
          学科
          <input className="mt-1 w-full rounded-lg border px-2 py-1.5" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label className="text-xs text-gray-600">
          年级
          <input className="mt-1 w-full rounded-lg border px-2 py-1.5" value={grade} onChange={(e) => setGrade(e.target.value)} />
        </label>
        <label className="col-span-2 text-xs text-gray-600">
          知识点
          <input className="mt-1 w-full rounded-lg border px-2 py-1.5" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <label className="text-xs text-gray-600">
          题数
          <input type="number" min={1} max={15} className="mt-1 w-20 rounded-lg border px-2 py-1.5" value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <button
          onClick={run}
          disabled={loading}
          className="mt-4 rounded-xl bg-[#58CC02] px-5 py-2.5 font-bold text-white shadow-[0_4px_0_#46a302] active:translate-y-0.5 active:shadow-none disabled:opacity-60"
        >
          {loading ? "生成中…" : "✨ 生成题目"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">{error}</div>
      )}

      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={i} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">
                {i + 1}. {q.question}
              </p>
              <button onClick={() => play(q.question)} className="shrink-0 rounded-lg bg-[#1cb0f6] px-2 py-1 text-xs text-white">
                朗读
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {q.options?.map((o, oi) => (
                <li key={oi} className={oi === q.answer ? "font-bold text-[#58CC02]" : ""}>
                  {String.fromCharCode(65 + oi)}. {o}
                  {oi === q.answer && " ✓"}
                </li>
              ))}
            </ul>
            {q.explanation && <p className="mt-2 text-xs text-gray-500">讲解：{q.explanation}</p>}
          </div>
        ))}
      </div>

      {audioUrl && <audio className="mt-4 w-full" controls src={audioUrl} />}
    </main>
  );
}
