import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only packages that must not be bundled for the browser.
  serverExternalPackages: ["mammoth", "yaml", "@huggingface/transformers", "onnxruntime-node", "sharp"],
  experimental: {
    // Allow large document uploads through server actions / route handlers.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
