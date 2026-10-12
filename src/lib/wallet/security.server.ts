export function walletSecurityHeaders(nonce: string, development = false) {
  return {
    'Content-Security-Policy': `default-src 'self'; script-src 'self' ${development ? "'unsafe-inline'" : `'nonce-${nonce}'`}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'${development ? ' ws: wss:' : ''}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}
