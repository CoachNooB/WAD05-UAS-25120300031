// Vercel evaluates this before building. API_ORIGIN belongs to the web project.
const value = process.env.API_ORIGIN;
if (!value) throw new Error('Set API_ORIGIN to the deployed API HTTPS origin in Vercel.');
const api = new URL(value);
if (
  api.protocol !== 'https:' ||
  api.username ||
  api.password ||
  api.pathname !== '/' ||
  api.search ||
  api.hash
)
  throw new Error('API_ORIGIN must be an HTTPS origin, without a path or credentials.');

export const config = {
  framework: 'vite',
  buildCommand: 'pnpm build',
  outputDirectory: 'dist',
  rewrites: [
    { source: '/api/:path*', destination: `${api.origin}/api/:path*` },
    { source: '/((?!api/).*)', destination: '/index.html' },
  ],
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Content-Security-Policy',
          value:
            "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: data: https://*.supabase.co; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
        },
      ],
    },
  ],
};
