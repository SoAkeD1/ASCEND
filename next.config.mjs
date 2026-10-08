/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // PGlite (local Postgres in WebAssembly) and the Postgres driver must run as plain Node modules.
    serverComponentsExternalPackages: ["@electric-sql/pglite", "postgres"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // The app never asks for these device permissions.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), contacts=(), clipboard-read=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
