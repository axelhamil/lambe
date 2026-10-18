import type { BlockId } from "../block/value-objects/block-id.vo";

export type ProximityRank = 0 | 1;

interface QueueEntry {
  id: BlockId;
  rank: ProximityRank;
  position: number;
}

export class TranslationQueue {
  private readonly entries = new Map<string, QueueEntry>();

  public enqueue(id: BlockId, rank: ProximityRank, position: number): void {
    const existing = this.entries.get(id.value);

    if (existing !== undefined && existing.rank <= rank) return;

    this.entries.set(id.value, { id, rank, position });
  }

  public drop(id: BlockId): void {
    this.entries.delete(id.value);
  }

  public take(max: number, maxRank: ProximityRank = 1): BlockId[] {
    const taken = [...this.entries.values()]
      .filter((entry) => entry.rank <= maxRank)
      .sort((left, right) => left.rank - right.rank || left.position - right.position)
      .slice(0, Math.max(0, max));

    for (const entry of taken) this.entries.delete(entry.id.value);

    return taken.map((entry) => entry.id);
  }

  public size(): number {
    return this.entries.size;
  }
}
