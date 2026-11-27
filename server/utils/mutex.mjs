/**
 * AsyncMutex — A lightweight, re-entrant-safe asynchronous mutual exclusion lock.
 * Ensures that only one async task accesses a critical section at a time.
 */
export class AsyncMutex {
  #queue = [];
  #locked = false;

  /**
   * Acquire the lock. Resolves when the lock is acquired.
   * @returns {Promise<void>}
   */
  async acquire() {
    if (!this.#locked) {
      this.#locked = true;
      return;
    }
    return new Promise((resolve) => this.#queue.push(resolve));
  }

  /**
   * Release the lock and wake up the next queued task, if any.
   */
  release() {
    if (this.#queue.length > 0) {
      const next = this.#queue.shift();
      next();
    } else {
      this.#locked = false;
    }
  }

  /**
   * Whether the lock is currently held.
   * @returns {boolean}
   */
  get isLocked() {
    return this.#locked;
  }

  /**
   * Returns a promise that resolves when the lock is free.
   * @returns {Promise<void>}
   */
  async waitForUnlock() {
    if (!this.#locked) return;
    await this.acquire();
    this.release();
  }

  /**
   * Execute an async function within the lock, automatically releasing on completion or error.
   * @template T
   * @param {() => Promise<T>|T} fn
   * @returns {Promise<T>}
   */
  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
