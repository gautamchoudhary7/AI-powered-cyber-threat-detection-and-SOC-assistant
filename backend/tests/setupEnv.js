// Runs before every test file. Test-only values; these are not real secrets.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-test-only-secret-1234567890';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_ROUNDS = '4'; // fast hashing so tests finish quickly
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.MAX_UPLOAD_MB = '1'; // small limit so the "too large" test stays fast
process.env.UPLOAD_RATE_LIMIT_MAX = '1000';
// Each test file gets its own throwaway upload folder, so tests can check it is left empty.
process.env.UPLOAD_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'soc-test-uploads-'));
