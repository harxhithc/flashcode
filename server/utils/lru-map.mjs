/**
 * LRUMap — A bounded Key-Value cache with Least-Recently-Used eviction.
 * Provides O(1) get, set, delete, and automatic capacity management.
 */
export class LRUMap {
  #max;
  #map = new Map();

  /**
   * @param {number} max Maximum number of items before oldest is evicted (default 10)
   */
  constructor(max = 10) {
    if (typeof max !== "number" || max <= 0) {
      throw new TypeError("LRUMap capacity must be a positive integer");
    }
    this.#max = max;
  }

  /**
   * Get a value and promote its key to most recently used.
   * @param {*} key
   * @returns {*} value or undefined
   */
  get(key) {
    if (!this.#map.has(key)) return undefined;
    const val = this.#map.get(key);
    this.#map.delete(key);
    this.#map.set(key, val); // Promote to newest
    return val;
  }

  /**
   * Set a key-value pair, evicting the oldest key if capacity is exceeded.
   * @param {*} key
   * @param {*} val
   */
  set(key, val) {
    if (this.#map.has(key)) {
      this.#map.delete(key);
    } else if (this.#map.size >= this.#max) {
      const oldestKey = this.#map.keys().next().value;
      this.#map.delete(oldestKey);
    }
    this.#map.set(key, val);
  }

  /**
   * Check if a key is present without promoting it.
   * @param {*} key
   * @returns {boolean}
   */
  has(key) {
    return this.#map.has(key);
  }

  /**
   * Delete a key.
   * @param {*} key
   * @returns {boolean}
   */
  delete(key) {
    return this.#map.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear() {
    this.#map.clear();
  }

  /**
   * Current number of stored entries.
   * @returns {number}
   */
  get size() {
    return this.#map.size;
  }

  /**
   * Maximum capacity.
   * @returns {number}
   */
  get capacity() {
    return this.#max;
  }
}
