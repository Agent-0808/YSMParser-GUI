"use client";

import * as React from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#0D1014", paper: "#11161c" },
  },
  typography: {
    h1: {
      fontSize: "2.25rem",
      fontWeight: 700,
      letterSpacing: "-0.015em",
      lineHeight: 1.15,
    },
    h2: { fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2 },
    h3: { fontSize: "1.4rem", fontWeight: 600 },
    h4: { fontSize: "1.2rem", fontWeight: 600 },
  },
});

export default function AppTheme({ children }: { children: React.ReactNode }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
