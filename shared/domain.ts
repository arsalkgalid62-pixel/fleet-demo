import { z } from 'zod';
import { cityIds, DEFAULT_CITY, placesFor } from './cities.js';
export { cities, placesFor, findCity, DEFAULT_CITY } from './cities.js';
import { place } from './location.js';
export const roles = ['passenger', 'dispatch', 'driver'] as const;
export type Role = typeof roles[number];
/** Default-city sample places. Per-city places come from placesFor(cityId). */
export const addresses = placesFor(DEFAULT_CITY);
export const bookingInput = z.object({
  pickupPoint:place.optional(),destinationPoint:place.optional(),
  passengerName:z.string().trim().min(2).max(80),contact:z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')).refine(v=>v.length<=120,'Email address is too long'),
  pickup:z.enum(['station','hotel','airport','business','hospital']),destination:z.enum(['station','hotel','airport','business','hospital']),
  city:z.enum(cityIds).default(DEFAULT_CITY),timing:z.enum(['now','scheduled']),pickupLocal:z.string().max(30).optional(),
  passengers:z.number().int().min(1).max(6),luggage:z.number().int().min(0).max(6),accessible:z.boolean(),
  instructions:z.string().max(500).default(''),paymentMethod:z.enum(['cash','card']),
  flightNumber:z.string().max(12).default(''),flightDate:z.string().max(10).default(''),meetingPoint:z.string().max(120).default('')
}).refine(v=>v.pickup!==v.destination||!!v.pickupPoint||!!v.destinationPoint,{message:'Choose different pickup and destination',path:['destination']});
export type BookingInput = z.infer<typeof bookingInput>;
export const actionInput=z.object({action:z.enum(['confirm','offer','withdraw','accept','decline','on_the_way','arrived','start','complete','cancel','no_show','payment','fare_override','delay','dismiss_delay','simulation']),version:z.number().int().min(0),key:z.string().uuid(),driverId:z.string().max(40).optional(),reason:z.string().max(300).optional(),outcome:z.enum(['paid','pending','failed']).optional(),amount:z.number().int().min(0).max(100000).optional(),control:z.enum(['pause','resume','reset']).optional()});

/**
 * What the booking assistant is allowed to propose.
 *
 * Deliberately narrow: there is no fare, status, vehicle or driver field here.
 * The assistant fills in a *draft form*, nothing more. Pricing stays with the
 * server's quote(), capacity stays with the reservation transaction, and the
 * booking itself is only created when the passenger submits the reviewed form
 * through the ordinary validated createBooking path.
 */
export const assistantDraft = z.object({
  passengerName:z.string().trim().max(80).optional(),contact:z.string().trim().max(120).optional(),
  pickup:z.enum(['station','hotel','airport','business','hospital']).optional(),
  destination:z.enum(['station','hotel','airport','business','hospital']).optional(),
  timing:z.enum(['now','scheduled']).optional(),pickupLocal:z.string().max(30).optional(),
  passengers:z.number().int().min(1).max(6).optional(),luggage:z.number().int().min(0).max(6).optional(),
  accessible:z.boolean().optional(),instructions:z.string().max(500).optional(),
  paymentMethod:z.enum(['cash','card']).optional(),
  flightNumber:z.string().max(12).optional(),flightDate:z.string().max(10).optional(),meetingPoint:z.string().max(120).optional()
});
export type AssistantDraft = z.infer<typeof assistantDraft>;
export const assistantRequest=z.object({message:z.string().trim().min(1).max(600),draft:assistantDraft.default({})});

/**
 * Synthetic-contact policy.
 *
 * Demo mode restricts contacts to @example.invalid, a reserved domain that can
 * never receive mail, so no real person can be contacted by accident. Setting
 * ALLOW_REAL_CONTACTS=true relaxes it for a realistic-looking demo. Nothing is
 * sent either way — there is no email or SMS provider in this build — but a
 * real address stored here is real personal data, so the default stays strict.
 */
export const SYNTHETIC_CONTACT = /^[a-zA-Z0-9._+-]+@example\.invalid$/;
export const isSyntheticContact = (contact: string) => SYNTHETIC_CONTACT.test(contact);
