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

const isChrome = (entry: QueueEntry): number => (entry.role === "chrome" ? 1 : 0);

function compare(left: QueueEntry, right: QueueEntry): number {
  return (
    isChrome(left) - isChrome(right) ||
    left.rank - right.rank ||
    ROLE_ORDER[left.role] - ROLE_ORDER[right.role] ||
    left.position - right.position
  );
}

function within(entry: QueueEntry, maxRank: ProximityRank, maxRole: BlockRole): boolean {
  return entry.rank <= maxRank && ROLE_ORDER[entry.role] <= ROLE_ORDER[maxRole];
}

export class TranslationQueue {
  private readonly entries = new Map<string, QueueEntry>();

  public enqueue(id: BlockId, rank: ProximityRank, role: BlockRole, position: number): void {
    this.entries.set(id.value, { id, rank, role, position });
  }

  public drop(id: BlockId): void {
    this.entries.delete(id.value);
  }

  public holds(maxRank: ProximityRank, maxRole: BlockRole): boolean {
    return [...this.entries.values()].some((entry) => within(entry, maxRank, maxRole));
  }

  public pending(maxRank: ProximityRank, maxRole: BlockRole): BlockId[] {
    return [...this.entries.values()]
      .filter((entry) => within(entry, maxRank, maxRole))
      .sort(compare)
      .map((entry) => entry.id);
  }

  public take(max: number, maxRank: ProximityRank = 1, maxRole: BlockRole = "chrome"): BlockId[] {
    const taken = [...this.entries.values()]
      .filter((entry) => within(entry, maxRank, maxRole))
      .sort(compare)
      .slice(0, Math.max(0, max));

    for (const entry of taken) this.entries.delete(entry.id.value);

    return taken.map((entry) => entry.id);
  }

  public size(): number {
    return this.entries.size;
  }
}
