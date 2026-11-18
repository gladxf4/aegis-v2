"use strict";

/**
 * Raised when challenge, nullifier, or rate-limit state cannot be read or written.
 */
class StoreError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "StoreError";
    this.code = "STORE_UNAVAILABLE";
    this.cause = cause;
  }
}

module.exports = { StoreError };
