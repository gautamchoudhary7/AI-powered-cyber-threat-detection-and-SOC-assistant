// Grants a role to an existing user. Registration always creates "analyst", so this is
// the only way to create an admin, which keeps people from making themselves admin.
//
// Usage (from the backend folder):  npm run set-role -- user@example.com admin
const mongoose = require('mongoose');
const config = require('../src/config');
const { connectDB } = require('../src/db');
const User = require('../src/models/User');
const { ROLES } = require('../src/constants');

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !ROLES.includes(role)) {
    console.error(`Usage: npm run set-role -- <email> <${ROLES.join('|')}>`);
    process.exit(1);
  }

  await connectDB();
  // The email is a plain string from the command line, so this is an exact match.
  const result = await User.updateOne({ email: email.trim().toLowerCase() }, { $set: { role } });
  if (result.matchedCount === 0) {
    console.error('No user found with that email.');
    process.exitCode = 1;
  } else {
    console.log(`Done: ${email} is now "${role}".`);
  }
}

main()
  .catch((err) => {
    console.error('Failed:', err.name);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

// config is imported so dotenv loads backend/.env before connecting.
void config;
