import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }
          if (id.includes("element-plus")) {
            return "element-plus";
          }
          if (id.includes("/vue/")) {
            return "vue-vendor";
          }
          if (id.includes("axios")) {
            return "network";
          }
          return "vendor";
        }
      }
    }
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true
      }
    }
  }
});

