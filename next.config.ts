import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy. Scripts and styles allow inline code (Next.js boot data and the
 * accessibility script that runs before paint); everything else is limited to this site plus the
 * few services the pages load directly: Google Fonts, Google Pay, map tiles and bank 3-D Secure pages.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://pay.google.com${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https:" + (dev ? " ws:" : ""),
  "worker-src 'self' blob:",
  "frame-src 'self' https:",
  "form-action 'self' https://appleid.apple.com https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'", // the checkout frames its own 3-D Secure step
].join("; ");

/** Security headers on every response (NCA ECC: secure configuration of web applications). */
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self), usb=(), serial=(), bluetooth=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    // Identifies the deployed build so the browser can drop state saved by an older version.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`,
  },
  poweredByHeader: false,
  // Self-contained server for container hosting (e.g. a cloud region in the Kingdom): see Dockerfile.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    // Routes that set their own stricter CSP (sandboxed SVG logos) keep it; everything else gets the site policy.
    const [cspHeader, ...rest] = securityHeaders;
    return [
      { source: "/:path*", headers: rest },
      { source: "/:path((?!api/rentals/logo/).*)", headers: [cspHeader] },
    ];
  },
};

export default nextConfig;
