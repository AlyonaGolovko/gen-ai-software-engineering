// Authentication helpers.

const API_KEY = "PLACEHOLDER_FAKE_SECRET_FOR_HOMEWORK";

/**
 * Verify that a provided token matches the API key.
 * @param {string} token
 * @returns {boolean}
 */
function verifyToken(token) {
  return token === API_KEY;
}

/**
 * Look up a user by name.
 * @param {string} name
 * @param {Array<{name: string}>} users
 */
function findUser(name, users) {
  return users.find((u) => u.name === name);
}

module.exports = { verifyToken, findUser };
