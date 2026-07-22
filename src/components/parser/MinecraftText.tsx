"use client";

import * as React from "react";

const COLORS: Record<string, string> = {
  "0": "#000000", "1": "#0000aa", "2": "#00aa00", "3": "#00aaaa",
  "4": "#aa0000", "5": "#aa00aa", "6": "#ffaa00", "7": "#aaaaaa",
  "8": "#555555", "9": "#5555ff", "a": "#55ff55", "b": "#55ffff",
  "c": "#ff5555", "d": "#ff55ff", "e": "#ffff55", "f": "#ffffff",
};

interface Segment {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export function parseMinecraftText(input: string): Segment[] {
  const segments: Segment[] = [];
  let cur: Segment = { text: "" };
  const flush = () => {
    if (cur.text) segments.push(cur);
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if ((ch === "§" || ch === "&") && i + 1 < input.length) {
      const next = input[i + 1].toLowerCase();
      const isCode = COLORS[next] !== undefined || "lonmrk".includes(next);
      if (isCode) {
        flush();
        cur = { text: "", color: cur.color, bold: cur.bold, italic: cur.italic, underline: cur.underline, strike: cur.strike };
        if (COLORS[next] !== undefined) {
          cur = { text: "", color: COLORS[next] };
        } else if (next === "l") cur.bold = true;
        else if (next === "o") cur.italic = true;
        else if (next === "n") cur.underline = true;
        else if (next === "m") cur.strike = true;
        else if (next === "r") cur = { text: "" };
        i++;
        continue;
      }
    }
    cur.text += ch;
  }
  flush();
  return segments;
}

export default function MinecraftText({ text }: { text: string }) {
  const segs = React.useMemo(() => parseMinecraftText(text), [text]);
  return (
    <>
      {segs.map((s, i) => {
        const decoration: string[] = [];
        if (s.underline) decoration.push("underline");
        if (s.strike) decoration.push("line-through");
        return (
          <span
            key={i}
            style={{
              color: s.color,
              fontWeight: s.bold ? 700 : undefined,
              fontStyle: s.italic ? "italic" : undefined,
              textDecoration: decoration.join(" ") || undefined,
            }}
          >
            {s.text}
          </span>
        );
      })}
    </>
  );
}
