"use client";

import * as React from "react";
import JSZip from "jszip";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import IconButton from "@mui/material/IconButton";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Link from "@mui/material/Link";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import TerminalRoundedIcon from "@mui/icons-material/TerminalRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import {loadYSMWasm, type YSMModule, type WasmProgress} from "@/lib/ysm-wasm";
import {formatSize} from "@/lib/format";
import FileTree, {type OutputFile} from "./FileTree";
import FilePreview from "./FilePreview";

type RuntimeState = "loading" | "ready" | "error";
type ParseState = "idle" | "parsing" | "done" | "error";

const SIDEBAR_WIDTH = 280;
const TOOLBAR_HEIGHT = 36;

function wipeDir(FS: YSMModule["FS"], dir: string) {
    try {
        const entries = FS.readdir(dir).filter((n) => n !== "." && n !== "..");
        for (const entry of entries) {
            const fullPath = `${dir}/${entry}`;
            const stat = FS.stat(fullPath);
            if (FS.isDir(stat.mode)) {
                wipeDir(FS, fullPath);
                FS.rmdir(fullPath);
            } else {
                FS.unlink(fullPath);
            }
        }
    } catch {
    }
}

function ensureDir(FS: YSMModule["FS"], dir: string) {
    const parts = dir.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
        current += `/${part}`;
        try {
            FS.mkdir(current);
        } catch {
        }
    }
}

function collectOutputFiles(FS: YSMModule["FS"], root: string): OutputFile[] {
    const result: OutputFile[] = [];
    const walk = (dir: string, relativeBase: string) => {
        const entries = FS.readdir(dir).filter((n) => n !== "." && n !== "..");
        for (const entry of entries) {
            const fullPath = `${dir}/${entry}`;
            const relPath = relativeBase ? `${relativeBase}/${entry}` : entry;
            const stat = FS.stat(fullPath);
            if (FS.isDir(stat.mode)) {
                walk(fullPath, relPath);
            } else {
                result.push({path: relPath, data: FS.readFile(fullPath)});
            }
        }
    };
    walk(root, "");
    return result;
}

function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

type MenuEntry =
    | {
    kind: "item";
    label: string;
    icon?: React.ReactNode;
    shortcut?: string;
    onClick: () => void;
    disabled?: boolean
}
    | { kind: "divider" };

type MenuDef =
    | { kind: "menu"; label: string; items: MenuEntry[] }
    | { kind: "action"; label: string; onClick: () => void };

function MenuBar({menus}: { menus: MenuDef[] }) {
    const [anchorIndex, setAnchorIndex] = React.useState<number | null>(null);
    const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);

    const openAt = (idx: number) => (e: React.MouseEvent<HTMLElement>) => {
        setAnchorIndex(idx);
        setAnchorEl(e.currentTarget);
    };
    const close = () => {
        setAnchorIndex(null);
        setAnchorEl(null);
    };

    const activeMenu = anchorIndex !== null ? menus[anchorIndex] : null;

    return (
        <Stack direction="row" spacing={0} sx={{alignSelf: "stretch"}}>
            {menus.map((menu, idx) => (
                <Button
                    key={menu.label}
                    onClick={menu.kind === "menu" ? openAt(idx) : menu.onClick}
                    disableRipple
                    sx={{
                        minWidth: 0,
                        px: 1.5,
                        py: 0,
                        height: "100%",
                        color: "text.primary",
                        textTransform: "none",
                        fontWeight: 400,
                        fontSize: "0.8125rem",
                        borderRadius: 0,
                        backgroundColor: anchorIndex === idx ? "action.selected" : "transparent",
                        "&:hover": {backgroundColor: anchorIndex === idx ? "action.selected" : "action.hover"},
                    }}
                >
                    {menu.label}
                </Button>
            ))}
            <Menu
                anchorEl={anchorEl}
                open={activeMenu?.kind === "menu"}
                onClose={close}
                anchorOrigin={{vertical: "bottom", horizontal: "left"}}
                transformOrigin={{vertical: "top", horizontal: "left"}}
                slotProps={{
                    paper: {
                        elevation: 4,
                        sx: {mt: 0, minWidth: 240, borderRadius: 1},
                    },
                }}
            >
                {activeMenu?.kind === "menu" &&
                    activeMenu.items.map((item, i) =>
                        item.kind === "divider" ? (
                            <Divider key={`d-${i}`} sx={{my: 0.5}}/>
                        ) : (
                            <MenuItem
                                key={item.label}
                                disabled={item.disabled}
                                onClick={() => {
                                    item.onClick();
                                    close();
                                }}
                                sx={{py: 0.75}}
                            >
                                <ListItemIcon sx={{minWidth: 28, color: "text.secondary"}}>
                                    {item.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={item.label}
                                    slotProps={{primary: {sx: {fontSize: "0.85rem"}}}}
                                />
                                {item.shortcut && (
                                    <Typography variant="caption" sx={{color: "text.secondary", ml: 3}}>
                                        {item.shortcut}
                                    </Typography>
                                )}
                            </MenuItem>
                        ),
                    )}
            </Menu>
        </Stack>
    );
}

const YSMRIP_PROJECT_URL = "https://ysm.rip/parser";

export default function ParserApp() {
    const [leaveDialogOpen, setLeaveDialogOpen] = React.useState(false);
    // Runtime
    const [runtimeState, setRuntimeState] = React.useState<RuntimeState>("loading");
    const [wasmProgress, setWasmProgress] = React.useState<WasmProgress>({stage: "fetching-meta"});
    const [runtimeError, setRuntimeError] = React.useState<string | null>(null);
    const wasmRef = React.useRef<YSMModule | null>(null);

    // Inputs / parse state
    const [inputFiles, setInputFiles] = React.useState<File[]>([]);
    const [parseState, setParseState] = React.useState<ParseState>("idle");
    const [progress, setProgress] = React.useState(0);
    const [logs, setLogs] = React.useState<string[]>([]);
    const [outputFiles, setOutputFiles] = React.useState<OutputFile[]>([]);
    const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const logEndRef = React.useRef<HTMLDivElement>(null);
    const log = React.useCallback((line: string) => setLogs((p) => [...p, line]), []);

    React.useEffect(() => {
        let cancelled = false;
        loadYSMWasm({
            onProgress: (info) => !cancelled && setWasmProgress(info),
            config: {
                print: (s) => !cancelled && log(s),
                printErr: (s) => !cancelled && log(s),
            },
        })
            .then(({Module}) => {
                if (cancelled) return;
                wasmRef.current = Module;
                setRuntimeState("ready");
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setRuntimeState("error");
                setRuntimeError(err instanceof Error ? err.message : String(err));
            });
        return () => {
            cancelled = true;
        };
    }, [log]);

    React.useEffect(() => {
        logEndRef.current?.scrollIntoView({behavior: "smooth"});
    }, [logs]);

    const handleAddFiles = (list: FileList | File[]) => {
        const ysm = Array.from(list)
            .filter((f) => f.name.toLowerCase().endsWith(".ysm"))
            .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
        if (ysm.length === 0) return;
        setInputFiles((prev) => {
            const map = new Map<string, File>();
            [...prev, ...ysm].forEach((f) => map.set(f.name, f));
            return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
        });
    };

    const openFilePicker = () => fileInputRef.current?.click();

    const runParser = async () => {
        const mod = wasmRef.current;
        if (!mod || inputFiles.length === 0) return;
        setParseState("parsing");
        setProgress(0);
        setLogs([]);
        setOutputFiles([]);
        setSelectedPath(null);
        log("开始处理...");

        try {
            wipeDir(mod.FS, "/input");
            wipeDir(mod.FS, "/output");
            ensureDir(mod.FS, "/input");
            ensureDir(mod.FS, "/output");

            for (let i = 0; i < inputFiles.length; i++) {
                const bytes = new Uint8Array(await inputFiles[i].arrayBuffer());
                mod.FS.writeFile(`/input/${inputFiles[i].name}`, bytes);
                setProgress(Math.round(((i + 1) / inputFiles.length) * 20));
                log(`已加载: ${inputFiles[i].name}`);
            }

            setProgress(25);
            log("开始解析...");

            try {
                const exit = mod.callMain(["-i", "/input", "-o", "/output"]);
                if (typeof exit === "number" && exit !== 0) {
                    throw new Error(`返回代码 ${exit}`);
                }
            } catch (err: unknown) {
                const e = err as { name?: string; status?: number; message?: string };
                if (!e?.name?.includes("ExitStatus")) throw err;
                if (typeof e.status === "number" && e.status !== 0) {
                    throw new Error(`返回代码 ${e.status}`);
                }
            }

            setProgress(80);
            log("整理输出结果...");
            const collected = collectOutputFiles(mod.FS, "/output");
            setOutputFiles(collected);
            const firstModel = collected.find((f) => f.path.includes("/models/") && f.path.endsWith(".json"));
            setSelectedPath((firstModel ?? collected[0])?.path ?? null);
            setProgress(100);
            setParseState("done");
            log(`完成! 共生成 ${collected.length} 个文件`);
        } catch (err: unknown) {
            setParseState("error");
            log(`处理失败: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    const downloadFile = (f: OutputFile) => {
        const blob = new Blob([new Uint8Array(f.data) as BlobPart]);
        const name = f.path.split("/").pop() ?? "file";
        downloadBlob(blob, name);
    };

    const downloadAll = async () => {
        if (outputFiles.length === 0) return;
        const zip = new JSZip();
        for (const f of outputFiles) zip.file(f.path, f.data);
        const blob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: {level: 6},
        });
        downloadBlob(blob, "YSMParser-output.zip");
    };

    const clearAll = () => {
        setInputFiles([]);
        setOutputFiles([]);
        setSelectedPath(null);
        setParseState("idle");
        setProgress(0);
        setLogs([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const selectedFile = React.useMemo(
        () => outputFiles.find((f) => f.path === selectedPath) ?? null,
        [outputFiles, selectedPath],
    );

    const hasOutput = outputFiles.length > 0;

    const menus: MenuDef[] = [
        {
            kind: "menu",
            label: "文件",
            items: [
                {
                    kind: "item",
                    label: "添加 .ysm 文件…",
                    icon: <FolderOpenRoundedIcon fontSize="small"/>,
                    onClick: openFilePicker,
                },
                {kind: "divider"},
                {
                    kind: "item",
                    label: `下载全部输出 (${outputFiles.length})`,
                    icon: <DownloadRoundedIcon fontSize="small"/>,
                    onClick: downloadAll,
                    disabled: outputFiles.length === 0,
                },
                {kind: "divider"},
                {
                    kind: "item",
                    label: "关闭",
                    icon: <DeleteOutlineRoundedIcon fontSize="small"/>,
                    onClick: clearAll,
                    disabled: inputFiles.length === 0 && outputFiles.length === 0,
                },
            ],
        },
        {
            kind: "menu",
            label: "运行",
            items: [
                {
                    kind: "item",
                    label: parseState === "parsing" ? "处理中…" : "开始处理",
                    icon: <PlayArrowRoundedIcon fontSize="small"/>,
                    onClick: runParser,
                    disabled: runtimeState !== "ready" || inputFiles.length === 0 || parseState === "parsing",
                },
            ],
        },
        {
            kind: "action",
            label: "关于",
            onClick: () => setLeaveDialogOpen(true),
        },
    ];

    return (
        <Box
            sx={{
                flex: 1,
                minHeight: 0,
                display: "grid",
                gridTemplateColumns: {
                    xs: "1fr",
                    md: hasOutput ? `${SIDEBAR_WIDTH}px 1fr` : "1fr",
                },
                // On mobile the tree gets a bounded height (40vh) so the main preview
                // still has breathing room. On md+ rows stay fixed.
                gridTemplateRows: {
                    xs: hasOutput
                        ? `${TOOLBAR_HEIGHT}px minmax(120px, 35vh) 1fr 140px`
                        : `${TOOLBAR_HEIGHT}px 1fr 140px`,
                    md: `${TOOLBAR_HEIGHT}px 1fr 180px`,
                },
                gridTemplateAreas: {
                    xs: hasOutput
                        ? `"toolbar"
                            "tree"
                            "main"
                            "logs"`
                        : `"toolbar"
                            "main"
                            "logs"`,
                    md: hasOutput
                        ? `"toolbar toolbar"
                            "tree main"
                            "logs logs"`
                        : `"toolbar"
                            "main"
                            "logs"`,
                },
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length > 0) handleAddFiles(e.dataTransfer.files);
            }}
        >
            {/* Hidden file input that menu items trigger */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".ysm"
                multiple
                hidden
                onChange={(e) => e.target.files && handleAddFiles(e.target.files)}
            />

            {/* Menu-bar toolbar */}
            <Box
                sx={{
                    gridArea: "toolbar",
                    position: "relative",
                    display: "flex",
                    alignItems: "stretch",
                    borderBottom: 1,
                    borderColor: "divider",
                    backgroundColor: "background.paper",
                    overflowX: "auto",
                }}
            >
                <MenuBar menus={menus}/>
                {/* Centered status text — hidden on xs to avoid overlapping the menu bar. */}
                <Box
                    sx={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: 0,
                        bottom: 0,
                        display: {xs: "none", sm: "flex"},
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                    }}
                >
                    <Typography variant="caption" sx={{color: "text.secondary", whiteSpace: "nowrap"}}>
                        {parseState === "parsing"
                            ? `处理中 · ${progress}%`
                            : inputFiles.length > 0
                                ? `已选 ${inputFiles.length} 个 .ysm · ${formatSize(inputFiles.reduce((s, f) => s + f.size, 0))}`
                                : ""}
                    </Typography>
                </Box>
            </Box>

            {/* File tree — only when there's output */}
            {hasOutput && (
                <Box
                    component="aside"
                    sx={{
                        gridArea: "tree",
                        minHeight: 0,
                        overflow: "auto",
                        borderRight: {md: 1},
                        borderBottom: {xs: 1, md: 0},
                        borderColor: "divider",
                        backgroundColor: "background.paper",
                    }}
                >
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                            px: 1.5,
                            py: 1,
                            alignItems: "center",
                            color: "text.secondary",
                            borderBottom: 1,
                            borderColor: "divider",
                        }}
                    >
                        <FolderRoundedIcon sx={{fontSize: 14}}/>
                        <Typography variant="caption">输出文件 ({outputFiles.length})</Typography>
                    </Stack>
                    {parseState === "parsing" && <LinearProgress variant="determinate" value={progress}/>}
                    <FileTree
                        files={outputFiles}
                        selectedPath={selectedPath}
                        onSelect={(f) => setSelectedPath(f.path)}
                        onDownload={downloadFile}
                    />
                </Box>
            )}

            {/* Main preview */}
            <Box
                component="section"
                sx={{
                    gridArea: "main",
                    minHeight: 0,
                    position: "relative",
                    backgroundColor: "background.default",
                    overflow: "hidden",
                }}
            >
                {selectedFile ? (
                    <FilePreview file={selectedFile} allFiles={outputFiles} onDownload={downloadFile}/>
                ) : (
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            p: 3,
                            textAlign: "center",
                            color: "text.secondary",
                        }}
                    >
                        {parseState === "error" ? (
                            <Typography variant="body2" sx={{color: "error.main"}}>处理失败 — 查看下方日志。</Typography>
                        ) : parseState === "parsing" ? (
                            <Stack spacing={2} sx={{alignItems: "center", width: "100%", maxWidth: 360}}>
                                <Typography variant="body2">正在解析…</Typography>
                                <LinearProgress variant="determinate" value={progress} sx={{width: "100%"}}/>
                                <Typography variant="caption"
                                            sx={{color: "text.secondary", fontVariantNumeric: "tabular-nums"}}>
                                    {progress}%
                                </Typography>
                            </Stack>
                        ) : outputFiles.length === 0 ? (
                            <Stack spacing={2} sx={{alignItems: "center"}}>
                                <Box
                                    component="img"
                                    src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo.png`}
                                    alt=""
                                    sx={{
                                        width: {xs: 140, md: 200},
                                        height: {xs: 140, md: 200},
                                        objectFit: "contain",
                                        opacity: 0.6,
                                        userSelect: "none",
                                        pointerEvents: "none",
                                    }}
                                />
                                {inputFiles.length > 0 ? (
                                    <Button
                                        variant="contained"
                                        startIcon={<PlayArrowRoundedIcon/>}
                                        onClick={runParser}
                                        disabled={runtimeState !== "ready"}
                                    >
                                        开始解析
                                    </Button>
                                ) : (
                                    <Typography variant="body2">添加或拖入文件以开始</Typography>
                                )}
                            </Stack>
                        ) : (
                            <Typography variant="body2">从左侧选择一个文件预览</Typography>
                        )}
                    </Box>
                )}
            </Box>

            {/* Logs */}
            <Box
                component="footer"
                sx={{
                    gridArea: "logs",
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    borderTop: 1,
                    borderColor: "divider",
                    backgroundColor: "background.paper",
                }}
            >
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        px: 2,
                        py: 0.75,
                        alignItems: "center",
                        color: "text.secondary",
                        borderBottom: 1,
                        borderColor: "divider",
                    }}
                >
                    <TerminalRoundedIcon sx={{fontSize: 14}}/>
                    <Typography variant="caption">日志</Typography>
                    {parseState === "parsing" && (
                        <Box sx={{ml: 1, flex: 1, maxWidth: 200}}>
                            <LinearProgress variant="determinate" value={progress}/>
                        </Box>
                    )}
                    <Box sx={{flex: 1}}/>
                    <IconButton size="small" onClick={() => setLogs([])} disabled={logs.length === 0}>
                        <DeleteOutlineRoundedIcon sx={{fontSize: 14}}/>
                    </IconButton>
                </Stack>
                <Box
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflow: "auto",
                        px: 2,
                        py: 1,
                        fontFamily: 'Consolas, "Cascadia Mono", "Liberation Mono", Menlo, Monaco, "Courier New", monospace',
                        fontSize: "0.75rem",
                        lineHeight: 1.55,
                        color: "text.secondary",
                    }}
                >
                    {logs.map((line, i) => <Box key={i}>{line}</Box>)}
                    <div ref={logEndRef}/>
                </Box>
            </Box>

            <Dialog
                open={leaveDialogOpen}
                onClose={() => setLeaveDialogOpen(false)}
                slotProps={{paper: {sx: {borderRadius: 1.5, minWidth: 360}}}}
            >
                <DialogTitle sx={{fontSize: "1rem", fontWeight: 600}}>关于 YSMParser GUI</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{fontSize: "0.875rem"}}>
                        浏览器版 YSMParser 图形界面 —— 在本地把 .ysm 文件还原为
                        BlockBench 工程。所有解析都在你的浏览器里完成，不上传任何文件。
                    </DialogContentText>
                    <DialogContentText sx={{fontSize: "0.875rem", mt: 2}}>
                        <strong>解析器：</strong>{" "}
                        <Link
                            href="https://github.com/OpenYSM/YSMParser"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            OpenYSM/YSMParser
                        </Link>
                    </DialogContentText>
                    <DialogContentText sx={{fontSize: "0.875rem", mt: 1}}>
                        <strong>感谢：</strong>{" "}
                        <Link
                            href="https://www.blockbench.net/"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Blockbench
                        </Link>
                        {" "}—— 本项目模型渲染与动画部分移植了大量 Blockbench 代码。
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{px: 3, pb: 2}}>
                    <Button onClick={() => setLeaveDialogOpen(false)} sx={{color: "text.secondary"}}>
                        关闭
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            setLeaveDialogOpen(false);
                            window.open(YSMRIP_PROJECT_URL, "_blank", "noopener,noreferrer");
                        }}
                    >
                        访问 ysm.rip
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
