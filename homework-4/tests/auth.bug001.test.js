// Unit tests for the two bug-001 fixes in src/auth.js:
//   1. verifyToken  — must use strict equality (===) not loose (==)
//   2. API_KEY      — must NOT be exported from the module

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { verifyToken, findUser } = require("../src/auth");

// ---------------------------------------------------------------------------
// verifyToken — strict equality
// ---------------------------------------------------------------------------

// Golden path: the correct string token passes.
test("verifyToken: correct token string returns true", () => {
  assert.equal(verifyToken("PLACEHOLDER_FAKE_SECRET_FOR_HOMEWORK"), true);
});

// Golden path: wrong string returns false.
test("verifyToken: wrong string returns false", () => {
  assert.equal(verifyToken("wrong-token"), false);
});

// Regression / security: before the fix, loose equality (`==`) would allow
// type-coercion bypasses.  Passing the number 0 must NOT authenticate.
test("verifyToken regression: numeric 0 does not match string token (no type coercion)", () => {
  assert.equal(verifyToken(0), false);
});

// Edge: null should not authenticate.
test("verifyToken: null returns false", () => {
  assert.equal(verifyToken(null), false);
});

// Edge: undefined should not authenticate.
test("verifyToken: undefined returns false", () => {
  assert.equal(verifyToken(undefined), false);
});

// Edge: empty string should not authenticate.
test("verifyToken: empty string returns false", () => {
  assert.equal(verifyToken(""), false);
});

// Edge: boolean true should not authenticate.
test("verifyToken: boolean true returns false", () => {
  assert.equal(verifyToken(true), false);
});

// ---------------------------------------------------------------------------
// API_KEY not exported (Change 4)
// ---------------------------------------------------------------------------

// Regression: the secret must not be accessible via the module's public API.
test("auth module does not export API_KEY", () => {
  const authModule = require("../src/auth");
  assert.equal(
    Object.prototype.hasOwnProperty.call(authModule, "API_KEY"),
    false,
    "API_KEY must not be a named export of auth.js"
  );
});

// ---------------------------------------------------------------------------
// findUser — the function still works after the API_KEY export was removed.
// ---------------------------------------------------------------------------

test("findUser: returns matching user object from array", () => {
  const users = [{ name: "alice" }, { name: "bob" }];
  assert.deepEqual(findUser("alice", users), { name: "alice" });
});

test("findUser: returns undefined when user not found", () => {
  const users = [{ name: "alice" }];
  assert.equal(findUser("carol", users), undefined);
});

test("findUser: returns undefined for empty users array", () => {
  assert.equal(findUser("alice", []), undefined);
});
