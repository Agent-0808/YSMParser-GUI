"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import type { OutputFile } from "./FileTree";
import MinecraftText from "./MinecraftText";

interface YsmAuthor {
  avatar?: string;
  comment?: string;
  contact?: Record<string, string>;
  name: string;
  role?: string;
}

interface YsmMetadata {
  authors?: YsmAuthor[];
  license?: { type?: string; desc?: string };
  link?: Record<string, string>;
  name?: string;
  tips?: string;
}

interface YsmJson {
  spec?: number;
  metadata?: YsmMetadata;
}

export function isYsmJson(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === "ysm.json" || lower.endsWith("/ysm.json");
}

function makeImageUrl(data: Uint8Array, mime: string): string {
  const blob = new Blob([new Uint8Array(data) as BlobPart], { type: mime });
  return URL.createObjectURL(blob);
}

function AuthorCard({
  author,
  avatarFile,
}: {
  author: YsmAuthor;
  avatarFile: OutputFile | undefined;
}) {
  const url = React.useMemo(
    () => (avatarFile ? makeImageUrl(avatarFile.data, "image/png") : null),
    [avatarFile],
  );
  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        p: 2,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        backgroundColor: "background.paper",
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            style={{
              width: 72,
              height: 72,
              borderRadius: 8,
              objectFit: "cover",
              imageRendering: "pixelated",
              display: "block",
              background: "#0d1117",
            }}
          />
        ) : (
          <Box sx={{ width: 72, height: 72, borderRadius: 1, backgroundColor: "action.hover" }} />
        )}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            <MinecraftText text={author.name} />
          </Typography>
          {author.role && (
            <Chip
              label={author.role}
              size="small"
              sx={{
                height: 18,
                fontSize: 11,
                backgroundColor: "primary.main",
                color: "primary.contrastText",
              }}
            />
          )}
        </Stack>
        {author.comment && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.75, lineHeight: 1.6 }}>
            {author.comment}
          </Typography>
        )}
        {author.contact && Object.keys(author.contact).length > 0 && (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ mt: 1.25, flexWrap: "wrap", rowGap: 0.5 }}
          >
            {Object.entries(author.contact).map(([key, val]) => {
              const isLink = typeof val === "string" && /^https?:\/\//.test(val);
              return isLink ? (
                <Link
                  key={key}
                  href={val}
                  target="_blank"
                  rel="noopener"
                  variant="caption"
                  sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                >
                  {key}
                  <OpenInNewRoundedIcon sx={{ fontSize: 12 }} />
                </Link>
              ) : (
                <Typography key={key} variant="caption" sx={{ color: "text.secondary" }}>
                  <span style={{ fontWeight: 500 }}>{key}</span>: {val}
                </Typography>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

const LINK_LABELS: Record<string, string> = {
  home: "主页",
  donate: "赞助",
  source: "源代码",
  github: "GitHub",
  modrinth: "Modrinth",
  curseforge: "CurseForge",
  bilibili: "Bilibili",
  youtube: "YouTube",
  twitter: "Twitter",
  discord: "Discord",
};

function labelFor(key: string): string {
  return LINK_LABELS[key.toLowerCase()] ?? key;
}

export default function YsmInfoPreview({
  file,
  allFiles,
}: {
  file: OutputFile;
  allFiles: OutputFile[];
}) {
  const json = React.useMemo<YsmJson | null>(() => {
    try {
      return JSON.parse(new TextDecoder().decode(file.data)) as YsmJson;
    } catch {
      return null;
    }
  }, [file]);

  const meta = json?.metadata;

  // Resolve relative avatar paths against the model bundle root.
  const baseDir = React.useMemo(() => file.path.replace(/[^/]*$/, ""), [file.path]);
  const fileByPath = React.useMemo(() => {
    const m = new Map<string, OutputFile>();
    for (const f of allFiles) m.set(f.path, f);
    return m;
  }, [allFiles]);

  const resolveRel = React.useCallback(
    (rel: string) => fileByPath.get(baseDir + rel),
    [fileByPath, baseDir],
  );

  if (!meta) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          ysm.json 解析失败。
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        overflow: "auto",
        backgroundColor: "background.default",
      }}
    >
      <Box sx={{ maxWidth: 920, mx: "auto", px: { xs: 3, md: 5 }, py: { xs: 4, md: 6 } }}>
        {meta.name && (
          <Typography
            sx={{
              fontSize: { xs: "1.8rem", md: "2.4rem" },
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
              mb: 1,
            }}
          >
            <MinecraftText text={meta.name} />
          </Typography>
        )}
        {meta.tips && (
          <Typography sx={{ color: "text.secondary", fontSize: "1rem", lineHeight: 1.7 }}>
            <MinecraftText text={meta.tips} />
          </Typography>
        )}

        {(meta.link || meta.license) && (
          <Stack
            direction="row"
            spacing={2}
            sx={{ mt: 3, flexWrap: "wrap", alignItems: "center", rowGap: 1 }}
          >
            {meta.link &&
              Object.entries(meta.link).map(([key, url]) => (
                <Link
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener"
                  variant="body2"
                  sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                >
                  {labelFor(key)}
                  <OpenInNewRoundedIcon sx={{ fontSize: 14 }} />
                </Link>
              ))}
            {meta.license?.type && (
              <Chip
                label={meta.license.type}
                size="small"
                variant="outlined"
                sx={{ height: 22, fontSize: 11 }}
              />
            )}
          </Stack>
        )}
        {meta.license?.desc && (
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1 }}>
            {meta.license.desc}
          </Typography>
        )}

        {meta.authors && meta.authors.length > 0 && (
          <Box sx={{ mt: 5 }}>
            <Divider sx={{ mb: 3 }}>
              <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: "0.1em" }}>
                制作团队
              </Typography>
            </Divider>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
                gap: 2,
              }}
            >
              {meta.authors.map((author, i) => (
                <AuthorCard
                  key={`${author.name}-${i}`}
                  author={author}
                  avatarFile={author.avatar ? resolveRel(author.avatar) : undefined}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
