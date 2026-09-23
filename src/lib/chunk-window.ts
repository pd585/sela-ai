/**
 * Bounded window helpers for document chunk content loading.
 * Meta (index/page) stays cheap; full `content` loads only for a stable viewport window.
 */

export const CHUNK_WINDOW_SIZE = 30;
export const CHUNK_PREFETCH_MARGIN = 15;
/** Ignore tiny scroll deltas that would only shift the window by this many indices. */
export const CHUNK_WINDOW_STABILITY = 8;

export type ChunkWindow = { start: number; end: number };

export type ChunkMeta = { chunk_index: number; page_number: number };
export type ChunkContent = ChunkMeta & { content: string };

/** Inclusive [start, end] clamped to [0, totalCount-1]. Empty when no chunks. */
export function clampChunkWindow(
  start: number,
  end: number,
  totalCount: number,
): ChunkWindow | null {
  if (totalCount <= 0) return null;
  const lo = Math.max(0, Math.min(start, totalCount - 1));
  const hi = Math.max(lo, Math.min(end, totalCount - 1));
  return { start: lo, end: hi };
}

/**
 * Expand a visible [visibleStart, visibleEnd] range with prefetch margin,
 * then grow to at least CHUNK_WINDOW_SIZE when possible.
 */
export function computeChunkWindow(
  visibleStart: number,
  visibleEnd: number,
  totalCount: number,
  margin: number = CHUNK_PREFETCH_MARGIN,
  minSize: number = CHUNK_WINDOW_SIZE,
): ChunkWindow | null {
  if (totalCount <= 0) return null;
  let start = visibleStart - margin;
  let end = visibleEnd + margin;
  const span = end - start + 1;
  if (span < minSize) {
    const grow = minSize - span;
    const before = Math.floor(grow / 2);
    const after = grow - before;
    start -= before;
    end += after;
  }
  return clampChunkWindow(start, end, totalCount);
}

/** Initial window for opening Original / side-by-side (top of document). */
export function initialChunkWindow(totalCount: number): ChunkWindow | null {
  // Exact top window — prefetch margin applies on scroll, not on first paint.
  return clampChunkWindow(0, CHUNK_WINDOW_SIZE - 1, totalCount);
}

/**
 * Keep the previous window when the next one barely moved, to avoid
 * a network round-trip on every tiny scroll tick.
 */
export function stabilizeChunkWindow(
  previous: ChunkWindow | null,
  next: ChunkWindow | null,
  stability: number = CHUNK_WINDOW_STABILITY,
): ChunkWindow | null {
  if (!next) return null;
  if (!previous) return next;
  if (
    Math.abs(previous.start - next.start) < stability &&
    Math.abs(previous.end - next.end) < stability &&
    next.start >= previous.start - stability &&
    next.end <= previous.end + stability
  ) {
    // Prefer the larger already-fetched window when overlap is high.
    return {
      start: Math.min(previous.start, next.start),
      end: Math.max(previous.end, next.end),
    };
  }
  return next;
}

/** Merge newly fetched content rows into a Map keyed by chunk_index. */
export function mergeChunkContent(
  existing: Map<number, ChunkContent>,
  incoming: ChunkContent[],
): Map<number, ChunkContent> {
  if (incoming.length === 0) return existing;
  const next = new Map(existing);
  for (const row of incoming) {
    next.set(row.chunk_index, row);
  }
  return next;
}

/** Build display list from meta + loaded content (empty string when not loaded). */
export function assembleChunks(
  meta: ChunkMeta[],
  loaded: Map<number, ChunkContent>,
): ChunkContent[] {
  return meta.map((m) => {
    const hit = loaded.get(m.chunk_index);
    return hit ?? { ...m, content: "" };
  });
}

/**
 * Unique chunk indices needed for Expert Memo comparison (sections/clauses/terms/issues/Q&A),
 * preserving citation identity without loading the full corpus.
 */
export function collectMemoChunkIndices(args: {
  sections?: Array<{ chunk_index: number }>;
  clauses?: Array<{ chunk_index: number }>;
  keyTerms?: Array<{ chunk_index: number }>;
  issues?: Array<{ chunk_index: number }>;
  citations?: Array<{ chunkIndex: number }>;
}): number[] {
  const set = new Set<number>();
  for (const row of args.sections ?? []) set.add(row.chunk_index);
  for (const row of args.clauses ?? []) set.add(row.chunk_index);
  for (const row of args.keyTerms ?? []) set.add(row.chunk_index);
  for (const row of args.issues ?? []) set.add(row.chunk_index);
  for (const row of args.citations ?? []) set.add(row.chunkIndex);
  return [...set].filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
}

/** Split indices into bounded batches for `.in("chunk_index", batch)` fetches. */
export function batchIndices(indices: number[], batchSize = 40): number[][] {
  const batches: number[][] = [];
  for (let i = 0; i < indices.length; i += batchSize) {
    batches.push(indices.slice(i, i + batchSize));
  }
  return batches;
}

/** Row count a windowed query would request (for tests / instrumentation). */
export function windowRowCount(window: ChunkWindow | null): number {
  if (!window) return 0;
  return window.end - window.start + 1;
}
