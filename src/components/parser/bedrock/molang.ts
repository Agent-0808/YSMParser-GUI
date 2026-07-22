export type MolangValue = number | ((t: number) => number);

const PRELUDE = `
const __sin = (x) => Math.sin(x * Math.PI / 180);
const __cos = (x) => Math.cos(x * Math.PI / 180);
const __tan = (x) => Math.tan(x * Math.PI / 180);
const __asin = (x) => Math.asin(x) * 180 / Math.PI;
const __acos = (x) => Math.acos(x) * 180 / Math.PI;
const __atan = (x) => Math.atan(x) * 180 / Math.PI;
const __atan2 = (y, x) => Math.atan2(y, x) * 180 / Math.PI;
const __abs = Math.abs;
const __ceil = Math.ceil;
const __floor = Math.floor;
const __round = Math.round;
const __sqrt = Math.sqrt;
const __pow = Math.pow;
const __exp = Math.exp;
const __ln = Math.log;
const __min = Math.min;
const __max = Math.max;
const __mod = (a, b) => a - b * Math.floor(a / b);
const __clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const __lerp = (a, b, k) => a + (b - a) * k;
const __pi = Math.PI;
`;

const MATH_FNS = [
  "sin", "cos", "tan", "asin", "acos", "atan2", "atan",
  "abs", "ceil", "floor", "round", "sqrt", "pow", "exp", "ln",
  "mod", "min", "max", "clamp", "lerp",
];

function transform(expr: string): string {
  let e = expr.toLowerCase().trim();
  if (e.endsWith(";")) e = e.slice(0, -1).trim();
  if (e.includes(";")) e = e.split(";").map((s) => s.trim()).filter(Boolean).pop() ?? "0";
  if (e.startsWith("return ")) e = e.slice("return ".length);
  e = e.replace(/\bq\./g, "query.");
  e = e.replace(/\bv\./g, "variable.");
  e = e.replace(/\bt\./g, "temp.");
  e = e.replace(/\bmath\.pi\b/g, "__pi");
  for (const fn of MATH_FNS) {
    const re = new RegExp(`\\bmath\\.${fn}\\b`, "g");
    e = e.replace(re, `__${fn}`);
  }
  e = e.replace(/\bmath\.[a-z_0-9]+/g, "0");
  e = e.replace(/\bquery\.anim_time\b/g, "t");
  e = e.replace(/\bquery\.life_time\b/g, "t");
  e = e.replace(/\bquery\.[a-z_0-9]+/g, "0");
  e = e.replace(/\bvariable\.[a-z_0-9]+/g, "0");
  e = e.replace(/\btemp\.[a-z_0-9]+/g, "0");
  return e;
}

function compile(expr: string): (t: number) => number {
  const body = transform(expr);
  try {
    const fn = new Function(
      "t",
      `${PRELUDE}\ntry { return Number(${body}) || 0; } catch (e) { return 0; }`,
    ) as (t: number) => number;
    fn(0);
    return fn;
  } catch {
    return () => 0;
  }
}

export function compileMolangValue(v: unknown): MolangValue {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const trimmed = v.trim();
  if (trimmed === "") return 0;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return parseFloat(trimmed);
  return compile(trimmed);
}

export function evalMolangValue(v: MolangValue, t: number): number {
  return typeof v === "number" ? v : v(t);
}
