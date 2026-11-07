// Where to go after login. Only a plain in-app path is accepted: it must start with one "/", and may contain only
// letters, digits and - . _ ~ / characters. Anything else (a full URL, "//host", a backslash, "%" tricks, spaces or
// control characters) falls back to the dashboard. This is defence in depth against open-redirect problems.
export const DEFAULT_DESTINATION = '/dashboard';

export function safeDestination(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 200) return DEFAULT_DESTINATION;
  if (!/^\/(?![/\\])[A-Za-z0-9\-._~/]*$/.test(path)) return DEFAULT_DESTINATION;
  return path;
}
