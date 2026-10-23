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

export interface TextMeasure {
  letters: number;
  length: number;
}

interface FirstCandidate extends TextMeasure {
  entry: QueueEntry;
  order: number;
}

const MIN_REAL_TEXT_LETTERS = 12;

const tierOf = (entry: QueueEntry): number => isChrome(entry) * 2 + entry.rank;

const isReal = (candidate: FirstCandidate): number =>
  candidate.letters >= MIN_REAL_TEXT_LETTERS ? 1 : 0;

function firstPriority(left: FirstCandidate, right: FirstCandidate): number {
  return (
    tierOf(left.entry) - tierOf(right.entry) ||
    isReal(right) - isReal(left) ||
    left.length - right.length ||
    left.order - right.order
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

  public take(max: number, maxRank: ProximityRank = 1, maxRole: BlockRole = "chrome"): BlockId[] {
    return this.remove(this.ordered(maxRank, maxRole).slice(0, Math.max(0, max)));
  }

  public takeFirst(
    size: number,
    maxRank: ProximityRank,
    maxRole: BlockRole,
    measure: (id: BlockId) => TextMeasure,
  ): BlockId[] {
    const candidates = this.ordered(maxRank, maxRole);
    const chosen = new Set(
      candidates
        .map((entry, order): FirstCandidate => ({ entry, order, ...measure(entry.id) }))
        .sort(firstPriority)
        .slice(0, Math.max(0, size))
        .map((candidate) => candidate.entry),
    );

    return this.remove(candidates.filter((entry) => chosen.has(entry)));
  }

  public size(): number {
    return this.entries.size;
  }

  private ordered(maxRank: ProximityRank, maxRole: BlockRole): QueueEntry[] {
    return [...this.entries.values()]
      .filter((entry) => within(entry, maxRank, maxRole))
      .sort(compare);
  }

  private remove(entries: QueueEntry[]): BlockId[] {
    for (const entry of entries) this.entries.delete(entry.id.value);

    return entries.map((entry) => entry.id);
  }
}
