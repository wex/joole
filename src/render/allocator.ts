interface FreeRange {
  offset: number;
  count: number;
}

/**
 * A first-fit allocator of element ranges inside a GPU buffer, with a sorted
 * free list whose neighbouring ranges are merged on free. alloc returns null
 * when no free range is large enough, and the owner then grows the buffer.
 */
export class RangeAllocator {
  private free: FreeRange[];
  private size: number;

  constructor(capacity: number) {
    this.size = capacity;
    this.free = capacity > 0 ? [{ offset: 0, count: capacity }] : [];
  }

  get capacity(): number {
    return this.size;
  }

  /** One past the last allocated element: the count to draw. */
  get highWater(): number {
    const last = this.free[this.free.length - 1];
    return last && last.offset + last.count === this.size ? last.offset : this.size;
  }

  /** The number of allocated elements. */
  get used(): number {
    return this.size - this.free.reduce((sum, range) => sum + range.count, 0);
  }

  alloc(count: number): number | null {
    if (count <= 0) {
      return 0;
    }
    for (let i = 0; i < this.free.length; i++) {
      const range = this.free[i]!;
      if (range.count >= count) {
        const offset = range.offset;
        if (range.count === count) {
          this.free.splice(i, 1);
        } else {
          range.offset += count;
          range.count -= count;
        }
        return offset;
      }
    }
    return null;
  }

  release(offset: number, count: number): void {
    if (count <= 0) {
      return;
    }
    if (offset < 0 || offset + count > this.size) {
      throw new RangeError(`range ${offset}+${count} is outside the capacity ${this.size}`);
    }
    let i = 0;
    while (i < this.free.length && this.free[i]!.offset < offset) {
      i++;
    }
    const prev = this.free[i - 1];
    const next = this.free[i];
    if ((prev && prev.offset + prev.count > offset) || (next && offset + count > next.offset)) {
      throw new RangeError(`range ${offset}+${count} is already free`);
    }
    if (prev && prev.offset + prev.count === offset) {
      prev.count += count;
      if (next && prev.offset + prev.count === next.offset) {
        prev.count += next.count;
        this.free.splice(i, 1);
      }
    } else if (next && offset + count === next.offset) {
      next.offset = offset;
      next.count += count;
    } else {
      this.free.splice(i, 0, { offset, count });
    }
  }

  /** Adds the elements [capacity, newCapacity) to the free list. */
  grow(newCapacity: number): void {
    if (newCapacity <= this.size) {
      return;
    }
    const old = this.size;
    this.size = newCapacity;
    this.release(old, newCapacity - old);
  }
}
