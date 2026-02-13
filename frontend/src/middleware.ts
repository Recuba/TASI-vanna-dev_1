import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ALLOWED_HOSTS = [
  'localhost',
  'localhost:3000',
  'raid-ai-app-production.up.railway.app',
];

function getAllowedHosts(): string[] {
  const hostsEnv = process.env.NEXT_PUBLIC_ALLOWED_HOSTS;
  if (hostsEnv) {
    return hostsEnv.split(',').map((h) => h.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_HOSTS;
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Add X-Request-ID to all responses
  const existingRequestId = request.headers.get('x-request-id');
  const requestId = existingRequestId || crypto.randomUUID();
  response.headers.set('x-request-id', requestId);

  // Skip host validation in development
  if (process.env.NODE_ENV === 'development') {
    return response;
  }

  const host = request.headers.get('host');
  if (!host) {
    console.warn(`[security] Rejected request with missing Host header from ${request.ip ?? 'unknown'}`);
    return new NextResponse('Misdirected Request', { status: 421 });
  }

  const allowedHosts = getAllowedHosts();
  const isAllowed = allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );

  if (!isAllowed) {
    console.warn(`[security] Rejected request for disallowed host: ${host} from ${request.ip ?? 'unknown'}`);
    return new NextResponse('Misdirected Request', { status: 421 });
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
