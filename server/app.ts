import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { assistantRequest, roles } from '../shared/domain.js';
import { cities } from '../shared/cities.js';
import { interpret } from './assistant.js';
import { lookupFlight, flightsConfigured } from './flights.js';
import { support } from './support.js';
import { searchUK, autocompleteUK } from './geo.js';
import { writePosition, readPosition } from './service.js';
import { Booking, Event, Notification, Payment } from './db.js';
import { Fault, act, addresses, createBooking, quote, setDuty, canRead, expireOffers } from './service.js';
import { decorate, fleetState, listBookings } from './state.js';
import {
  csrfGuard,
  issueCsrf,
  makeLoginLimiter,
  requireAuth,
  requireRole,
  seatSessions,
  verifyLogin,
} from './auth.js';

export type AppOptions = {
  sessionSecret: string;
  origins: string[];
  secureCookies: boolean;
  /** Sign-in attempts allowed per IP per 15 minutes. */
  loginAttempts?: number;
  /** Assistant requests allowed per IP per 5 minutes. Raised in tests. */
  assistantRequests?: number;
};

const wrap =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };

type ZodIssue = { path?: (string | number)[]; message?: string };

/** Field names as the passenger sees them on the form, not as the schema spells them. */
const FIELD_LABELS: Record<string, string> = {
  passengerName: 'Your name',
  contact: 'Contact',
  pickup: 'Pickup',
  destination: 'Destination',
  timing: 'When',
  pickupLocal: 'Pickup time',
  passengers: 'Passengers',
  luggage: 'Bags',
  accessible: 'Accessible vehicle',
  instructions: 'Pickup instructions',
  paymentMethod: 'Payment',
  flightNumber: 'Flight number',
  flightDate: 'Flight date',
  meetingPoint: 'Meeting point',
  message: 'Message',
};

/**
 * Turns Zod issues into one sentence a passenger can act on.
 *
 * Capped at three so a badly-filled form does not produce a wall of text; the
 * full `issues` array still goes out alongside for anything that wants detail.
 */
export function describeIssues(issues: ZodIssue[]): string {
  const parts = issues.slice(0, 3).map((issue) => {
    const message = issue.message ?? 'is not valid';
    const key = String(issue.path?.[0] ?? '');
    const label = FIELD_LABELS[key];
    return label ? `${label}: ${message}` : message;
  });
  if (parts.length === 0) return 'Invalid input';
  const more = issues.length - parts.length;
  return parts.join('. ') + (more > 0 ? `. And ${more} more problem${more > 1 ? 's' : ''}.` : '');
}

/**
 * Assistant calls can reach a paid third-party API, so they are throttled
 * harder than ordinary reads and separately from the sign-in limiter.
 */
const makeAssistantLimiter = (limit: number) =>
  rateLimit({
    windowMs: 5 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many assistant requests. Wait a few minutes or fill the form in directly.' },
  });

export function createApp(options: AppOptions): Express {
  const assistantLimiter = makeAssistantLimiter(options.assistantRequests ?? 30);
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: 'demo', serverTime: new Date().toISOString() });
  });

  const api = express.Router();
  api.use(seatSessions(options.sessionSecret, options.secureCookies));
  api.use(csrfGuard(options.origins));

  api.get('/session', (req, res) => {
    res.json({
      seat: req.seat,
      user: req.session.user ?? null,
      csrfToken: issueCsrf(req),
      serverTime: new Date().toISOString(),
    });
  });

  api.post(
    '/session/login',
    makeLoginLimiter(options.loginAttempts ?? 10),
    wrap(async (req, res) => {
      const { username, password } = req.body ?? {};
      if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }
      const user = await verifyLogin(username, password, req.seat!);
      if (!user) {
        res.status(401).json({ error: 'Those demo credentials do not match this seat' });
        return;
      }
      // Fresh session id on privilege change, to prevent session fixation.
      await new Promise<void>((ok, fail) => req.session.regenerate((e) => (e ? fail(e) : ok())));
      req.session.user = user;
      issueCsrf(req);
      await new Promise<void>((ok, fail) => req.session.save((e) => (e ? fail(e) : ok())));
      res.json({ user, csrfToken: req.session.csrf });
    }),
  );

  api.post('/session/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  api.get('/reference', (_req, res) => {
    res.json({
      addresses,
      cities,
      seats: roles,
      notice: 'Demo assumptions—not company-approved',
      // Booleans only — never key material. Lets the interface say what is
      // actually connected instead of carrying a hardcoded claim that goes
      // stale the moment a provider is configured.
      providers: {
        flightStatus: flightsConfigured(),
        addressSearch: !!process.env.GEOAPIFY_API_KEY,
        roadEstimate: !!process.env.GEOAPIFY_API_KEY,
      },
      allowRealContacts: process.env.ALLOW_REAL_CONTACTS === 'true',
      fares: {
        localPence: quote({ pickup: 'station', destination: 'hotel', passengers: 1 } as never).amount,
        airportPence: quote({ pickup: 'airport', destination: 'hotel', passengers: 1 } as never).amount,
        extraPassengerPence: 1000,
        note: 'Demonstration fare rules only. Not an approved tariff and not a taxi meter.',
      },
    });
  });

  api.use(requireAuth);
  const geoLimiter=rateLimit({windowMs:60000,limit:30,message:{error:'Location request limit reached. Wait a minute.'}});
  api.get('/locations/autocomplete',geoLimiter,wrap(async(req,res)=>{res.set('Cache-Control','no-store').json(await autocompleteUK(req.query.q,fetch,req.query.city===undefined?undefined:String(req.query.city)));}));
  api.get('/locations/search',geoLimiter,wrap(async(req,res)=>{res.set('Cache-Control','no-store').json(await searchUK(req.query.q,fetch,req.query.city===undefined?undefined:String(req.query.city)));}));
  api.get('/bookings/:id/location',wrap(async(req,res)=>{res.set('Cache-Control','no-store').json(await readPosition(req.actor!,String(req.params.id)));}));
  api.post('/bookings/:id/location',geoLimiter,wrap(async(req,res)=>{const row=await writePosition(req.actor!,String(req.params.id),req.body);res.json({version:row?.version});}));

  api.get(
    '/state',
    wrap(async (req, res) => {
      // Sweep here as well as on the local timer: a serverless deployment has
      // no long-lived process, and Vercel's Hobby cron runs only once a day,
      // which is useless against a 60-second offer. Every client polls this
      // endpoint, so expiry stays timely wherever the app runs.
      await expireOffers().catch(() => {});
      const actor = req.actor!;
      const [bookings, fleet] = await Promise.all([listBookings(actor), fleetState(actor)]);
      res.json({ bookings, fleet, serverTime: new Date().toISOString(), pollIntervalMs: 3000 });
    }),
  );

  api.post(
    '/bookings',
    requireRole('passenger', 'dispatch'),
    wrap(async (req, res) => {
      const key = String(req.get('idempotency-key') ?? '');
      const booking = await createBooking(req.actor!, req.body, key);
      res.status(201).json(decorate(req.actor!, booking));
    }),
  );

  api.get(
    '/bookings/:id',
    wrap(async (req, res) => {
      const b = await Booking.findById(String(req.params.id));
      // Same 404 for missing and forbidden, so references cannot be enumerated.
      if (!b || !canRead(req.actor!, b)) {
        res.status(404).json({ error: 'Booking unavailable' });
        return;
      }
      const events = await Event.find({ bookingId: b._id }).sort({ createdAt: 1 }).lean();
      const payments = await Payment.find({ bookingId: b._id }).lean();
      res.json({
        booking: decorate(req.actor!, b),
        events: req.actor!.role === 'passenger' ? [] : events,
        payments,
      });
    }),
  );

  api.post(
    '/bookings/:id/actions',
    wrap(async (req, res) => {
      const booking = await act(req.actor!, String(req.params.id), req.body);
      res.json(decorate(req.actor!, booking));
    }),
  );

  // Live flight status for one airport booking. Read-only: it can report a
  // delay but never reschedules anything — a dispatcher reviews and decides,
  // exactly as with the simulated delay.
  api.get(
    '/bookings/:id/flight',
    wrap(async (req, res) => {
      const b = await Booking.findById(String(req.params.id));
      // Same 404 for missing and forbidden, matching the booking endpoints.
      if (!b || !canRead(req.actor!, b)) {
        res.status(404).json({ error: 'Booking unavailable' });
        return;
      }
      const airport = b.input.pickup === 'airport' || b.input.destination === 'airport';
      res.set('Cache-Control', 'no-store');
      res.json(airport ? await lookupFlight(b.input.flightNumber, b.input.flightDate) : { state: 'not_applicable' });
    }),
  );

  api.post(
    '/driver/duty',
    requireRole('driver'),
    wrap(async (req, res) => {
      const driver = await setDuty(req.actor!, String(req.body?.duty ?? ''));
      res.json(driver);
    }),
  );

  // The assistant drafts a form and nothing else: it has no database access and
  // returns no booking. Creation still goes through POST /bookings above, with
  // the passenger's own review and idempotency key.
  api.post(
    '/assistant/draft',
    requireRole('passenger', 'dispatch'),
    assistantLimiter,
    wrap(async (req, res) => {
      const request = assistantRequest.parse(req.body);
      res.json(await interpret(request.message, request.draft));
    }),
  );

  api.post('/assistant/ask', assistantLimiter, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await support(req.actor!, req.body));
  }));

  api.get(
    '/notifications',
    requireRole('dispatch'),
    wrap(async (_req, res) => {
      const rows = await Notification.find().sort({ createdAt: -1 }).limit(50).lean();
      res.json({ notice: 'Preview only. No SMS or email is sent in demo mode.', rows });
    }),
  );

  app.use('/api', api);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unknown endpoint' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof Fault) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err && typeof err === 'object' && (err as { name?: string }).name === 'ZodError') {
      // Say which field is wrong and why. A bare "Invalid input" leaves the
      // passenger with no way to know what to change — the schema already has
      // a usable message, it was just being dropped on the floor.
      const issues = (err as { issues?: ZodIssue[] }).issues ?? [];
      res.status(400).json({ error: describeIssues(issues), issues });
      return;
    }
    console.error('[api] unhandled error', err);
    res.status(500).json({ error: 'Unexpected server error' });
  });

  return app;
}
