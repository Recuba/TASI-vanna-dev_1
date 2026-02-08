/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8084/api/:path*',
      },
      {
        source: '/health',
        destination: 'http://localhost:8084/health',
      },
    ];
  },
};

export default nextConfig;
