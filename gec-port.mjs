// Faithful Node port of edge-tts drm.py v2 token (constants from MIT upstream).
// Validated against official Python edge_tts 7.3.1 reference tokens.

const WIN_EPOCH = 11644473600;
const S_TO_NS = 1e9; // ticks *= S_TO_NS/100 = *1e7
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

const MASK = 0xFFFFFFFF;
const mod = (a, n) => ((a % n) + n) % n;
// Exact 32-bit ROTR: bit i of result = bit (i+n) mod 32 of x.
const rotr = (x, n) => {
  x = x >>> 0;
  const mask = (1 << n) - 1;
  return ((x >>> n) | ((x & mask) << (32 - n))) >>> 0;
};
const mul32 = (a, b) => Number((BigInt(a >>> 0) * BigInt(b >>> 0)) & 0xFFFFFFFFn) >>> 0;
const rol16 = (v) => rotr(v, 16);

const ROUND = [
  0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,
  0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,
  0xE49B69C1,0xEFBE4786,0x0FC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,
  0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x06CA6351,0x14292967,
  0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,
  0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,
  0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,
  0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2,
];
const SHA256_INITIAL = [0x6A09E667,0xBB67AE85,0x3C6EF372,0xA54FF53A,0x510E527F,0x9B05688C,0x1F83D9AB,0x5BE0CD19];
const SHA256_STATE   = [0xFD9FBEA2,0x91243CE7,0xBE499094,0xCD2E1E0A,0x6C006F49,0x04BD35AB,0xFEB0A7E4,0x03EFFBD2];
const SHA256_SCHEDULE = [0xEB24BF9E,0x1558691F,0xA0C09EE2,0x0CFA32BA,0xA622EE8C,0xD1DD9491,0xC0DD25A0,0xF9E70AB6,0xF0C31573,0x7058CE4E,0x7188E606,0x00E5AB33,0xD258B060,0x72766564];
const ADJUSTMENT = 0xC9DC06A7;
const BLOCK = [...ROUND.slice(0,14), ADJUSTMENT, ...ROUND.slice(15)];
const SIGMA0_ADJ = 0x059C0B80;
const SIGMA1_ADJ = 0x000B92C0;

const CS64_COEFFICIENTS = [
  [0xE82E91B1,0xB32700D0],[0x44DE24C6,0x88DFF51D],[0x3BEB65BC,0x29514038],[0xC89C5933,0xB328CBDF],
  [0x8D1EC211,0xD405B4D5],[0x314EF5D5,0x26E55F3C],[0xE92491B1,0x607801C6],[0xF0A5B9D5,0x82B2C1FB],
  [0x06064CF3,0xFA51A3DA],[0xDA79FA60,0x207CC464],[0xBED20560,0x3C3C74F3],[0x89F9C9F8,0xD2D14B61],
  [0x35FA38C6,0xBB04A2C1],[0xCB49E3C6,0xC5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJ0 = 0xF2F90B1A;
const CS64_ADJ1 = 0x0B1A0000;

const S1 = (e) => rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
const S0 = (a) => rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
// Small sigma: ROTR ^ ROTR ^ SHR (the third term is a logical shift, NOT a rotate).
const s1 = (x) => (rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)) >>> 0;
const s0 = (y) => (rotr(y, 7) ^ rotr(y, 18) ^ (y >>> 3)) >>> 0;
const Ch = (e,f,g) => (g ^ (e & (f ^ g))) >>> 0;
const Maj = (a,b,c) => ((a & b) | (c & (a | b))) >>> 0;

function sha256_rounds(state, words, first_round) {
  let [a,b,c,d,e,f,g,h] = state;
  const K = first_round === 14 ? BLOCK : ROUND;
  for (let index = first_round; index < 64; index++) {
    const t1 = (h + S1(e) + Ch(e,f,g) + K[index] + words[index]) & MASK;
    const t2 = (S0(a) + Maj(a,b,c)) & MASK;
    const na = (t1 + t2) & MASK;
    const ne = (d + t1) & MASK;
    h = g; g = f; f = e; e = ne; d = c; c = b; b = a; a = na;
  }
  return [a,b,c,d,e,f,g,h];
}

function expand_schedule(words, first_word = 16) {
  for (let index = first_word; index < 64; index++) {
    const x = words[index - 2], y = words[index - 15];
    const sigma1 = s1(x);
    const sigma0 = s0(y);
    words.push((sigma1 + words[index - 7] + sigma0 + words[index - 16]) & MASK);
  }
}

function sha256_init(data) {
  const words = new Array(16).fill(0);
  words[14] = ((data[0] << 16) | (data[1] << 8) | data[2]) & MASK;
  words[15] = ((data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]) & MASK;
  for (let index = 16; index < 30; index++) {
    let value = SHA256_SCHEDULE[index - 16];
    if (index - 2 >= 14) {
      value += (index === 16) ? (s1(words[index - 2]) ^ SIGMA1_ADJ) : s1(words[index - 2]);
    }
    if (index - 7 >= 14) value += words[index - 7];
    if (index - 15 >= 14) {
      value += (index === 29) ? (s0(words[index - 15]) ^ SIGMA0_ADJ) : s0(words[index - 15]);
    }
    words.push(value & MASK);
  }
  words.push((s1(words[28]) + words[23] + s0(words[15]) + words[14] + ADJUSTMENT - ROUND[14]) & MASK);
  expand_schedule(words, 31);
  const working = sha256_rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((iv, i) => (iv + working[i]) & MASK);
}

function sha256_digest(data) {
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
    const words = [];
    for (let i = 0; i < 16; i++) words.push(block.readUInt32BE(i * 4) >>> 0);
    expand_schedule(words, 16);
    const working = sha256_rounds(state, words, 0);
    state = state.map((s, i) => (s + working[i]) & MASK);
  }
  const out = Buffer.alloc(32);
  state.forEach((w, i) => out.writeUInt32BE(w >>> 0, i * 4));
  return out;
}

function words_le4_even(data) {
  let padded = Buffer.from(data);
  if (padded.length % 4 !== 0) padded = Buffer.concat([padded, Buffer.alloc(mod(-padded.length, 4))]);
  const words = [];
  for (let i = 0; i < padded.length; i += 4) words.push(padded.readUInt32LE(i) >>> 0);
  if (words.length % 2) words.push(0);
  return words;
}

function cs64_digest(data, digest) {
  let key_a = digest.readUInt32LE(0) >>> 0;
  let key_b = digest.readUInt32LE(4) >>> 0;
  key_a |= 1; key_b |= 1;
  const factors = [mul32(key_a, CS64_FACTOR), mul32(key_b, CS64_FACTOR)];
  // Python initializes `terms`/`offsets` with 14 coefficient-derived entries
  // BEFORE appending the data-word terms. They must be prepended, not dropped.
  const T = [], O = [];
  for (let index = 0; index < CS64_COEFFICIENTS.length; index++) {
    T.push(mul32(CS64_COEFFICIENTS[index][0], factors[index % 2]) & MASK);
    O.push(CS64_COEFFICIENTS[index][1] >>> 0);
  }
  const twords = words_le4_even(Buffer.concat([Buffer.from([0x00]), data]));
  for (let index = 0; index < twords.length; index++) {
    const word = twords[index];
    const term = mul32(word, (index % 2 === 0) ? key_a : key_b);
    const offset = mul32(rol16(word), (index % 2 === 0) ? 0xEF0569FB : 0xC31713DB);
    let t = term, o = offset;
    if (index === 0) { t = (term + mul32(CS64_ADJ0, factors[0])) & MASK; o = (offset + CS64_ADJ1) & MASK; }
    T.push(t & MASK); O.push(o & MASK);
  }
  let swap_acc = 0, swap_last = 0, state = 0, acc = 0;
  for (let index = 0; index < T.length; index += 2) {
    const x = T[index], y = T[index + 1];
    let t = rol16((O[index] + x) & MASK);
    let q = mul32(t, 0x76F50F34);
    swap_acc = (swap_acc + (mul32(rol16(q), 0xC3EFEA97) + q)) & MASK;
    t = rol16((O[index + 1] + y) & MASK);
    q = mul32(t, 0x1881CE3C);
    swap_last = (mul32(rol16(q), 0x35BD1EC9) + q) & MASK;
    swap_acc = (swap_acc + swap_last) & MASK;

    state = (mul32(state, key_a) + x) & MASK;
    state = mul32(rol16(state), 0xCF98B111);
    state = mul32(rol16(state), 0x87085B9F);
    state = mul32(rol16(state), 0x12CEB96D);
    state = mul32(rol16(state), 0x257E1D83);
    acc = (acc + state) & MASK;
    t = (mul32(state, key_b) + y) & MASK;
    t = mul32(rol16(t), 0xA27416F5);
    t = mul32(rol16(t), 0xD38396FF);
    let tmp = mul32(rol16(t), 0x7C932B89);
    state = mul32(rol16(tmp), 0xBFA49F69);
    acc = (acc + state) & MASK;
  }
  return [swap_last ^ state, swap_acc ^ acc];
}

function token_hash(data) {
  const digest = sha256_digest(data);
  const cs = cs64_digest(data, digest);
  const buf = Buffer.alloc(8);
  buf.writeUInt32LE(cs[0] >>> 0, 0);
  buf.writeUInt32LE(cs[1] >>> 0, 4);
  return [buf.toString("hex").toUpperCase(), digest.toString("hex").toUpperCase()];
}

function generate_sec_ms_gec_v2(unix_timestamp) {
  let ticks = unix_timestamp + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= S_TO_NS / 100;
  const strToHash = ticks.toFixed(0) + TRUSTED_CLIENT_TOKEN;
  const [cs64, sha] = token_hash(Buffer.from(strToHash, "ascii"));
  return `${cs64}-${sha}`;
}

export {
  generate_sec_ms_gec_v2, ROUND, SHA256_INITIAL, SHA256_STATE, SHA256_SCHEDULE,
  expand_schedule, sha256_rounds, sha256_init, sha256_digest, token_hash,
  TRUSTED_CLIENT_TOKEN, WIN_EPOCH, S_TO_NS,
};

const refs = {
  "1700000000.0": "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2",
  "1717000000.0": "B8A9934EA00F5E19-6117468A7431C7137A054AE63CA06453832FAADF0744C0A9D6545074DD75FB31",
  "1730000000.0": "50065ABF67B90F95-49BDAF24D28ECEB38DAEEC84DEAA71E91F92945EA8A47921C58FB4F8F79A4F5E",
  "1700000123.456": "0919602B5750900A-EC9DD394F23CB5635CF62A0E8E24136DCD32B26D10C543B10082E482D7516397",
};

if (decodeURI(import.meta.url) === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  let ok = true;
  for (const [ts, expected] of Object.entries(refs)) {
    const got = generate_sec_ms_gec_v2(Number(ts));
    const match = got === expected;
    if (!match) ok = false;
    console.log(`${match ? "OK " : "FAIL"} ts=${ts}\n  exp=${expected}\n  got=${got}`);
  }
  console.log(ok ? "\nALL MATCH" : "\nMISMATCH");
}
