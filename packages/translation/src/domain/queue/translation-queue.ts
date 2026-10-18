import type { BlockRole } from "../block/block";
import type { BlockId } from "../block/value-objects/block-id.vo";

export type ProximityRank = 0 | 1;

interface QueueEntry {
  id: BlockId;
  rank: ProximityRank;
  role: BlockRole;
  position: number;
}

const ROLE_ORDER: Record<BlockRole, number> = { article: 0, content: 1, chrome: 2 };

function compare(left: QueueEntry, right: QueueEntry): number {
  return (
    left.rank - right.rank ||
    ROLE_ORDER[left.role] - ROLE_ORDER[right.role] ||
    left.position - right.position
  );
}

export class TranslationQueue {
  private readonly entries = new Map<string, QueueEntry>();

  public enqueue(id: BlockId, rank: ProximityRank, role: BlockRole, position: number): void {
    const existing = this.entries.get(id.value);

    if (existing !== undefined && existing.rank <= rank) return;

    this.entries.set(id.value, { id, rank, role, position });
  }

  public drop(id: BlockId): void {
    this.entries.delete(id.value);
  }

  public take(max: number, maxRank: ProximityRank = 1, maxRole: BlockRole = "chrome"): BlockId[] {
    const taken = [...this.entries.values()]
      .filter((entry) => entry.rank <= maxRank && ROLE_ORDER[entry.role] <= ROLE_ORDER[maxRole])
      .sort(compare)
      .slice(0, Math.max(0, max));

    for (const entry of taken) this.entries.delete(entry.id.value);

    return taken.map((entry) => entry.id);
  }

  public size(): number {
    return this.entries.size;
  }
}
