export class LimitedSizeMap<Key, Value> implements Iterable<[Key, Value]> {
  readonly #entries = new Map<Key, Value>();
  readonly #capacity: number;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("capacity must be a positive integer");
    }
    this.#capacity = capacity;
  }

  get size(): number {
    return this.#entries.size;
  }

  get(key: Key): Value | undefined {
    return this.#entries.get(key);
  }

  has(key: Key): boolean {
    return this.#entries.has(key);
  }

  set(key: Key, value: Value): this {
    this.#entries.set(key, value);
    if (this.#entries.size > this.#capacity) {
      const oldest = this.#entries.keys().next();
      if (!oldest.done) {
        this.#entries.delete(oldest.value);
      }
    }
    return this;
  }

  delete(key: Key): boolean {
    return this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }

  [Symbol.iterator](): MapIterator<[Key, Value]> {
    return this.#entries[Symbol.iterator]();
  }
}
