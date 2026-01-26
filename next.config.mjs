/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  eslint: {
    ignoreDuringBuilds: true,
  },

  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ignored: /node_modules/,
        aggregateTimeout: 200,
        poll: 500, // Ensures Webpack detects file changes for Fast Refresh
      };
    }
    return config;
  },
};

export default nextConfig;
