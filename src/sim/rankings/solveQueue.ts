// Wuthering Tools+ /rankings: who stays in line when a new pass starts (controller.ts `cancelQueued`, `solveAll`). A table
// pass's teams still in line are dropped once a newer pass takes over, unsolved. A sync's are not: it reads each answer
// back, and a dropped team reads as "no build at your state".

export interface QueuedJob {
  /** the `bestKey()` the job was asked for */
  bk: string;
  /** a sync waits on it: a table pass starting behind it never drops it */
  keep: boolean;
}

/** Takes out what a new pass no longer wants and returns it, for its waiters to hear. */
export function dropUnkept<T extends QueuedJob>(queue: T[]): T[] {
  const dropped = queue.filter((job) => !job.keep);
  queue.splice(0, queue.length, ...queue.filter((job) => job.keep));
  return dropped;
}

/** A sync asked for a team a table pass already has in line. It waits on that job rather than queueing its own, so the
 *  job has to stay as long as the sync's would have. */
export function keepInLine(queue: QueuedJob[], bk: string): void {
  const job = queue.find((j) => j.bk === bk);
  if (job) job.keep = true;
}
