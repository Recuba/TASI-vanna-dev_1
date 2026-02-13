export interface SecurityConfig {
  allowedHosts: string[];
  csrfEnabled: boolean;
  secureCookies: boolean;
  cspReportUri: string;
}

const DEFAULT_ALLOWED_HOSTS = [
  'localhost',
  'localhost:3000',
  'raid-ai-app-production.up.railway.app',
];

let _config: SecurityConfig | null = null;

export function getSecurityConfig(): SecurityConfig {
  if (_config) return _config;

  const hostsEnv = process.env.NEXT_PUBLIC_ALLOWED_HOSTS;
  const allowedHosts = hostsEnv
    ? hostsEnv.split(',').map((h) => h.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_HOSTS;

  _config = {
    allowedHosts,
    csrfEnabled: process.env.NODE_ENV === 'production',
    secureCookies: process.env.NODE_ENV === 'production',
    cspReportUri: process.env.NEXT_PUBLIC_CSP_REPORT_URI || '',
  };

  return _config;
}
