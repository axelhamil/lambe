import type { BlockId } from "../block/value-objects/block-id.vo";

export type ProximityRank = 0 | 1;

interface QueueEntry {
  id: BlockId;
  rank: ProximityRank;
  order: number;
}

export class TranslationQueue {
  private readonly entries = new Map<string, QueueEntry>();
  private nextOrder = 0;

  public enqueue(id: BlockId, rank: ProximityRank): void {
    const existing = this.entries.get(id.value);

    if (existing !== undefined && existing.rank <= rank) return;

    this.entries.set(id.value, { id, rank, order: this.nextOrder });
    this.nextOrder += 1;
  }

  public drop(id: BlockId): void {
    this.entries.delete(id.value);
  }

  public take(max: number): BlockId[] {
    const taken = [...this.entries.values()]
      .sort((left, right) => left.rank - right.rank || left.order - right.order)
      .slice(0, Math.max(0, max));

    for (const entry of taken) this.entries.delete(entry.id.value);

    return taken.map((entry) => entry.id);
  }

  public size(): number {
    return this.entries.size;
  }
}
