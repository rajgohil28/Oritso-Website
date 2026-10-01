import type { NextConfig } from "next";

const immutable = [{ key: "cache-control", value: "public, max-age=31536000, immutable" }];

const nextConfig: NextConfig = {
  turbopack: { root: import.meta.dirname },
  poweredByHeader: false,
  trailingSlash: false,
  // Self-hosted as a Docker image (see Dockerfile) rather than a static export: a standalone
  // server.js bundles only the node_modules the app actually needs.
  output: "standalone",
  // The page route reads documents from content/ at request time (for the 404 page), so ship them with the server.
  outputFileTracingIncludes: { "/**": ["./content/**/*"] },
  async headers() {
    return [
      // Self-hosted Framer runtime, CMS data, images, videos and fonts. All paths are content-addressed.
      { source: "/_fr/:path*", headers: immutable },
      { source: "/_gs/:path*", headers: immutable },
      { source: "/_fm/:path*", headers: immutable },
    ];
  },
};

export default nextConfig;
