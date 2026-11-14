import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Variables d'env factices pour les tests unitaires — évite le throw de supabase.ts
    // Les tests d'intégration surchargent ces valeurs via les vars d'env de la ligne de commande.
    env: {
      VITE_SUPABASE_URL: process.env["VITE_SUPABASE_URL"] ?? "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: process.env["VITE_SUPABASE_ANON_KEY"] ?? "eyJtest.anon.key",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
