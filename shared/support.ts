import { z } from 'zod';

export const supportRequest = z.object({
  message: z.string().trim().min(1).max(600),
  bookingReference: z.string().regex(/^FD-[A-F0-9]{8}$/).optional(),
}).strict();

export const knowledgeDocument = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(120),
  version: z.string().min(1).max(40),
  audience: z.array(z.enum(['passenger', 'driver', 'dispatch'])).min(1),
  status: z.enum(['demo', 'approved', 'draft', 'retired']),
  reviewedAt: z.string().date(),
  keywords: z.array(z.string().max(40)).max(30),
  text: z.string().min(1).max(4000),
}).strict();
export type KnowledgeDocument = z.infer<typeof knowledgeDocument>;

export type LiveBooking = {
  reference: string; status: string; progress: string; paymentStatus: string;
  pickup: string; destination: string; pickupTime: string;
  driver: string | null; vehicle: string | null; farePence: number; fareType: string;
  meetingPoint: string; instructions: string; version: number;
};
export type SupportReply = {
  answer: string; sources: KnowledgeDocument[];
  provider: 'openai' | 'document-search'; notice: string;
  bookings: LiveBooking[]; fetchedAt: string; bookingNotice: string;
  /** Deterministic one-line summary of the caller's own bookings. Never model output. */
  bookingSummary: string;
};
