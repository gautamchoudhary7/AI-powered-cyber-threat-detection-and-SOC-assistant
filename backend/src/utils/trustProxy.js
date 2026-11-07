// How many reverse proxies sit in front of this server (nginx, a cloud load balancer, ...).
//
// Why it matters: behind a proxy every request seems to come from the proxy's address, so the rate limits would be
// shared by ALL users and the audit log would record the wrong IP. Express can read the real address from the
// X-Forwarded-For header, but only if told how many proxies to believe. Believing too many lets a client forge its
// own address, so "true" is not accepted: give an exact number (usually 1). Unset or 0 means "no proxy".
function parseTrustProxy(value) {
  if (value === undefined || value === null || String(value).trim() === '') return 0;
  const text = String(value).trim();
  if (!/^\d{1,2}$/.test(text)) {
    throw new Error('TRUST_PROXY must be a whole number of proxies (for example 1), not true/false or an address list.');
  }
  return Number(text);
}

module.exports = { parseTrustProxy };
