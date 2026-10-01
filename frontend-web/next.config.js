/** @type {import('next').NextConfig} */
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const nextConfig = {
  // Self-contained server bundle for the Docker image
  output: 'standalone',
  images: {
    domains: [
      'dawabag-prescriptions-prod.s3.ap-south-1.amazonaws.com',
      'dawabag-prescriptions-prod.s3.amazonaws.com',
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
