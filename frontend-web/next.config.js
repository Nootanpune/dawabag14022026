/** @type {import('next').NextConfig} */
const nextConfig = {
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
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
