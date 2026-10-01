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
  // Security headers on every page, whatever sits in front of the site: no
  // framing (clickjacking of checkout, admin and portals), no MIME sniffing,
  // no full URLs leaked to other sites; camera and microphone only for this
  // site's own video consultations (C-22). No full CSP here: product photos
  // load from signed object-store links whose host differs per environment.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        ],
      },
    ];
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
