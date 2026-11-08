const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export function isOriginAllowed(
  method: string,
  origin: string | undefined,
  referer: string | undefined,
  allowedOrigin: string
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  if (origin === 'null') return false;
  if (origin !== undefined) return origin === allowedOrigin;
  if (referer === undefined) return false;
  try {
    return new URL(referer).origin === allowedOrigin;
  } catch {
    return false;
  }
}
