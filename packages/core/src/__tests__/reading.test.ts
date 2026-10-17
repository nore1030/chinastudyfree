/**
 * reading.test.ts —— 阅读完成 id 的双端归一化契约
 *
 * 关键性质：
 *   - web 三种历史格式与 iOS 三种历史格式落到同一个规范键（key 空间交集 = 全集）；
 *   - normalizeReadingId 幂等；
 *   - 整表归一化冲突时保留较早完成日期，且与遍历顺序无关。
 */

import { describe, expect, it } from "vitest";
import {
  UNKNOWN_COMPLETION_DATE,
  normalizeReadingId,
  normalizeReadingMap,
  parseReadingId,
  readingId,
} from "../reading";

const PASSAGE = "chinese-g1up-p3";
const STORY = "chinese-g3up-s1";

describe("readingId / parseReadingId", () => {
  it("规范格式为 reading:{kind}:{rawId}", () => {
    expect(readingId("listen", PASSAGE)).toBe("reading:listen:chinese-g1up-p3");
    expect(readingId("followup", PASSAGE)).toBe("reading:followup:chinese-g1up-p3");
    expect(readingId("story", STORY)).toBe("reading:story:chinese-g3up-s1");
  });

  it("能解析回 kind + rawId", () => {
    expect(parseReadingId(readingId("followup", PASSAGE))).toEqual({
      kind: "followup",
      rawId: PASSAGE,
    });
  });

  it("非规范/未知 kind 解析为 null", () => {
    expect(parseReadingId(PASSAGE)).toBeNull();
    expect(parseReadingId("reading:sing:x")).toBeNull();
    expect(parseReadingId("reading::x")).toBeNull();
    expect(parseReadingId("reading:listen:")).toBeNull();
  });
});

describe("normalizeReadingId：web 历史格式", () => {
  it("passage-{id}-listen → listen", () => {
    expect(normalizeReadingId(`passage-${PASSAGE}-listen`)).toBe(
      readingId("listen", PASSAGE),
    );
  });

  it("passage-{id}-followup → followup（不会被裸 -followup 规则吃掉前缀）", () => {
    expect(normalizeReadingId(`passage-${PASSAGE}-followup`)).toBe(
      readingId("followup", PASSAGE),
    );
  });

  it("story-{id} → story", () => {
    expect(normalizeReadingId(`story-${STORY}`)).toBe(readingId("story", STORY));
  });

  it("passage-{id}（无后缀的早期写法）按听读处理", () => {
    expect(normalizeReadingId(`passage-${PASSAGE}`)).toBe(readingId("listen", PASSAGE));
  });
});

describe("normalizeReadingId：iOS 历史格式", () => {
  it("裸课文 id → listen", () => {
    expect(normalizeReadingId(PASSAGE)).toBe(readingId("listen", PASSAGE));
  });

  it("{id}-followup → followup", () => {
    expect(normalizeReadingId(`${PASSAGE}-followup`)).toBe(
      readingId("followup", PASSAGE),
    );
  });

  it("裸故事 id（-s\\d+ 形态）→ story，不会误判成听读", () => {
    expect(normalizeReadingId(STORY)).toBe(readingId("story", STORY));
    expect(normalizeReadingId("english-g5up-s12")).toBe(
      readingId("story", "english-g5up-s12"),
    );
  });
});

describe("normalizeReadingId：双端交集与幂等", () => {
  it("web / iOS 同一篇课文听读落到同一个键", () => {
    expect(normalizeReadingId(`passage-${PASSAGE}-listen`)).toBe(
      normalizeReadingId(PASSAGE),
    );
  });

  it("web / iOS 同一篇课文跟读落到同一个键", () => {
    expect(normalizeReadingId(`passage-${PASSAGE}-followup`)).toBe(
      normalizeReadingId(`${PASSAGE}-followup`),
    );
  });

  it("web / iOS 同一个故事落到同一个键", () => {
    expect(normalizeReadingId(`story-${STORY}`)).toBe(normalizeReadingId(STORY));
  });

  it("幂等：规范 id 再归一化仍是自己", () => {
    for (const id of [
      `passage-${PASSAGE}-listen`,
      `passage-${PASSAGE}-followup`,
      `story-${STORY}`,
      PASSAGE,
      `${PASSAGE}-followup`,
      STORY,
    ]) {
      const once = normalizeReadingId(id);
      expect(normalizeReadingId(once)).toBe(once);
    }
  });

  it("空串 / 只有前缀的残缺键返回空串", () => {
    expect(normalizeReadingId("")).toBe("");
    expect(normalizeReadingId("   ")).toBe("");
    expect(normalizeReadingId("story-")).toBe("");
    expect(normalizeReadingId("passage-")).toBe("");
    expect(normalizeReadingId("-followup")).toBe("");
  });
});

describe("normalizeReadingMap", () => {
  it("整表归一化，两端老档合并后无重复条目", () => {
    const merged = normalizeReadingMap({
      [`passage-${PASSAGE}-listen`]: "2026-08-02",
      [PASSAGE]: "2026-08-05",
      [`story-${STORY}`]: "2026-07-30",
      [STORY]: "2026-08-01",
    });
    expect(Object.keys(merged).sort()).toEqual([
      readingId("listen", PASSAGE),
      readingId("story", STORY),
    ]);
  });

  it("冲突保留较早日期，且与遍历顺序无关", () => {
    const a = normalizeReadingMap({
      [`passage-${PASSAGE}-listen`]: "2026-08-02",
      [PASSAGE]: "2026-08-05",
    });
    const b = normalizeReadingMap({
      [PASSAGE]: "2026-08-05",
      [`passage-${PASSAGE}-listen`]: "2026-08-02",
    });
    expect(a).toEqual(b);
    expect(a[readingId("listen", PASSAGE)]).toBe("2026-08-02");
  });

  it("同日的 ISO 时间戳与纯日期共存时取纯日期（字典序较小）", () => {
    const m = normalizeReadingMap({
      [`passage-${PASSAGE}-listen`]: "2026-08-02T09:30:00.000Z",
      [PASSAGE]: "2026-08-02",
    });
    expect(m[readingId("listen", PASSAGE)]).toBe("2026-08-02");
  });

  it("空日期不覆盖真实日期", () => {
    expect(
      normalizeReadingMap({
        [`passage-${PASSAGE}-listen`]: "",
        [PASSAGE]: "2026-08-02",
      })[readingId("listen", PASSAGE)],
    ).toBe("2026-08-02");
  });

  it("非字符串值与空键被丢弃", () => {
    const m = normalizeReadingMap({
      [PASSAGE]: "2026-08-02",
      "": "2026-08-02",
      broken: 7 as unknown as string,
    });
    expect(m).toEqual({ [readingId("listen", PASSAGE)]: "2026-08-02" });
  });

  it("值为空串的老档：条目保留，值换成占位符（结果里绝不出现空串）", () => {
    // iOS 早期导出的 completedReadings 值就是空串（只有键有意义）
    const m = normalizeReadingMap({
      [PASSAGE]: "",
      [`${PASSAGE}-followup`]: "   ",
      [`story-${STORY}`]: "",
    });
    expect(m).toEqual({
      [readingId("listen", PASSAGE)]: UNKNOWN_COMPLETION_DATE,
      [readingId("followup", PASSAGE)]: UNKNOWN_COMPLETION_DATE,
      [readingId("story", STORY)]: UNKNOWN_COMPLETION_DATE,
    });
    // 真值口径与存在性口径必须得到同一个结论，否则会重复发 XP
    for (const v of Object.values(m)) {
      expect(Boolean(v)).toBe(true);
      expect(v != null).toBe(true);
    }
  });

  it("占位符幂等：再归一化一次结果不变", () => {
    const once = normalizeReadingMap({ [PASSAGE]: "" });
    expect(normalizeReadingMap(once)).toEqual(once);
  });

  it("占位符永远输给真实日期（两个方向都是）", () => {
    const key = readingId("listen", PASSAGE);
    expect(
      normalizeReadingMap({
        [PASSAGE]: UNKNOWN_COMPLETION_DATE,
        [`passage-${PASSAGE}-listen`]: "2026-08-02",
      })[key],
    ).toBe("2026-08-02");
    expect(
      normalizeReadingMap({
        [`passage-${PASSAGE}-listen`]: "2026-08-02",
        [PASSAGE]: UNKNOWN_COMPLETION_DATE,
      })[key],
    ).toBe("2026-08-02");
  });

  it("听读 / 跟读 / 故事互不串键", () => {
    const m = normalizeReadingMap({
      [PASSAGE]: "2026-08-02",
      [`${PASSAGE}-followup`]: "2026-08-03",
      [STORY]: "2026-08-04",
    });
    expect(m).toEqual({
      [readingId("listen", PASSAGE)]: "2026-08-02",
      [readingId("followup", PASSAGE)]: "2026-08-03",
      [readingId("story", STORY)]: "2026-08-04",
    });
  });
});
