const mongoose = require('mongoose');
const config = require('./config');

async function connectDB() {
  // Defense in depth against NoSQL injection: Mongoose strips query operators
  // such as $gt or $ne from user-supplied filter values.
  mongoose.set('sanitizeFilter', true);
  // Fail fast (5 s) instead of hanging if MongoDB is not running.
  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 5000 });
}

module.exports = { connectDB };
