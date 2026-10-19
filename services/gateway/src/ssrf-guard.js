/**
 * SSRF Guard - Validates and sanitizes upstream MCP server URLs
 * Prevents malicious or accidental probing of cloud metadata, loopback, or unauthorized IPs.
 */

const BLOCKED_HOSTNAMES = [
  'metadata.google.internal',
  '169.254.169.254',
  '169.254.169.253',
  'metadata',
  'instance-data'
];

export function validateUpstreamUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, reason: 'URL must be a non-empty string' };
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch (err) {
    return { valid: false, reason: 'Invalid URL format' };
  }

  // Only allow http and https schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: `Disallowed protocol "${parsed.protocol}". Only http: and https: are allowed.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block Cloud metadata IPs / hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { valid: false, reason: `Forbidden target host: "${hostname}" is a cloud metadata endpoint.` };
  }

  // Check for link-local IPv4 (169.254.0.0/16)
  if (hostname.startsWith('169.254.')) {
    return { valid: false, reason: 'Access to link-local IP range (169.254.x.x) is blocked.' };
  }

  // Check for loopback IPv4 (127.0.0.0/8) unless explicitly permitted in development mode
  const isDev = process.env.NODE_ENV !== 'production' || process.env.ALLOW_LOOPBACK_UPSTREAMS === 'true';
  if (!isDev) {
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('127.')) {
      return { valid: false, reason: 'Access to loopback interface is forbidden in production.' };
    }
    // Block standard private ranges if strictly public-only
    if (process.env.STRICT_PUBLIC_ONLY === 'true') {
      if (
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
      ) {
        return { valid: false, reason: 'Internal private IP addresses are disallowed in strict public mode.' };
      }
    }
  }

  return { valid: true, url: parsed.toString() };
}
