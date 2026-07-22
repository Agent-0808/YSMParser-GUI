"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import hljs from "highlight.js/lib/core";
import jsonLang from "highlight.js/lib/languages/json";
import { previewKind, type OutputFile } from "./FileTree";
import YsmInfoPreview, { isYsmJson } from "./YsmInfoPreview";
import { formatSize } from "@/lib/format";

const HLJS_REGISTERED = "__ysmrip_hljs_json_registered__";
type HljsWithFlag = typeof hljs & { [HLJS_REGISTERED]?: boolean };
if (!(hljs as HljsWithFlag)[HLJS_REGISTERED]) {
  hljs.registerLanguage("json", jsonLang);
  (hljs as HljsWithFlag)[HLJS_REGISTERED] = true;
}

const BedrockModelViewer = dynamic(() => import("./BedrockModelViewer"), { ssr: false });

interface FilePreviewProps {
  file: OutputFile;
  allFiles: OutputFile[];
  onDownload: (file: OutputFile) => void;
}

function ImagePreview({ data }: { data: Uint8Array }) {
  const url = React.useMemo(() => {
    const blob = new Blob([new Uint8Array(data) as BlobPart], { type: "image/png" });
    return URL.createObjectURL(blob);
  }, [data]);
  React.useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#1a1d23",
        backgroundImage:
          "linear-gradient(45deg, #2a2d34 25%, transparent 25%, transparent 75%, #2a2d34 75%), linear-gradient(45deg, #2a2d34 25%, transparent 25%, transparent 75%, #2a2d34 75%)",
        backgroundSize: "24px 24px",
        backgroundPosition: "0 0, 12px 12px",
        overflow: "auto",
        p: 3,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        style={{ imageRendering: "pixelated", maxWidth: "100%", maxHeight: "100%" }}
      />
    </Box>
  );
}

function AudioPreview({ data, name }: { data: Uint8Array; name: string }) {
  const url = React.useMemo(() => {
    const ext = name.toLowerCase().split(".").pop();
    const mime = ext === "ogg" ? "audio/ogg" : ext === "mp3" ? "audio/mpeg" : "audio/wav";
    const blob = new Blob([new Uint8Array(data) as BlobPart], { type: mime });
    return URL.createObjectURL(blob);
  }, [data, name]);
  React.useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2, p: 3 }}>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>{name}</Typography>
      <audio controls src={url} style={{ width: "min(100%, 480px)" }} />
    </Box>
  );
}

const HIGHLIGHT_CHAR_LIMIT = 2_000_000;

const CODE_FONT =
  'Consolas, "Cascadia Mono", "DejaVu Sans Mono", "Liberation Mono", Menlo, Monaco, "Courier New", monospace';

function JsonPreview({ data }: { data: Uint8Array }) {
  const pretty = React.useMemo(() => {
    try {
      const raw = new TextDecoder().decode(data);
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return new TextDecoder().decode(data);
    }
  }, [data]);


  const [highlightedHtml, setHighlightedHtml] = React.useState<string | null>(null);
  React.useEffect(() => {
    setHighlightedHtml(null);
    if (pretty.length > HIGHLIGHT_CHAR_LIMIT) return;
    const id = window.setTimeout(() => {
      try {
        const out = hljs.highlight(pretty, { language: "json", ignoreIllegals: true });
        setHighlightedHtml(out.value);
      } catch {
        /* keep plain text */
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [pretty]);

  const lines = React.useMemo(() => {
    return (highlightedHtml ?? pretty).split("\n");
  }, [highlightedHtml, pretty]);

  const isHighlighted = highlightedHtml != null;

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        overflow: "auto",
        backgroundColor: "#0d1117",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <Box
        className={isHighlighted ? "hljs language-json" : undefined}
        sx={{
          display: "block",
          fontFamily: CODE_FONT,
          fontSize: "0.8rem",
          lineHeight: 1.55,
          color: "#c9d1d9",
          backgroundColor: "transparent",
          py: 1,
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: "block",
              whiteSpace: "pre",
              padding: "0 16px",
              contentVisibility: "auto",
              containIntrinsicSize: "1px 20px",
            }}
            dangerouslySetInnerHTML={{
              __html: isHighlighted
                ? line === "" ? " " : line
                : escapeHtml(line === "" ? " " : line),
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function GenericPreview({ file, onDownload }: { file: OutputFile; onDownload: (f: OutputFile) => void }) {
  return (
    <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1.5, p: 3 }}>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        无法预览此文件类型
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {file.path} · {formatSize(file.data.byteLength)}
      </Typography>
      <Button
        size="small"
        variant="outlined"
        startIcon={<DownloadRoundedIcon />}
        onClick={() => onDownload(file)}
      >
        下载
      </Button>
    </Box>
  );
}

export default function FilePreview({ file, allFiles, onDownload }: FilePreviewProps) {
  const kind = previewKind(file.path, file);

  if (kind === "image") return <ImagePreview data={file.data} />;
  if (kind === "audio") return <AudioPreview data={file.data} name={file.path.split("/").pop() ?? file.path} />;
  if (kind === "model") return <BedrockModelViewer modelFile={file} allFiles={allFiles} />;
  if (isYsmJson(file.path)) return <YsmInfoPreview file={file} allFiles={allFiles} />;
  if (kind === "json") return <JsonPreview data={file.data} />;
  return <GenericPreview file={file} onDownload={onDownload} />;
}
