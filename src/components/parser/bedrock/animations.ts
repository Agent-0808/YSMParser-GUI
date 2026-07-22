// Bedrock animation parser + sampler.
//
// Input shape (`.animation.json`):
//   {
//     "animations": {
//       "animation.name": {
//         "loop": true | false | "hold_on_last_frame",
//         "animation_length": 1.0,
//         "bones": {
//           "boneName": {
//             "rotation": [x, y, z] | { "0.0": [x,y,z], ... } | "molangExpr",
//             "position": ..., "scale": ...
//           }
//         }
//       }
//     }
//   }

import { compileMolangValue, evalMolangValue, type MolangValue } from "./molang";

export type Vec3M = [MolangValue, MolangValue, MolangValue];

export type ChannelType = "rotation" | "position" | "scale";

export interface Keyframe {
  time: number;
  value: Vec3M;
  interpolation: "linear" | "step";
}

export interface AnimChannel {
  type: ChannelType;
  keyframes: Keyframe[]; // sorted ascending by time
}

export interface BoneAnim {
  rotation?: AnimChannel;
  position?: AnimChannel;
  scale?: AnimChannel;
}

export interface Animation {
  id: string;        // unique per file+name
  name: string;
  source: string;    // file path
  length: number;
  loop: boolean;
  holdOnLastFrame: boolean;
  bones: Record<string, BoneAnim>;
}

function asVec3M(raw: unknown): Vec3M {
  if (Array.isArray(raw)) {
    return [
      compileMolangValue(raw[0]),
      compileMolangValue(raw[1] ?? raw[0]),
      compileMolangValue(raw[2] ?? raw[0]),
    ];
  }
  if (typeof raw === "number" || typeof raw === "string") {
    const v = compileMolangValue(raw);
    return [v, v, v];
  }
  // { post: [...], pre: [...] } shape — take post
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.post)) return asVec3M(o.post);
    if (Array.isArray(o.pre)) return asVec3M(o.pre);
  }
  return [0, 0, 0];
}

function parseChannel(type: ChannelType, raw: unknown): AnimChannel | undefined {
  if (raw == null) return undefined;
  // Constant value (array or scalar)
  if (Array.isArray(raw) || typeof raw === "number" || typeof raw === "string") {
    return {
      type,
      keyframes: [{ time: 0, value: asVec3M(raw), interpolation: "linear" }],
    };
  }
  // Object: either a keyframe map, or a { post, pre, lerp_mode } single keyframe.
  if (typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  // Single-keyframe { post: ... } shape (time = 0)
  if ("post" in o || "pre" in o) {
    return {
      type,
      keyframes: [
        {
          time: 0,
          value: asVec3M(o),
          interpolation: o.lerp_mode === "step" ? "step" : "linear",
        },
      ],
    };
  }
  // Multi-keyframe map { "0.0": ..., "0.5": ... }
  const keyframes: Keyframe[] = [];
  for (const [key, val] of Object.entries(o)) {
    const time = parseFloat(key);
    if (!Number.isFinite(time)) continue;
    const inner = val as Record<string, unknown>;
    let interpolation: "linear" | "step" = "linear";
    let value: Vec3M;
    if (inner && typeof inner === "object" && !Array.isArray(inner) && "post" in inner) {
      value = asVec3M(inner);
      if ((inner as Record<string, unknown>).lerp_mode === "step") interpolation = "step";
    } else {
      value = asVec3M(val);
    }
    keyframes.push({ time, value, interpolation });
  }
  if (keyframes.length === 0) return undefined;
  keyframes.sort((a, b) => a.time - b.time);
  return { type, keyframes };
}

function parseSingleAnimation(name: string, raw: unknown, source: string): Animation | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const length =
    typeof a.animation_length === "number"
      ? a.animation_length
      : typeof a.animation_length === "string"
        ? parseFloat(a.animation_length as string) || 1
        : 1;
  const loopRaw = a.loop;
  const loop = loopRaw === true;
  const holdOnLastFrame = loopRaw === "hold_on_last_frame";

  const bones: Record<string, BoneAnim> = {};
  const bonesObj = a.bones as Record<string, unknown> | undefined;
  if (bonesObj && typeof bonesObj === "object") {
    for (const [boneName, b] of Object.entries(bonesObj)) {
      if (!b || typeof b !== "object") continue;
      const bo = b as Record<string, unknown>;
      const anim: BoneAnim = {};
      const rot = parseChannel("rotation", bo.rotation);
      if (rot) anim.rotation = rot;
      const pos = parseChannel("position", bo.position);
      if (pos) anim.position = pos;
      const sca = parseChannel("scale", bo.scale);
      if (sca) anim.scale = sca;
      if (anim.rotation || anim.position || anim.scale) bones[boneName] = anim;
    }
  }

  return {
    id: `${source}::${name}`,
    name,
    source,
    length: Math.max(length, 0.001),
    loop,
    holdOnLastFrame,
    bones,
  };
}

export interface AnimationSourceFile {
  path: string;
  data: Uint8Array;
}

export function parseAnimationsFromFiles(files: AnimationSourceFile[]): Animation[] {
  const out: Animation[] = [];
  for (const f of files) {
    if (!f.path.toLowerCase().endsWith(".animation.json")) continue;
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(f.data));
    } catch {
      continue;
    }
    const anims = (json as Record<string, unknown>)?.animations;
    if (!anims || typeof anims !== "object") continue;
    for (const [name, raw] of Object.entries(anims as Record<string, unknown>)) {
      const parsed = parseSingleAnimation(name, raw, f.path);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

function evalVec(v: Vec3M, t: number): [number, number, number] {
  return [evalMolangValue(v[0], t), evalMolangValue(v[1], t), evalMolangValue(v[2], t)];
}

export function sampleChannel(channel: AnimChannel, time: number): [number, number, number] {
  const kfs = channel.keyframes;
  if (kfs.length === 0) return [0, 0, 0];
  if (kfs.length === 1) return evalVec(kfs[0].value, time);

  if (time <= kfs[0].time) return evalVec(kfs[0].value, time);
  if (time >= kfs[kfs.length - 1].time) return evalVec(kfs[kfs.length - 1].value, time);

  // Linear scan is fine for typical small keyframe counts. For longer
  // animations binary search would help; the cost is hidden by useFrame timing.
  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1].time < time) i++;
  const a = kfs[i];
  const b = kfs[i + 1];

  if (a.interpolation === "step") return evalVec(a.value, time);

  const span = b.time - a.time;
  const k = span > 0 ? (time - a.time) / span : 0;
  const va = evalVec(a.value, time);
  const vb = evalVec(b.value, time);
  return [
    va[0] + (vb[0] - va[0]) * k,
    va[1] + (vb[1] - va[1]) * k,
    va[2] + (vb[2] - va[2]) * k,
  ];
}
