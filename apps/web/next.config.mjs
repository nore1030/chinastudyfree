/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  transpilePackages: ["@cstf/core"],
  basePath: process.env.NEXT_BASE_PATH || "",
};

export default nextConfig;
