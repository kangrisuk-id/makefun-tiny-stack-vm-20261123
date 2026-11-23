// Tiny stack VM (make.fun tiny-stack ISA v1): wrapping 32-bit values, 256-deep stack, 64-deep call
// stack, 256 words of memory, ten traps, 1,000,000 steps, 65,536 output bytes. Answers every
// /input/<id> as /output/<id>/stdout.bin + exit.txt. Run: MAKEFUN_INPUT_DIR=<in> MAKEFUN_OUTPUT_DIR=<out> node main.ts
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Runs one program to HALT, EXIT or a trap; returns [output bytes, exit code].
function run(p, inp) {
  const s = new Int32Array(256), cs = new Int32Array(64), m = new Int32Array(256), out = new Uint8Array(65536);
  let sp = 0, cp = 0, pc = 0, steps = 0, ia = 0, oa = 0, x = -1;
  const n = p.length;
  while (x < 0) {
    if (steps >= 1000000) { x = 10; break; }
    if (pc < 0 || pc >= n) { x = 9; break; }
    const op = p[pc];
    const imm = op === 1 ? 1 : op === 2 ? 4 : op >= 0x30 && op <= 0x33 ? 2 : 0;
    if (imm && pc + imm >= n) { x = 9; break; }
    steps++;
    if (op === 0) x = 0;
    else if (op === 1) {
      if (sp > 255) x = 3; else { const v = p[pc + 1]; s[sp++] = v > 127 ? v - 256 : v; pc += 2; }
    } else if (op === 2) {
      if (sp > 255) x = 3; else { s[sp++] = p[pc + 1] | p[pc + 2] << 8 | p[pc + 3] << 16 | p[pc + 4] << 24; pc += 5; }
    } else if (op === 3) { if (sp < 1) x = 2; else { sp--; pc++; } }
    else if (op === 4) { if (sp < 1) x = 2; else if (sp > 255) x = 3; else { s[sp] = s[sp - 1]; sp++; pc++; } }
    else if (op === 5) { if (sp < 2) x = 2; else { const t = s[sp - 1]; s[sp - 1] = s[sp - 2]; s[sp - 2] = t; pc++; } }
    else if (op === 6) { if (sp < 2) x = 2; else if (sp > 255) x = 3; else { s[sp] = s[sp - 2]; sp++; pc++; } }
    else if (op === 7) {
      if (sp < 3) x = 2; else { const a = s[sp - 3]; s[sp - 3] = s[sp - 2]; s[sp - 2] = s[sp - 1]; s[sp - 1] = a; pc++; }
    } else if (op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b && op !== 0x1f) {
      if (sp < 2) x = 2;
      else {
        const b = s[--sp], a = s[sp - 1];
        if (b === 0 && (op === 0x13 || op === 0x14 || op === 0x15 || op === 0x16)) x = 4;
        else {
          s[sp - 1] = op === 0x10 ? (a + b) | 0 : op === 0x11 ? (a - b) | 0 : op === 0x12 ? Math.imul(a, b)
            : op === 0x13 ? Math.trunc(a / b) | 0 : op === 0x14 ? a % b | 0
            : op === 0x15 ? Math.trunc((a >>> 0) / (b >>> 0)) | 0 : op === 0x16 ? (a >>> 0) % (b >>> 0) | 0
            : op === 0x18 ? a & b : op === 0x19 ? a | b : op === 0x1a ? a ^ b : op === 0x1c ? a << (b & 31)
            : op === 0x1d ? a >> (b & 31) : op === 0x1e ? a >>> (b & 31) | 0 : op === 0x20 ? (a === b ? 1 : 0)
            : op === 0x21 ? (a < b ? 1 : 0) : (a >>> 0) < (b >>> 0) ? 1 : 0;
          pc++;
        }
      }
    } else if (op === 0x17) { if (sp < 1) x = 2; else { s[sp - 1] = -s[sp - 1] | 0; pc++; } }
    else if (op === 0x1b) { if (sp < 1) x = 2; else { s[sp - 1] = ~s[sp - 1]; pc++; } }
    else if (op >= 0x30 && op <= 0x32) {
      let off = p[pc + 1] | p[pc + 2] << 8;
      if (off > 32767) off -= 65536;
      if (op === 0x30) pc += 3 + off;
      else if (sp < 1) x = 2;
      else { const v = s[--sp]; pc += (op === 0x31 ? v === 0 : v !== 0) ? 3 + off : 3; }
    } else if (op === 0x33) { if (cp > 63) x = 7; else { cs[cp++] = pc + 3; pc = p[pc + 1] | p[pc + 2] << 8; } }
    else if (op === 0x34) { if (cp < 1) x = 8; else pc = cs[--cp]; }
    else if (op === 0x40) { if (sp < 1) x = 2; else if (s[sp - 1] < 0 || s[sp - 1] > 255) x = 6; else { s[sp - 1] = m[s[sp - 1]]; pc++; } }
    else if (op === 0x41) { if (sp < 2) x = 2; else { const a = s[--sp]; if (a < 0 || a > 255) x = 6; else { m[a] = s[--sp]; pc++; } } }
    else if (op === 0x50) {
      if (sp < 1) x = 2;
      else { const t = String(s[--sp]); if (oa + t.length > 65536) x = 11; else { for (let i = 0; i < t.length; i++) out[oa++] = t.charCodeAt(i); pc++; } }
    } else if (op === 0x51) { if (sp < 1) x = 2; else if (oa > 65535) x = 11; else { out[oa++] = s[--sp] & 255; pc++; } }
    else if (op === 0x52) { if (sp > 255) x = 3; else { s[sp++] = ia < inp.length ? inp[ia++] : -1; pc++; } }
    else if (op === 0x53) { if (sp < 1) x = 2; else x = s[--sp] & 255; }
    else x = 5;
  }
  return [out.subarray(0, oa), x];
}

for (const id of readdirSync(I).sort()) {
  let inp = new Uint8Array(0);
  try { inp = readFileSync(join(I, id, 'input.bin')); } catch { /* no input file: reads as empty */ }
  const [bytes, code] = run(readFileSync(join(I, id, 'program.bin')), inp);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), bytes);
  writeFileSync(join(O, id, 'exit.txt'), code + '\n');
}
