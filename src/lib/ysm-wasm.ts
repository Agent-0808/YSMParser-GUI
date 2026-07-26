const REPO = "OpenYSM/YSMParser";
const CACHE_NAME = "ysm-wasm-v1";

export type WasmStage =
  | "fetching-meta"
  | "downloading"
  | "extracting"
  | "instantiating"
  | "ready";

export interface WasmProgress {
  stage: WasmStage;
  tag?: string;
  loaded?: number;
  total?: number;
  fromCache?: boolean;
}

export interface YSMModuleConfig {
  print?: (s: string) => void;
  printErr?: (s: string) => void;
}

export interface LoadOptions {
  onProgress?: (info: WasmProgress) => void;
  config?: YSMModuleConfig;
  signal?: AbortSignal;
}

interface YSMFactoryOptions {
  noInitialRun: boolean;
  wasmBinary: Uint8Array;
  print?: (s: string) => void;
  printErr?: (s: string) => void;
}

type YSMFactory = (opts: YSMFactoryOptions) => Promise<YSMModule>;

export interface YSMModule {
  FS: {
    mkdir: (path: string) => void;
    writeFile: (path: string, data: Uint8Array) => void;
    readdir: (path: string) => string[];
    readFile: (path: string) => Uint8Array;
    stat: (path: string) => { mode: number };
    unlink: (path: string) => void;
    rmdir: (path: string) => void;
    isDir: (mode: number) => boolean;
    analyzePath: (path: string) => { exists: boolean };
  };
  callMain: (args: string[]) => number | undefined;
}

interface ReleaseInfo {
  tag_name: string;
}

const tarKey = (tag: string) =>
  `https://ysm-wasm-cache.local/v1/${encodeURIComponent(tag)}.tar.gz`;

async function getLatestTag(signal?: AbortSignal): Promise<string> {
  // 优先使用构建时注入的版本（避免运行时 API 调用）
  const builtTag = process.env.NEXT_PUBLIC_YSM_TAG;
  if (builtTag) return builtTag;

  // 本地开发时回退到 GitHub API
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    { signal },
  );
  if (!res.ok) {
    const cached = await getAnyCachedTag();
    if (cached) return cached;
    throw new Error(`无法获取最新版本 (HTTP ${res.status})`);
  }
  const json = (await res.json()) as ReleaseInfo;
  if (!json.tag_name) throw new Error("最新版本信息无效");
  return json.tag_name;
}

async function getAnyCachedTag(): Promise<string | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    for (const k of keys) {
      const m = k.url.match(/\/([^/]+)\.tar\.gz$/);
      if (m) return decodeURIComponent(m[1]);
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function getCachedTar(tag: string): Promise<ArrayBuffer | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(tarKey(tag));
    if (!match) return null;
    return await match.arrayBuffer();
  } catch {
    return null;
  }
}

async function setCachedTar(tag: string, buf: ArrayBuffer): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = new Response(buf, {
      headers: { "Content-Type": "application/octet-stream" },
    });
    await cache.put(tarKey(tag), res);
  } catch {
    /* quota errors ignored */
  }
}

async function pruneOldCacheEntries(currentTag: string): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const keep = tarKey(currentTag);
    await Promise.all(
      keys.filter((k) => k.url !== keep).map((k) => cache.delete(k)),
    );
  } catch {
    /* ignore */
  }
}

async function downloadTarWithProgress(
  tag: string,
  onProgress: (loaded: number, total: number | undefined) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  // 从本地 public 目录加载（构建时已预下载）
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const res = await fetch(`${basePath}/wasm/ysm-parser.tar.gz`, { signal });
  if (!res.ok || !res.body) {
    throw new Error(`下载失败 (HTTP ${res.status})`);
  }
  const totalStr = res.headers.get("Content-Length");
  const total = totalStr ? Number(totalStr) : undefined;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onProgress(received, total);
    }
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

async function gunzip(buf: ArrayBuffer): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const stream = new Response(buf).body!.pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function untar(buf: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  let i = 0;
  while (i + 512 <= buf.length) {
    const header = buf.subarray(i, i + 512);
    let allZero = true;
    for (let k = 0; k < 512; k++) {
      if (header[k] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) break;
    const name = dec.decode(header.subarray(0, 100)).replace(/\0.*$/, "");
    const sizeStr = dec
      .decode(header.subarray(124, 136))
      .replace(/[^0-7]/g, "");
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;
    const typeflag = String.fromCharCode(header[156]);
    i += 512;
    if (size > 0 && (typeflag === "0" || typeflag === "\0" || typeflag === "")) {
      files.set(name.replace(/^\.\//, ""), buf.subarray(i, i + size));
    }
    i += Math.ceil(size / 512) * 512;
  }
  return files;
}

interface GlobalWithFactory {
  YSMParserModule?: YSMFactory;
  Module?: YSMFactory;
}

let pending: Promise<{ Module: YSMModule; tag: string }> | null = null;

export async function loadYSMWasm(
  opts: LoadOptions = {},
): Promise<{ Module: YSMModule; tag: string }> {
  if (pending) return pending;
  const { onProgress, config, signal } = opts;
  const emit = (info: WasmProgress) => onProgress?.(info);

  pending = (async () => {
    emit({ stage: "fetching-meta" });
    const tag = await getLatestTag(signal);
    emit({ stage: "fetching-meta", tag });

    let tarBuf = await getCachedTar(tag);
    let fromCache = false;
    if (tarBuf) {
      fromCache = true;
      emit({
        stage: "downloading",
        tag,
        loaded: tarBuf.byteLength,
        total: tarBuf.byteLength,
        fromCache: true,
      });
    } else {
      emit({ stage: "downloading", tag, loaded: 0 });
      tarBuf = await downloadTarWithProgress(
        tag,
        (loaded, total) => emit({ stage: "downloading", tag, loaded, total }),
        signal,
      );
      await setCachedTar(tag, tarBuf);
      void pruneOldCacheEntries(tag);
    }

    emit({ stage: "extracting", tag, fromCache });
    const inflated = await gunzip(tarBuf);
    const files = untar(inflated);
    const jsView = files.get("YSMParser.js");
    const wasmView = files.get("YSMParser.wasm");
    if (!jsView || !wasmView) {
      throw new Error("发布包缺失 YSMParser.js 或 YSMParser.wasm");
    }
    const jsText = new TextDecoder().decode(jsView);
    const wasmBytes = new Uint8Array(wasmView);

    emit({ stage: "instantiating", tag, fromCache });

    const jsBlob = new Blob([jsText], { type: "text/javascript" });
    const jsUrl = URL.createObjectURL(jsBlob);
    let scriptEl: HTMLScriptElement | null = null;
    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        scriptEl = script;
        script.src = jsUrl;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("YSMParser.js 加载失败"));
        document.head.appendChild(script);
      });
    } finally {
      URL.revokeObjectURL(jsUrl);
      if (scriptEl) (scriptEl as HTMLScriptElement).remove();
    }

    const g = globalThis as GlobalWithFactory;
    const factory = g.YSMParserModule || g.Module;
    if (typeof factory !== "function") {
      throw new Error("YSMParserModule 工厂函数未找到");
    }

    const Module = await factory({
      noInitialRun: true,
      wasmBinary: wasmBytes,
      print: config?.print,
      printErr: config?.printErr,
    });

    emit({ stage: "ready", tag, fromCache });
    return { Module, tag };
  })().catch((err: unknown) => {
    pending = null;
    throw err;
  });
  return pending;
}
