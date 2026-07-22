"use client";

import * as React from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import {
  parseAnimationsFromFiles,
  sampleChannel,
  type Animation,
} from "./bedrock/animations";

interface OutputFile {
  path: string;
  data: Uint8Array;
}

type Vec2 = [number, number];
type Vec3 = [number, number, number];

interface RawBedrockFace { uv: Vec2; uv_size?: Vec2 }
interface RawBedrockFaces {
  north?: RawBedrockFace; south?: RawBedrockFace;
  east?: RawBedrockFace;  west?: RawBedrockFace;
  up?: RawBedrockFace;    down?: RawBedrockFace;
}
interface RawCube {
  origin?: Vec3; size?: Vec3; pivot?: Vec3; rotation?: Vec3;
  uv?: Vec2 | RawBedrockFaces; inflate?: number; mirror?: boolean;
}
interface RawBone {
  name: string; parent?: string; pivot?: Vec3; rotation?: Vec3;
  mirror?: boolean; inflate?: number; cubes?: RawCube[];
}
interface RawGeometry {
  description?: { identifier?: string; texture_width?: number; texture_height?: number };
  bones?: RawBone[];
}

interface Cube {
  from: Vec3; to: Vec3; origin: Vec3; rotation: Vec3;
  inflate: number; mirror_uv: boolean;
  size: Vec3; uv: Vec2 | RawBedrockFaces | undefined;
}

interface Bone {
  name: string; parent?: string;
  pivot: Vec3; rotation: Vec3;
  mirror: boolean; cubes: Cube[];
}


function loadCube(s: RawCube, boneInflate?: number, boneMirror?: boolean): Cube {
  const size: Vec3 = s.size ?? [0, 0, 0];
  const rawOrigin: Vec3 = s.origin ?? [0, 0, 0];
  const rawPivot: Vec3 = s.pivot ?? [0, 0, 0];
  const rawRot: Vec3 = s.rotation ?? [0, 0, 0];
  const origin: Vec3 = [-rawPivot[0], rawPivot[1], rawPivot[2]];
  const rotation: Vec3 = [-rawRot[0], -rawRot[1], rawRot[2]];
  const from: Vec3 = [-(rawOrigin[0] + size[0]), rawOrigin[1], rawOrigin[2]];
  const to: Vec3 = [from[0] + size[0], from[1] + size[1], from[2] + size[2]];
  const inflate = typeof s.inflate === "number" ? s.inflate : (boneInflate ?? 0);
  const mirror_uv = s.mirror === undefined ? !!boneMirror : !!s.mirror;
  return { from, to, origin, rotation, inflate, mirror_uv, size, uv: s.uv };
}

function loadBone(b: RawBone): Bone {
  const rawPivot: Vec3 = b.pivot ?? [0, 0, 0];
  const rawRot: Vec3 = b.rotation ?? [0, 0, 0];
  return {
    name: b.name,
    parent: b.parent,
    pivot: [-rawPivot[0], rawPivot[1], rawPivot[2]],
    rotation: [-rawRot[0], -rawRot[1], rawRot[2]],
    mirror: !!b.mirror,
    cubes: (b.cubes ?? []).map((c) => loadCube(c, b.inflate, b.mirror)),
  };
}

// =================================================================================================
// setShape — port of three_custom.js BufferGeometry.prototype.setShape.
// =================================================================================================

function writeShape(positions: Float32Array, from: Vec3, to: Vec3): void {
  positions.set([
    to[0], to[1], to[2],
    to[0], to[1], from[2],
    to[0], from[1], to[2],
    to[0], from[1], from[2],
  ], 0);
  positions.set([
    from[0], to[1], from[2],
    from[0], to[1], to[2],
    from[0], from[1], from[2],
    from[0], from[1], to[2],
  ], 12);
  positions.set([
    from[0], to[1], from[2],
    to[0], to[1], from[2],
    from[0], to[1], to[2],
    to[0], to[1], to[2],
  ], 24);
  positions.set([
    from[0], from[1], to[2],
    to[0], from[1], to[2],
    from[0], from[1], from[2],
    to[0], from[1], from[2],
  ], 36);
  positions.set([
    from[0], to[1], to[2],
    to[0], to[1], to[2],
    from[0], from[1], to[2],
    to[0], from[1], to[2],
  ], 48);
  positions.set([
    to[0], to[1], from[2],
    from[0], to[1], from[2],
    to[0], from[1], from[2],
    from[0], from[1], from[2],
  ], 60);
}

interface BoxUVEntry { from: Vec2; size: Vec2 }

function boxUVFaceList(size: Vec3, mirror: boolean): BoxUVEntry[] {
  const sx = size[0], sy = size[1], sz = size[2];
  const list: BoxUVEntry[] = [
    { from: [0,            sz], size: [sz,  sy] },
    { from: [sz + sx,      sz], size: [sz,  sy] },
    { from: [sz + sx,      sz], size: [-sx, -sz] },
    { from: [sz + sx * 2,  0],  size: [-sx, sz] },
    { from: [sz * 2 + sx,  sz], size: [sx,  sy] },
    { from: [sz,           sz], size: [sx,  sy] },
  ];
  if (mirror) {
    for (const f of list) {
      f.from[0] += f.size[0];
      f.size[0] *= -1;
    }
    const e = { from: [list[0].from[0], list[0].from[1]] as Vec2, size: [list[0].size[0], list[0].size[1]] as Vec2 };
    list[0] = { from: list[1].from, size: list[1].size };
    list[1] = e;
  }
  return list;
}

function writeFaceUV(arr: Float32Array, faceIndex: number, uv: [number, number, number, number], pw: number, ph: number): void {
  const off = faceIndex * 8;
  const u0 = uv[0] / pw, u1 = uv[2] / pw;
  const v0 = 1 - uv[1] / ph, v1 = 1 - uv[3] / ph;
  arr[off + 0] = u0; arr[off + 1] = v0;
  arr[off + 2] = u1; arr[off + 3] = v0;
  arr[off + 4] = u0; arr[off + 5] = v1;
  arr[off + 6] = u1; arr[off + 7] = v1;
}

const PER_FACE_KEYS: (keyof RawBedrockFaces)[] = ["east", "west", "up", "down", "south", "north"];

function applyUV(geom: THREE.BoxGeometry, cube: Cube, pw: number, ph: number): void {
  const arr = geom.attributes.uv.array as Float32Array;
  if (Array.isArray(cube.uv)) {
    const [ox, oy] = cube.uv;
    const faceList = boxUVFaceList(cube.size, cube.mirror_uv);
    for (let i = 0; i < 6; i++) {
      const f = faceList[i];
      const uv: [number, number, number, number] = [
        f.from[0] + ox, f.from[1] + oy,
        f.from[0] + f.size[0] + ox, f.from[1] + f.size[1] + oy,
      ];
      writeFaceUV(arr, i, uv, pw, ph);
    }
  } else if (cube.uv) {
    const faces = cube.uv;
    const defaults: Record<keyof RawBedrockFaces, Vec2> = {
      east:  [cube.size[2], cube.size[1]],
      west:  [cube.size[2], cube.size[1]],
      up:    [cube.size[0], cube.size[2]],
      down:  [cube.size[0], cube.size[2]],
      south: [cube.size[0], cube.size[1]],
      north: [cube.size[0], cube.size[1]],
    };
    for (let i = 0; i < 6; i++) {
      const key = PER_FACE_KEYS[i];
      const face = faces[key];
      if (!face?.uv) {
        for (let j = 0; j < 8; j++) arr[i * 8 + j] = 0;
        continue;
      }
      const w = face.uv_size?.[0] ?? defaults[key][0];
      const h = face.uv_size?.[1] ?? defaults[key][1];
      const uv: [number, number, number, number] = [face.uv[0], face.uv[1], face.uv[0] + w, face.uv[1] + h];
      writeFaceUV(arr, i, uv, pw, ph);
    }
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = 0;
  }
  geom.attributes.uv.needsUpdate = true;
}

function makeCubeGeometry(cube: Cube, pw: number, ph: number): THREE.BoxGeometry {
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const positions = geom.attributes.position.array as Float32Array;
  const inflate = cube.inflate;
  const from: Vec3 = [
    cube.from[0] - cube.origin[0] - inflate,
    cube.from[1] - cube.origin[1] - inflate,
    cube.from[2] - cube.origin[2] - inflate,
  ];
  const to: Vec3 = [
    cube.to[0] - cube.origin[0] + inflate,
    cube.to[1] - cube.origin[1] + inflate,
    cube.to[2] - cube.origin[2] + inflate,
  ];
  for (let i = 0; i < 3; i++) if (from[i] === to[i]) to[i] += 0.001;
  writeShape(positions, from, to);
  geom.attributes.position.needsUpdate = true;
  applyUV(geom, cube, pw, ph);
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

const DEG = Math.PI / 180;

interface RestPose { pos: Vec3; rot: Vec3 }

interface SceneBuilt {
  root: THREE.Group;
  bbox: THREE.Box3;
  bonesByName: Map<string, THREE.Group>;
  restPoses: Map<string, RestPose>;
}

function hasRotation(rot: Vec3): boolean {
  return rot[0] !== 0 || rot[1] !== 0 || rot[2] !== 0;
}

function buildBoneNode(
  bone: Bone,
  parentPivot: Vec3,
  childrenMap: Map<string | undefined, Bone[]>,
  material: THREE.Material,
  pw: number,
  ph: number,
  bonesByName: Map<string, THREE.Group>,
  restPoses: Map<string, RestPose>,
): THREE.Group {
  const node = new THREE.Group();
  node.name = bone.name;
  const px = bone.pivot[0] - parentPivot[0];
  const py = bone.pivot[1] - parentPivot[1];
  const pz = bone.pivot[2] - parentPivot[2];
  node.position.set(px, py, pz);
  node.rotation.order = "ZYX";
  node.rotation.set(bone.rotation[0] * DEG, bone.rotation[1] * DEG, bone.rotation[2] * DEG);

  bonesByName.set(bone.name, node);
  bonesByName.set(bone.name.toLowerCase(), node);
  restPoses.set(bone.name, {
    pos: [px, py, pz],
    rot: [node.rotation.x, node.rotation.y, node.rotation.z],
  });

  const flatGeoms: THREE.BoxGeometry[] = [];
  for (const cube of bone.cubes) {
    if (hasRotation(cube.rotation)) {
      const geom = makeCubeGeometry(cube, pw, ph);
      const mesh = new THREE.Mesh(geom, material);
      mesh.position.set(cube.origin[0] - bone.pivot[0], cube.origin[1] - bone.pivot[1], cube.origin[2] - bone.pivot[2]);
      mesh.rotation.order = "ZYX";
      mesh.rotation.set(cube.rotation[0] * DEG, cube.rotation[1] * DEG, cube.rotation[2] * DEG);
      node.add(mesh);
    } else {
      const geom = makeCubeGeometry(cube, pw, ph);
      geom.translate(cube.origin[0] - bone.pivot[0], cube.origin[1] - bone.pivot[1], cube.origin[2] - bone.pivot[2]);
      flatGeoms.push(geom);
    }
  }
  if (flatGeoms.length > 0) {
    const merged = mergeGeometries(flatGeoms, false);
    for (const g of flatGeoms) g.dispose();
    if (merged) node.add(new THREE.Mesh(merged, material));
  }

  for (const child of childrenMap.get(bone.name) ?? []) {
    node.add(buildBoneNode(child, bone.pivot, childrenMap, material, pw, ph, bonesByName, restPoses));
  }
  return node;
}

function buildRoot(geometry: RawGeometry, material: THREE.Material): SceneBuilt {
  const pw = geometry.description?.texture_width ?? 64;
  const ph = geometry.description?.texture_height ?? 64;
  const bones = (geometry.bones ?? []).map(loadBone);

  const childrenMap = new Map<string | undefined, Bone[]>();
  for (const bone of bones) {
    const list = childrenMap.get(bone.parent) ?? [];
    list.push(bone);
    childrenMap.set(bone.parent, list);
  }

  const root = new THREE.Group();
  const bonesByName = new Map<string, THREE.Group>();
  const restPoses = new Map<string, RestPose>();
  for (const r of childrenMap.get(undefined) ?? []) {
    root.add(buildBoneNode(r, [0, 0, 0], childrenMap, material, pw, ph, bonesByName, restPoses));
  }
  return { root, bbox: new THREE.Box3().setFromObject(root), bonesByName, restPoses };
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}

function resolveBone(name: string, bonesByName: Map<string, THREE.Group>): THREE.Group | undefined {
  return bonesByName.get(name) ?? bonesByName.get(name.toLowerCase());
}

function resetToRest(bonesByName: Map<string, THREE.Group>, restPoses: Map<string, RestPose>): void {
  for (const [name, bone] of bonesByName) {
    const rest = restPoses.get(name);
    if (!rest) continue;
    bone.position.set(rest.pos[0], rest.pos[1], rest.pos[2]);
    bone.rotation.set(rest.rot[0], rest.rot[1], rest.rot[2]);
    bone.scale.set(1, 1, 1);
  }
}

function applyAnimation(
  anim: Animation,
  time: number,
  bonesByName: Map<string, THREE.Group>,
  restPoses: Map<string, RestPose>,
): void {
  resetToRest(bonesByName, restPoses);
  for (const [boneName, channels] of Object.entries(anim.bones)) {
    const bone = resolveBone(boneName, bonesByName);
    if (!bone) continue;
    const rest = restPoses.get(boneName) ?? restPoses.get(boneName.toLowerCase());
    if (!rest) continue;
    if (channels.rotation) {
      const v = sampleChannel(channels.rotation, time);
      bone.rotation.x = rest.rot[0] + (-v[0]) * DEG;
      bone.rotation.y = rest.rot[1] + (-v[1]) * DEG;
      bone.rotation.z = rest.rot[2] + v[2] * DEG;
    }
    if (channels.position) {
      const v = sampleChannel(channels.position, time);
      bone.position.x = rest.pos[0] + (-v[0]);
      bone.position.y = rest.pos[1] + v[1];
      bone.position.z = rest.pos[2] + v[2];
    }
    if (channels.scale) {
      const v = sampleChannel(channels.scale, time);
      bone.scale.set(v[0] || 1e-7, v[1] || 1e-7, v[2] || 1e-7);
    }
  }
}

function pickGeometry(json: unknown): RawGeometry | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const arr = j["minecraft:geometry"];
  if (Array.isArray(arr) && arr.length > 0) return arr[0] as RawGeometry;
  for (const key of Object.keys(j)) {
    if (key.startsWith("geometry.")) {
      const v = j[key];
      if (v && typeof v === "object") {
        const g = v as Record<string, unknown>;
        if (Array.isArray(g.bones)) {
          return {
            description: {
              identifier: key,
              texture_width: (g.texturewidth as number) ?? 64,
              texture_height: (g.textureheight as number) ?? 64,
            },
            bones: g.bones as RawBone[],
          };
        }
      }
    }
  }
  return null;
}

function findCandidateTextures(modelPath: string, files: OutputFile[]): OutputFile[] {
  const dir = modelPath.replace(/[^/]*$/, "");
  const modelRoot = dir.replace(/models\/$/, "");
  return files.filter((f) => {
    if (!f.path.toLowerCase().endsWith(".png")) return false;
    if (!f.path.startsWith(modelRoot)) return false;
    const rel = f.path.slice(modelRoot.length).toLowerCase();
    if (rel.startsWith("avatar/") || rel.includes("/avatar/")) return false;
    return true;
  });
}

function findCandidateAnimations(modelPath: string, files: OutputFile[]): OutputFile[] {
  const dir = modelPath.replace(/[^/]*$/, "");
  const modelRoot = dir.replace(/models\/$/, "");
  return files.filter((f) => f.path.toLowerCase().endsWith(".animation.json") && f.path.startsWith(modelRoot));
}

function makeTextureFromBytes(data: Uint8Array): { texture: THREE.Texture; cleanup: () => void } {
  const blob = new Blob([new Uint8Array(data) as BlobPart], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const tex = new THREE.Texture();
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  const img = new Image();
  img.onload = () => { tex.image = img; tex.needsUpdate = true; };
  img.onerror = () => {};
  img.src = url;
  return { texture: tex, cleanup: () => { URL.revokeObjectURL(url); tex.dispose(); } };
}

interface AnimationState {
  animation: Animation | null;
  playing: boolean;
  timeRef: React.MutableRefObject<number>;
  bonesByName: Map<string, THREE.Group> | null;
  restPoses: Map<string, RestPose> | null;
  onLoopEnd: () => void;
}

function AnimationRunner({ state }: { state: AnimationState }) {
  useFrame((_, delta) => {
    const { animation, playing, timeRef, bonesByName, restPoses } = state;
    if (!animation || !bonesByName || !restPoses) return;
    if (playing) {
      let t = timeRef.current + delta;
      if (t >= animation.length) {
        if (animation.loop) {
          t = t % animation.length;
        } else if (animation.holdOnLastFrame) {
          t = animation.length;
          state.onLoopEnd();
        } else {
          t = animation.length;
          state.onLoopEnd();
        }
      }
      timeRef.current = t;
    }
    applyAnimation(animation, timeRef.current, bonesByName, restPoses);
  });
  return null;
}

function ModelScene({
  geometry,
  texture,
  onBuilt,
}: {
  geometry: RawGeometry;
  texture: THREE.Texture | null;
  onBuilt: (b: SceneBuilt) => void;
}) {
  const material = React.useMemo(() => {
    if (texture) {
      return new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.01,
        side: THREE.DoubleSide,
      });
    }
    return new THREE.MeshBasicMaterial({ color: "#9aa0a6", side: THREE.DoubleSide });
  }, [texture]);

  const built = React.useMemo(() => buildRoot(geometry, material), [geometry, material]);

  React.useEffect(() => {
    onBuilt(built);
    return () => {
      disposeTree(built.root);
      material.dispose();
    };
  }, [built, material, onBuilt]);

  const center = React.useMemo(() => {
    const c = new THREE.Vector3();
    built.bbox.getCenter(c);
    return c;
  }, [built]);

  return (
    <group position={[-center.x, -built.bbox.min.y, -center.z]}>
      <primitive object={built.root} />
    </group>
  );
}

export interface BedrockModelViewerProps {
  modelFile: OutputFile;
  allFiles: OutputFile[];
}

export default function BedrockModelViewer({ modelFile, allFiles }: BedrockModelViewerProps) {
  const json = React.useMemo(() => {
    try { return JSON.parse(new TextDecoder().decode(modelFile.data)); } catch { return null; }
  }, [modelFile]);

  const geometry = React.useMemo(() => pickGeometry(json), [json]);

  const candidateTextures = React.useMemo(
    () => findCandidateTextures(modelFile.path, allFiles),
    [modelFile, allFiles],
  );

  const [texturePath, setTexturePath] = React.useState<string>(() => {
    const baseName = modelFile.path.split("/").pop()?.replace(/\.json$/, "") ?? "";
    const match = candidateTextures.find((t) => t.path.includes(`/textures/${baseName}.png`));
    return (match ?? candidateTextures[0])?.path ?? "";
  });

  React.useEffect(() => {
    if (!candidateTextures.find((t) => t.path === texturePath)) {
      setTexturePath(candidateTextures[0]?.path ?? "");
    }
  }, [candidateTextures, texturePath]);

  const texHandle = React.useMemo(() => {
    const f = candidateTextures.find((t) => t.path === texturePath);
    if (!f) return null;
    return makeTextureFromBytes(f.data);
  }, [candidateTextures, texturePath]);

  React.useEffect(() => () => texHandle?.cleanup(), [texHandle]);

  const animationFiles = React.useMemo(
    () => findCandidateAnimations(modelFile.path, allFiles),
    [modelFile, allFiles],
  );
  const animations = React.useMemo(() => parseAnimationsFromFiles(animationFiles), [animationFiles]);

  const [animationId, setAnimationId] = React.useState<string>("");
  React.useEffect(() => {
    if (!animations.find((a) => a.id === animationId)) {
      setAnimationId(animations[0]?.id ?? "");
    }
  }, [animations, animationId]);
  const activeAnimation = React.useMemo(
    () => animations.find((a) => a.id === animationId) ?? null,
    [animations, animationId],
  );

  const [playing, setPlaying] = React.useState(false);
  const [displayTime, setDisplayTime] = React.useState(0);
  const timeRef = React.useRef(0);

  React.useEffect(() => {
    timeRef.current = 0;
    setDisplayTime(0);
    setPlaying(false);
  }, [activeAnimation?.id]);

  React.useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setDisplayTime(timeRef.current), 80);
    return () => window.clearInterval(id);
  }, [playing]);

  const sceneRef = React.useRef<SceneBuilt | null>(null);
  const [boundsR, setBoundsR] = React.useState(32);
  const handleBuilt = React.useCallback((b: SceneBuilt) => {
    sceneRef.current = b;
    const size = new THREE.Vector3();
    b.bbox.getSize(size);
    setBoundsR(Math.max(size.x, size.y, size.z) || 32);
  }, []);

  const onLoopEnd = React.useCallback(() => setPlaying(false), []);

  const runnerState = React.useMemo<AnimationState>(() => ({
    animation: activeAnimation,
    playing,
    timeRef,
    bonesByName: sceneRef.current?.bonesByName ?? null,
    restPoses: sceneRef.current?.restPoses ?? null,
    onLoopEnd,
  }), [activeAnimation, playing, onLoopEnd]);

  runnerState.playing = playing;
  runnerState.bonesByName = sceneRef.current?.bonesByName ?? null;
  runnerState.restPoses = sceneRef.current?.restPoses ?? null;
  runnerState.animation = activeAnimation;

  React.useEffect(() => {
    if (!activeAnimation && sceneRef.current) {
      resetToRest(sceneRef.current.bonesByName, sceneRef.current.restPoses);
    }
  }, [activeAnimation]);

  React.useEffect(() => {
    if (playing || !activeAnimation || !sceneRef.current) return;
    applyAnimation(activeAnimation, timeRef.current, sceneRef.current.bonesByName, sceneRef.current.restPoses);
  }, [displayTime, playing, activeAnimation]);

  const handleSliderChange = (_e: Event, value: number | number[]) => {
    const v = Array.isArray(value) ? value[0] : value;
    timeRef.current = v;
    setDisplayTime(v);
  };

  const handleStop = () => {
    setPlaying(false);
    timeRef.current = 0;
    setDisplayTime(0);
  };

  if (!geometry) {
    return (
      <Box sx={{ p: 3, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          这个 JSON 不是 Bedrock geometry 格式。
        </Typography>
      </Box>
    );
  }

  const r = boundsR;

  return (
    <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      {candidateTextures.length > 0 && (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ p: 1.25, borderBottom: 1, borderColor: "divider", alignItems: "center" }}
        >
          <Typography variant="caption" sx={{ color: "text.secondary" }}>纹理</Typography>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="tex-select">texture</InputLabel>
            <Select
              labelId="tex-select"
              label="texture"
              value={texturePath}
              onChange={(e) => setTexturePath(e.target.value)}
            >
              {candidateTextures.map((t) => (
                <MenuItem key={t.path} value={t.path}>{t.path}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      )}

      <Box sx={{ flex: 1, minHeight: 0, backgroundColor: "#1a1d23" }}>
        <Canvas
          camera={{ position: [r * 1.6, r * 0.9, r * 1.6], fov: 45, near: 0.1, far: 10000 }}
          dpr={1}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          frameloop="always"
        >
          <color attach="background" args={["#1a1d23"]} />
          <gridHelper args={[Math.max(64, r * 3), 16, "#2a2f38", "#1f242b"]} />
          <ModelScene geometry={geometry} texture={texHandle?.texture ?? null} onBuilt={handleBuilt} />
          <AnimationRunner state={runnerState} />
          <OrbitControls makeDefault enablePan target={[0, r * 0.3, 0]} maxDistance={r * 12} />
        </Canvas>
      </Box>

      {animations.length > 0 && (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ p: 1, borderTop: 1, borderColor: "divider", alignItems: "center", backgroundColor: "background.paper" }}
        >
          <FormControl size="small" sx={{ minWidth: 220, maxWidth: 360 }}>
            <InputLabel id="anim-select">动画</InputLabel>
            <Select
              labelId="anim-select"
              label="动画"
              value={animationId}
              onChange={(e) => setAnimationId(e.target.value)}
            >
              {animations.map((a) => (
                <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton
            size="small"
            onClick={() => activeAnimation && setPlaying((p) => !p)}
            disabled={!activeAnimation}
            sx={{ color: "text.primary" }}
          >
            {playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
          </IconButton>
          <IconButton
            size="small"
            onClick={handleStop}
            disabled={!activeAnimation}
            sx={{ color: "text.secondary" }}
          >
            <StopRoundedIcon />
          </IconButton>
          <Slider
            size="small"
            value={Math.min(displayTime, activeAnimation?.length ?? 1)}
            min={0}
            max={activeAnimation?.length ?? 1}
            step={(activeAnimation?.length ?? 1) / 600}
            onChange={handleSliderChange}
            disabled={!activeAnimation}
            sx={{ flex: 1, mx: 1 }}
          />
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums", minWidth: 84, textAlign: "right" }}
          >
            {displayTime.toFixed(2)} / {(activeAnimation?.length ?? 0).toFixed(2)}s
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
