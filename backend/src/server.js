const createApp = require('./app');
const config = require('./config');
const { connectDB } = require('./db');
const { failStaleJobs } = require('./services/detectionService');

try {
  config.validateConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = createApp();

connectDB()
  .then(async () => {
    console.log('Connected to MongoDB');
    const stale = await failStaleJobs();
    if (stale > 0) console.log(`Marked ${stale} unfinished detection job(s) from a previous run as failed.`);
    app.listen(config.port, () => {
      console.log(`Backend listening on http://localhost:${config.port}`);
    });
  })
  .catch((err) => {
    // We print only the error type and message, never the connection string (it contains a password).
    console.error('Could not connect to MongoDB:', err.name);
    console.error('Is MongoDB running, and is MONGODB_URI in backend/.env correct?');
    process.exit(1);
  });
