import { next } from '@vercel/functions';

/**
 * Site-wide HTTP Basic Auth gate — not per-user accounts, just a minimal
 * signal that the site isn't public yet. Runs on every request (no
 * `config.matcher`, so it covers the SPA shell and every static asset).
 * The password comes from the SITE_PASSWORD environment variable, set in
 * the Vercel project settings (never committed). Fails closed if that
 * variable isn't set, so a fresh deploy can't accidentally go public.
 */
export default function middleware(request: Request): Response {
  const password = process.env.SITE_PASSWORD;
  if (password) {
    const auth = request.headers.get('authorization');
    if (auth?.startsWith('Basic ')) {
      const decoded = atob(auth.slice('Basic '.length));
      const suppliedPassword = decoded.slice(decoded.indexOf(':') + 1);
      if (suppliedPassword === password) return next();
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="denimcat"' },
  });
}
