import type { Metadata } from "next";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import AppTheme from "@/theme/AppTheme";
import "./globals.css";

export const metadata: Metadata = {
  title: "YSMParser GUI",
  description: "GUI for YSMParser",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppRouterCacheProvider options={{ key: "mui" }}>
          <AppTheme>
            <CssBaseline />
            <Box
              sx={{
                height: "100vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {children}
            </Box>
          </AppTheme>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
