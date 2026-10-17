/**
 * week.test.ts —— 日历周（周一起）单一事实源
 *
 * 双端周报 / 连胜日历 / 联赛周榜共用这套定义，边界必须钉死：
 * 周日归属上一周、跨月、跨年、月末补齐。
 */

import { describe, expect, it } from "vitest";
import {
  dateKey,
  dayIndexInWeek,
  isDateKey,
  parseDateKey,
  weekDateKeys,
  weekStartKey,
} from "../week";
import { weekKeyFor } from "../league";

describe("dateKey / isDateKey / parseDateKey", () => {
  it("按本地时区格式化，月日补零", () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(dateKey(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
  });

  it("回环：parseDateKey(dateKey(d)) 是当天 00:00", () => {
    const d = parseDateKey("2026-08-26")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(26);
    expect(d.getHours()).toBe(0);
    expect(dateKey(d)).toBe("2026-08-26");
  });

  it("非法键判假且解析为 null（不抛异常）", () => {
    for (const bad of ["", "2026-8-26", "2026/08/26", "2026-13-01", "2026-02-30", "abc"]) {
      expect(isDateKey(bad)).toBe(false);
      expect(parseDateKey(bad)).toBeNull();
    }
    expect(isDateKey("2028-02-29")).toBe(true); // 闰年真实存在
  });
});

describe("weekStartKey：周一起的日历周", () => {
  it("周一返回当天（0 点与 23:59 同键）", () => {
    expect(weekStartKey(new Date(2026, 7, 24, 0, 0))).toBe("2026-08-24");
    expect(weekStartKey(new Date(2026, 7, 24, 23, 59))).toBe("2026-08-24");
  });

  it("周中回退到本周一", () => {
    expect(weekStartKey(new Date(2026, 7, 26, 12, 0))).toBe("2026-08-24");
  });

  it("周日仍属上一周（不是新一周的开始）", () => {
    expect(weekStartKey(new Date(2026, 7, 30, 23, 59))).toBe("2026-08-24");
    expect(weekStartKey(new Date(2026, 7, 31, 0, 0))).toBe("2026-08-31");
  });

  it("跨月：8/1 是周六，周一在 7 月", () => {
    expect(weekStartKey(new Date(2026, 7, 1, 9, 0))).toBe("2026-07-27");
  });

  it("跨年：2027-01-01 是周五，周一在 2026 年 12 月", () => {
    expect(weekStartKey(new Date(2027, 0, 1, 9, 0))).toBe("2026-12-28");
  });

  it("league 的 weekKeyFor 就是同一份实现（不存在第二套周窗口）", () => {
    expect(weekKeyFor).toBe(weekStartKey);
    const d = new Date(2026, 7, 29, 20, 0);
    expect(weekKeyFor(d)).toBe(weekStartKey(d));
  });
});

describe("weekDateKeys：一周 7 天，周一 → 周日", () => {
  it("从周键展开 7 天", () => {
    expect(weekDateKeys("2026-08-24")).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  it("传周内任意一天（含周日）都归一到同一周", () => {
    const expected = weekDateKeys("2026-08-24");
    expect(weekDateKeys("2026-08-27")).toEqual(expected);
    expect(weekDateKeys("2026-08-30")).toEqual(expected);
  });

  it("跨月：7/27 那周尾巴落在 8 月", () => {
    expect(weekDateKeys("2026-07-27")).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });

  it("跨年：2026-12-28 那周跨进 2027", () => {
    expect(weekDateKeys("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  it("非法键回退到本周（长度仍是 7，且首日是本周一）", () => {
    const keys = weekDateKeys("坏键");
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe(weekStartKey());
  });

  it("每一天的 dayIndexInWeek 与下标一致", () => {
    const keys = weekDateKeys("2026-08-24");
    keys.forEach((k, i) => {
      expect(dayIndexInWeek("2026-08-24", parseDateKey(k)!)).toBe(i);
    });
  });
});

describe("dayIndexInWeek 边界", () => {
  it("上周日为 -1，下周一为 7", () => {
    expect(dayIndexInWeek("2026-08-24", new Date(2026, 7, 23, 12, 0))).toBe(-1);
    expect(dayIndexInWeek("2026-08-24", new Date(2026, 7, 31, 12, 0))).toBe(7);
  });

  it("同一天不同时刻天序相同", () => {
    expect(dayIndexInWeek("2026-08-24", new Date(2026, 7, 26, 0, 1))).toBe(2);
    expect(dayIndexInWeek("2026-08-24", new Date(2026, 7, 26, 23, 59))).toBe(2);
  });
});
