/** @type {import('next').NextConfig} */
const path = require("node:path");
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  poweredByHeader: false,
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_HOST:
      process.env.NEXT_PUBLIC_API_HOST ?? "http://localhost:4001",
  },
};

module.exports = nextConfig;
