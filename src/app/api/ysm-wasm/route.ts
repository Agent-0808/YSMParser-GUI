import { NextRequest } from "next/server";

const REPO = "OpenYSM/YSMParser";

interface GHAsset {
  name: string;
  browser_download_url: string;
}

export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag");
  if (!tag || !/^[\w.\-]+$/.test(tag)) {
    return new Response("invalid tag", { status: 400 });
  }

  const relRes = await fetch(
    `https://api.github.com/repos/${REPO}/releases/tags/${tag}`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!relRes.ok) {
    return new Response(`release not found (${relRes.status})`, { status: 404 });
  }
  const rel = (await relRes.json()) as { assets?: GHAsset[] };
  const asset = rel.assets?.find((a) => /wasm-web.*\.tar\.gz$/.test(a.name));
  if (!asset) {
    return new Response("wasm-web asset not found", { status: 404 });
  }

  const dlRes = await fetch(asset.browser_download_url, { redirect: "follow" });
  if (!dlRes.ok || !dlRes.body) {
    return new Response(`download failed (${dlRes.status})`, { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/octet-stream");
  const len = dlRes.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-YSM-Asset", asset.name);

  return new Response(dlRes.body, { status: 200, headers });
}
