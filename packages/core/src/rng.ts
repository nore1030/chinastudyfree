/**
 * rng.ts —— 跨端确定性随机的公共原语（quests / league 共用）
 *
 * TS 端用 BigInt 模拟 Swift 的 UInt64 环绕运算（&+ / &*），位运算逐位一致。
 * iOS `Domain/Quests.swift` / `Domain/League.swift` 必须镜像同名实现：
 *   - djb2Hash: UTF-8 字节 djb2 滚动哈希（seed 5381，×33 + byte，64 位环绕）
 *   - mix64:    SplitMix64 finalizer 雪崩
 * 任何一端改动这里都会导致双端榜单 / 任务漂移，禁止单独修改。
 */

export const U64_MASK = (1n << 64n) - 1n;

/**
 * SplitMix64 finalizer —— 与 Swift 侧位运算逐位一致
 * （&+ / &* 用 BigInt + 64 位掩码模拟环绕）。
 */
export function mix64(value: bigint): bigint {
  let x = (value + 0x9e3779b97f4a7c15n) & U64_MASK;
  x = ((x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MASK;
  x = ((x ^ (x >> 27n)) * 0x94d049bb133111ebn) & U64_MASK;
  return x ^ (x >> 31n);
}

/** 字符串 → UTF-8 字节序列（与 Swift `Array(s.utf8)` 一致）。 */
export function utf8Bytes(s: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let code = s.codePointAt(i)!;
    if (code > 0xffff) i++; // 代理对占两个 code unit
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/** djb2 滚动哈希（64 位环绕，未做雪崩——通常再套一层 mix64 使用）。 */
export function djb2Hash(s: string): bigint {
  let hash = 5381n;
  for (const byte of utf8Bytes(s)) {
    hash = (hash * 33n + BigInt(byte)) & U64_MASK;
  }
  return hash;
}
