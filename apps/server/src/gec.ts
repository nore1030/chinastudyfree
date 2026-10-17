/**
 * gec.ts — 微软 Edge 朗读端点的 Sec-MS-GEC v2 令牌算法（免费、零 API Key）。
 *
 * 移植自 rany2/edge-tts 7.3.1 的 drm.py（MIT 许可）。该算法已从 v1 的简单
 * SHA256 升级为：自定义初始向量（_SHA256_STATE）的密钥化 SHA256 + CS64 校验和。
 *
 * 已用 edge_tts 官方 Python 参考令牌交叉验证（见仓库根 gec-port.mjs），
 * 4 组时间戳全部 ALL MATCH。关键陷阱已规避：
 *   - 小 sigma 的第三项必须是「逻辑右移」(>>>)，绝不能写成 rotr（否则初始状态错位）。
 *   - CS64 必须先把 14 个系数项 PREPEND 到 terms/offsets，再 append 数据词。
 *   - JS 用 mod（带符号修正）代替 Python 的 %；64 位乘积用 BigInt 拆 mul32。
 *
 * 该模块只用 Node 全局（Buffer），零 node_modules 依赖，可被 esbuild 直接内联。
 */

const WIN_EPOCH = 11644473600;
const S_TO_NS = 1e9; // ticks *= S_TO_NS/100 = *1e7

export const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

const MASK = 0xFFFFFFFF;
const mod = (a: number, n: number): number => ((a % n) + n) % n;

// Exact 32-bit ROTR: bit i of result = bit (i+n) mod 32 of x.
const rotr = (x: number, n: number): number => {
  x = x >>> 0;
  const mask = (1 << n) - 1;
  return ((x >>> n) | ((x & mask) << (32 - n))) >>> 0;
};
const mul32 = (a: number, b: number): number =>
  Number((BigInt(a >>> 0) * BigInt(b >>> 0)) & 0xFFFFFFFFn) >>> 0;
const rol16 = (v: number): number => rotr(v, 16);

const ROUND = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const SHA256_INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const SHA256_STATE = [0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a, 0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2];
const SHA256_SCHEDULE = [0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6, 0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33, 0xd258b060, 0x72766564];
const ADJUSTMENT = 0xc9dc06a7;
const BLOCK = [...ROUND.slice(0, 14), ADJUSTMENT, ...ROUND.slice(15)];
const SIGMA0_ADJ = 0x059c0b80;
const SIGMA1_ADJ = 0x000b92c0;

const CS64_COEFFICIENTS: [number, number][] = [
  [0xe82e91b1, 0xb32700d0], [0x44de24c6, 0x88dff51d], [0x3beb65bc, 0x29514038], [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5], [0x314ef5d5, 0x26e55f3c], [0xe92491b1, 0x607801c6], [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da], [0xda79fa60, 0x207cc464], [0xbed20560, 0x3c3c74f3], [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1], [0xcb49e3c6, 0xc5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJ0 = 0xf2f90b1a;
const CS64_ADJ1 = 0x0b1a0000;

const S1 = (e: number) => (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
const S0 = (a: number) => (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
// Small sigma: ROTR ^ ROTR ^ SHR (third term is a LOGICAL shift, not a rotate!).
const s1 = (x: number) => (rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)) >>> 0;
const s0 = (y: number) => (rotr(y, 7) ^ rotr(y, 18) ^ (y >>> 3)) >>> 0;
const Ch = (e: number, f: number, g: number): number => (g ^ (e & (f ^ g))) >>> 0;
const Maj = (a: number, b: number, c: number): number => ((a & b) | (c & (a | b))) >>> 0;

function sha256_rounds(state: number[], words: number[], first_round: number): number[] {
  let [a, b, c, d, e, f, g, h] = state;
  const K = first_round === 14 ? BLOCK : ROUND;
  for (let index = first_round; index < 64; index++) {
    const t1 = (h + S1(e) + Ch(e, f, g) + K[index] + words[index]) & MASK;
    const t2 = (S0(a) + Maj(a, b, c)) & MASK;
    const na = (t1 + t2) & MASK;
    const ne = (d + t1) & MASK;
    h = g; g = f; f = e; e = ne; d = c; c = b; b = a; a = na;
  }
  return [a, b, c, d, e, f, g, h];
}

function expand_schedule(words: number[], first_word = 16): void {
  for (let index = first_word; index < 64; index++) {
    const x = words[index - 2], y = words[index - 15];
    const sigma1 = s1(x);
    const sigma0 = s0(y);
    words.push((sigma1 + words[index - 7] + sigma0 + words[index - 16]) & MASK);
  }
}

function sha256_init(data: Buffer): number[] {
  const words = new Array(16).fill(0);
  words[14] = ((data[0] << 16) | (data[1] << 8) | data[2]) & MASK;
  words[15] = ((data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]) & MASK;
  for (let index = 16; index < 30; index++) {
    let value = SHA256_SCHEDULE[index - 16];
    if (index - 2 >= 14) {
      value += index === 16 ? (s1(words[index - 2]) ^ SIGMA1_ADJ) : s1(words[index - 2]);
    }
    if (index - 7 >= 14) value += words[index - 7];
    if (index - 15 >= 14) {
      value += index === 29 ? (s0(words[index - 15]) ^ SIGMA0_ADJ) : s0(words[index - 15]);
    }
    words.push(value & MASK);
  }
  words.push((s1(words[28]) + words[23] + s0(words[15]) + words[14] + ADJUSTMENT - ROUND[14]) & MASK);
  expand_schedule(words, 31);
  const working = sha256_rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((iv, i) => (iv + working[i]) & MASK);
}

function sha256_digest(data: Buffer): Buffer {
  if (data.length < 7) throw new Error("Token salt must contain at least seven bytes");
  const length = 57 + data.length;
  const head = Buffer.from(data.subarray(7));
  const pad = Buffer.alloc(mod(55 - length, 64));
  const lenBuf = Buffer.alloc(8);
  lenBuf.writeBigUInt64BE(BigInt(length) * 8n);
  const padded = Buffer.concat([head, Buffer.from([0x80]), pad, lenBuf]);
  let state = sha256_init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const block = padded.subarray(offset, offset + 64);
    const words: number[] = [];
    for (let i = 0; i < 16; i++) words.push(block.readUInt32BE(i * 4) >>> 0);
    expand_schedule(words, 16);
    const working = sha256_rounds(state, words, 0);
    state = state.map((s, i) => (s + working[i]) & MASK);
  }
  const out = Buffer.alloc(32);
  state.forEach((w, i) => out.writeUInt32BE(w >>> 0, i * 4));
  return out;
}

function words_le4_even(data: Buffer): number[] {
  let padded = Buffer.from(data);
  if (padded.length % 4 !== 0) padded = Buffer.concat([padded, Buffer.alloc(mod(-padded.length, 4))]);
  const words: number[] = [];
  for (let i = 0; i < padded.length; i += 4) words.push(padded.readUInt32LE(i) >>> 0);
  if (words.length % 2) words.push(0);
  return words;
}

function cs64_digest(data: Buffer, digest: Buffer): [number, number] {
  let key_a = digest.readUInt32LE(0) >>> 0;
  let key_b = digest.readUInt32LE(4) >>> 0;
  key_a |= 1; key_b |= 1;
  const factors = [mul32(key_a, CS64_FACTOR), mul32(key_b, CS64_FACTOR)];
  // Python 先放 14 个系数派生项，再 append 数据词；顺序不可颠倒。
  const T: number[] = [];
  const O: number[] = [];
  for (let index = 0; index < CS64_COEFFICIENTS.length; index++) {
    T.push(mul32(CS64_COEFFICIENTS[index][0], factors[index % 2]) & MASK);
    O.push(CS64_COEFFICIENTS[index][1] >>> 0);
  }
  const twords = words_le4_even(Buffer.concat([Buffer.from([0x00]), data]));
  for (let index = 0; index < twords.length; index++) {
    const word = twords[index];
    const term = mul32(word, index % 2 === 0 ? key_a : key_b);
    const offset = mul32(rol16(word), index % 2 === 0 ? 0xef0569fb : 0xc31713db);
    let t = term, o = offset;
    if (index === 0) {
      t = (term + mul32(CS64_ADJ0, factors[0])) & MASK;
      o = (offset + CS64_ADJ1) & MASK;
    }
    T.push(t & MASK); O.push(o & MASK);
  }
  let swap_acc = 0, swap_last = 0, state = 0, acc = 0;
  for (let index = 0; index < T.length; index += 2) {
    const x = T[index], y = T[index + 1];
    let t = rol16((O[index] + x) & MASK);
    let q = mul32(t, 0x76f50f34);
    swap_acc = (swap_acc + (mul32(rol16(q), 0xc3efea97) + q)) & MASK;
    t = rol16((O[index + 1] + y) & MASK);
    q = mul32(t, 0x1881ce3c);
    swap_last = (mul32(rol16(q), 0x35bd1ec9) + q) & MASK;
    swap_acc = (swap_acc + swap_last) & MASK;

    state = (mul32(state, key_a) + x) & MASK;
    state = mul32(rol16(state), 0xcf98b111);
    state = mul32(rol16(state), 0x87085b9f);
    state = mul32(rol16(state), 0x12ceb96d);
    state = mul32(rol16(state), 0x257e1d83);
    acc = (acc + state) & MASK;
    t = (mul32(state, key_b) + y) & MASK;
    t = mul32(rol16(t), 0xa27416f5);
    t = mul32(rol16(t), 0xd38396ff);
    const tmp = mul32(rol16(t), 0x7c932b89);
    state = mul32(rol16(tmp), 0xbfa49f69);
    acc = (acc + state) & MASK;
  }
  return [swap_last ^ state, swap_acc ^ acc];
}

function token_hash(data: Buffer): [string, string] {
  const digest = sha256_digest(data);
  const cs = cs64_digest(data, digest);
  const buf = Buffer.alloc(8);
  buf.writeUInt32LE(cs[0] >>> 0, 0);
  buf.writeUInt32LE(cs[1] >>> 0, 4);
  return [buf.toString("hex").toUpperCase(), digest.toString("hex").toUpperCase()];
}

/**
 * 生成 v2 Sec-MS-GEC 令牌（"<16hex>-<64hex>"）。
 * @param unixSeconds 可选定点时间戳（秒）；省略则用当前时间。
 */
export function generateSecMsGecV2(unixSeconds?: number): string {
  const unix = unixSeconds ?? Date.now() / 1000;
  let ticks = unix + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= S_TO_NS / 100;
  const strToHash = ticks.toFixed(0) + TRUSTED_CLIENT_TOKEN;
  const [cs64, sha] = token_hash(Buffer.from(strToHash, "ascii"));
  return `${cs64}-${sha}`;
}
