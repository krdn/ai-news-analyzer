import type { Event } from "@prisma/client";
export type { Event };

export interface EventWithRelations extends Event {
  celebrity?: { name: string; category: string };
}
