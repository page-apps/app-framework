import assert from "node:assert/strict";
import test from "node:test";
import { STANDARD_SECURITY_DISCLOSURE, SECURITY_DISCLOSURE, statusLabel } from "../dist/index.js";

test("the framework-owned disclosure covers same-origin, private-cache, and repository scope risks", () => {
  assert.equal(STANDARD_SECURITY_DISCLOSURE, SECURITY_DISCLOSURE);
  assert.match(STANDARD_SECURITY_DISCLOSURE, /same origin/);
  assert.match(STANDARD_SECURITY_DISCLOSURE, /locally cached private data/);
  assert.match(STANDARD_SECURITY_DISCLOSURE, /displayed repository/);
  assert.match(STANDARD_SECURITY_DISCLOSURE, /fine-grained, expiring token/);
  assert.match(STANDARD_SECURITY_DISCLOSURE, /Session-only storage is recommended/);
});

test("lifecycle status labels distinguish committed and published", () => {
  assert.equal(statusLabel("committed"), "Committed");
  assert.equal(statusLabel("building"), "Building…");
  assert.equal(statusLabel("published"), "Published");
  assert.equal(statusLabel("validating"), "Validating data…");
  assert.equal(statusLabel("data-ready"), "Data ready");
});
