import test from "node:test";
import assert from "node:assert/strict";
import { boolean } from "../src/config.mjs";

test("boolean accepts common true and false spellings", () => {
  const previous = process.env.TEST_BOOLEAN;
  try {
    for (const value of ["true", "1", "yes", "on"]) {
      process.env.TEST_BOOLEAN = value;
      assert.equal(boolean("TEST_BOOLEAN", false), true);
    }
    for (const value of ["false", "0", "no", "off"]) {
      process.env.TEST_BOOLEAN = value;
      assert.equal(boolean("TEST_BOOLEAN", true), false);
    }
  } finally {
    if (previous === undefined) delete process.env.TEST_BOOLEAN;
    else process.env.TEST_BOOLEAN = previous;
  }
});

test("boolean uses its default and rejects invalid input", () => {
  const previous = process.env.TEST_BOOLEAN;
  try {
    delete process.env.TEST_BOOLEAN;
    assert.equal(boolean("TEST_BOOLEAN", true), true);
    process.env.TEST_BOOLEAN = "sometimes";
    assert.throws(() => boolean("TEST_BOOLEAN", false), /must be a boolean/);
  } finally {
    if (previous === undefined) delete process.env.TEST_BOOLEAN;
    else process.env.TEST_BOOLEAN = previous;
  }
});
