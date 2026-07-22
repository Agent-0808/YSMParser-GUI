"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import MusicNoteRoundedIcon from "@mui/icons-material/MusicNoteRounded";
import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import ViewInArRoundedIcon from "@mui/icons-material/ViewInArRounded";
import InsertDriveFileRoundedIcon from "@mui/icons-material/InsertDriveFileRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";

export interface OutputFile {
  path: string;
  data: Uint8Array;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  file?: OutputFile;
  children: TreeNode[];
}

function buildTree(files: OutputFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [] };
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sorted) {
    const parts = f.path.split("/").filter(Boolean);
    let parent = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      let child = parent.children.find((c) => c.name === name);
      if (!child) {
        child = {
          name,
          path: parts.slice(0, i + 1).join("/"),
          isDir: !isLast,
          children: [],
          file: isLast ? f : undefined,
        };
        parent.children.push(child);
      }
      parent = child;
    }
  }
  // Sort: folders first, then files, both alphabetical
  const sortRec = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of node.children) sortRec(c);
  };
  sortRec(root);
  return root;
}

export type PreviewKind = "model" | "image" | "audio" | "json" | "other";

export function previewKind(path: string, file?: OutputFile): PreviewKind {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".gif") || lower.endsWith(".webp")) return "image";
  if (lower.endsWith(".ogg") || lower.endsWith(".mp3") || lower.endsWith(".wav")) return "audio";
  if (lower.endsWith(".json")) {
    if (!file) return "json";
    try {
      const text = new TextDecoder().decode(file.data.slice(0, 2048));
      if (text.includes("minecraft:geometry") || /"geometry\.[\w.]+"/.test(text)) return "model";
    } catch {}
    return "json";
  }
  return "other";
}

function FileIcon({ path, file }: { path: string; file?: OutputFile }) {
  const kind = previewKind(path, file);
  const sx = { fontSize: 16, color: "text.secondary" } as const;
  if (kind === "image") return <ImageRoundedIcon sx={sx} />;
  if (kind === "audio") return <MusicNoteRoundedIcon sx={sx} />;
  if (kind === "model") return <ViewInArRoundedIcon sx={{ ...sx, color: "primary.light" }} />;
  if (kind === "json") return <DataObjectRoundedIcon sx={sx} />;
  return <InsertDriveFileRoundedIcon sx={sx} />;
}

interface FileTreeProps {
  files: OutputFile[];
  selectedPath: string | null;
  onSelect: (file: OutputFile) => void;
  onDownload: (file: OutputFile) => void;
  defaultExpandDepth?: number;
}

function NodeRow({
  node,
  depth,
  selectedPath,
  onSelect,
  onDownload,
  defaultExpandDepth,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (file: OutputFile) => void;
  onDownload: (file: OutputFile) => void;
  defaultExpandDepth: number;
}) {
  const [open, setOpen] = React.useState(depth < defaultExpandDepth);
  const isSelected = selectedPath === node.path && !node.isDir;

  if (node.isDir) {
    return (
      <Box>
        <Box
          role="button"
          tabIndex={0}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            py: 0.35,
            pl: depth * 1.5 + 1,
            cursor: "pointer",
            userSelect: "none",
            "&:hover": { backgroundColor: "action.hover" },
          }}
        >
          {open ? <ExpandMoreRoundedIcon sx={{ fontSize: 16 }} /> : <ChevronRightRoundedIcon sx={{ fontSize: 16 }} />}
          {open ? (
            <FolderOpenRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          ) : (
            <FolderRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          )}
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.name}
          </Typography>
        </Box>
        {open &&
          node.children.map((c) => (
            <NodeRow
              key={c.path}
              node={c}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onDownload={onDownload}
              defaultExpandDepth={defaultExpandDepth}
            />
          ))}
      </Box>
    );
  }

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => node.file && onSelect(node.file)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && node.file) {
          e.preventDefault();
          onSelect(node.file);
        }
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.35,
        pl: depth * 1.5 + 2.25,
        cursor: "pointer",
        userSelect: "none",
        backgroundColor: isSelected ? "action.selected" : "transparent",
        "&:hover": { backgroundColor: isSelected ? "action.selected" : "action.hover" },
        "&:hover .file-actions": { opacity: 1 },
      }}
    >
      <FileIcon path={node.path} file={node.file} />
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isSelected ? "text.primary" : "text.secondary" }}>
        {node.name}
      </Typography>
      <Box className="file-actions" sx={{ opacity: 0, transition: "opacity 120ms ease" }}>
        <Tooltip title="下载">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              if (node.file) onDownload(node.file);
            }}
            sx={{ p: 0.25 }}
          >
            <DownloadRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

export default function FileTree({
  files,
  selectedPath,
  onSelect,
  onDownload,
  defaultExpandDepth = 3,
}: FileTreeProps) {
  const root = React.useMemo(() => buildTree(files), [files]);

  if (files.length === 0) {
    return (
      <Box sx={{ p: 2, color: "text.secondary" }}>
        <Typography variant="body2">尚无输出文件。</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ py: 1, fontFamily: "var(--mui-typography-fontFamily)" }}>
      {root.children.map((c) => (
        <NodeRow
          key={c.path}
          node={c}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onDownload={onDownload}
          defaultExpandDepth={defaultExpandDepth}
        />
      ))}
    </Box>
  );
}
