import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    command === "build"
      ? nitro({
          defaultPreset: "cloudflare-module",
          // Keep deploys deterministic and avoid a local-time date being one
          // day ahead of Cloudflare's UTC compatibility-date validation.
          compatibilityDate: "2026-09-14",
        })
      : null,
    viteReact(),
  ],
}));
