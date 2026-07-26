/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_OUTPUT_DIR ?? ".next",
};

export default nextConfig;
