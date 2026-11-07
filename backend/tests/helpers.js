// Shared helpers for tests. Tests that use these must jest.mock('../src/models/User') themselves.
const { signToken } = require('../src/services/authService');

const makeUser = (overrides = {}) => ({
  id: 'u1',
  name: 'Asha Verma',
  email: 'asha@example.com',
  role: 'analyst',
  isActive: true,
  ...overrides,
});

// Returns an Authorization header for the user and makes the mocked User.findById return that user.
function loginAs(User, overrides = {}) {
  const user = makeUser(overrides);
  User.findById.mockImplementation(async (id) => (id === user.id ? user : null));
  return { Authorization: `Bearer ${signToken(user)}` };
}

module.exports = { makeUser, loginAs };
