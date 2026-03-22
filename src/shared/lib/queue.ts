import { Queue } from "bullmq";
import { redis } from "./redis";

export const QUEUE_NAMES = {
  CRAWL: "crawl",
  ANALYSIS: "analysis",
  DEEP_ANALYSIS: "deep-analysis",
  SNAPSHOT: "snapshot",
  ALERT: "alert",
} as const;

export function createQueue(name: string) {
  return new Queue(name, { connection: redis });
}

export const crawlQueue = createQueue(QUEUE_NAMES.CRAWL);
export const analysisQueue = createQueue(QUEUE_NAMES.ANALYSIS);
export const deepAnalysisQueue = createQueue(QUEUE_NAMES.DEEP_ANALYSIS);
export const snapshotQueue = createQueue(QUEUE_NAMES.SNAPSHOT);
export const alertQueue = createQueue(QUEUE_NAMES.ALERT);
