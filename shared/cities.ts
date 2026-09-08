/**
 * Supported UK cities and their sample pickup points.
 *
 * The five slot ids (station, hotel, airport, business, hospital) are
 * *categories*, not fixed places: every city fills them with its own real
 * landmarks. That keeps the booking schema, capacity logic and assistant
 * unchanged while the passenger sees genuine UK addresses instead of the
 * original "Demo Central Station" fixtures.
 *
 * Coordinates are approximate public landmark positions, good to a few hundred
 * metres. They are not surveyed pickup points and no operator has approved them
 * as serviceable — the service area below is a demo radius, not a licensed one.
 */

export const slotIds = ['station', 'hotel', 'airport', 'business', 'hospital'] as const;
export type SlotId = (typeof slotIds)[number];

export type CityPlace = { id: SlotId; label: string; lat: number; lng: number };
export type City = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  /** Demo service radius in kilometres, wide enough to include the airport. */
  radiusKm: number;
  /** A central postcode, shown only as a search example. */
  samplePostcode: string;
  places: CityPlace[];
};

const city = (
  id: string,
  name: string,
  region: string,
  lat: number,
  lng: number,
  radiusKm: number,
  samplePostcode: string,
  places: [SlotId, string, number, number][],
): City => ({ id, name, region, lat, lng, radiusKm, samplePostcode, places: places.map(([s, label, la, ln]) => ({ id: s, label, lat: la, lng: ln })) });

export const cities: City[] = [
  city('manchester', 'Manchester', 'North West England', 53.4808, -2.2426, 25, 'M1 2AP', [
    ['station', 'Manchester Piccadilly Station', 53.4774, -2.2309],
    ['hotel', 'The Midland Hotel, Manchester', 53.4776, -2.2452],
    ['airport', 'Manchester Airport', 53.3654, -2.2725],
    ['business', 'MediaCityUK, Salford', 53.4723, -2.2986],
    ['hospital', 'Manchester Royal Infirmary', 53.4626, -2.2258],
  ]),
  city('london', 'London', 'Greater London', 51.5074, -0.1278, 35, 'SW1A 1AA', [
    ['station', "London King's Cross Station", 51.5308, -0.1238],
    ['hotel', 'The Savoy, Strand', 51.5101, -0.1206],
    ['airport', 'Heathrow Airport', 51.47, -0.4543],
    ['business', 'Canary Wharf', 51.5054, -0.0235],
    ['hospital', "St Thomas' Hospital", 51.4991, -0.118],
  ]),
  city('birmingham', 'Birmingham', 'West Midlands', 52.4862, -1.8904, 25, 'B2 4QA', [
    ['station', 'Birmingham New Street Station', 52.4778, -1.8998],
    ['hotel', 'Hyatt Regency Birmingham', 52.4778, -1.9105],
    ['airport', 'Birmingham Airport', 52.4539, -1.748],
    ['business', 'Brindleyplace', 52.4796, -1.9106],
    ['hospital', 'Queen Elizabeth Hospital Birmingham', 52.453, -1.942],
  ]),
  city('leeds', 'Leeds', 'West Yorkshire', 53.8008, -1.5491, 25, 'LS1 4DY', [
    ['station', 'Leeds Station', 53.7955, -1.5491],
    ['hotel', 'The Queens Hotel, Leeds', 53.7957, -1.5479],
    ['airport', 'Leeds Bradford Airport', 53.8659, -1.6606],
    ['business', 'Leeds Dock', 53.7906, -1.534],
    ['hospital', 'Leeds General Infirmary', 53.8016, -1.554],
  ]),
  city('liverpool', 'Liverpool', 'Merseyside', 53.4084, -2.9916, 25, 'L1 1JD', [
    ['station', 'Liverpool Lime Street Station', 53.4076, -2.9776],
    ['hotel', 'Titanic Hotel Liverpool', 53.418, -2.993],
    ['airport', 'Liverpool John Lennon Airport', 53.3336, -2.8497],
    ['business', 'Princes Dock, Liverpool Waters', 53.413, -2.995],
    ['hospital', 'Royal Liverpool University Hospital', 53.4085, -2.964],
  ]),
  city('glasgow', 'Glasgow', 'Scotland', 55.8642, -4.2518, 25, 'G1 3SL', [
    ['station', 'Glasgow Central Station', 55.8595, -4.2578],
    ['hotel', 'Grand Central Hotel, Glasgow', 55.86, -4.2585],
    ['airport', 'Glasgow Airport', 55.8687, -4.4351],
    ['business', 'Glasgow International Financial Services District', 55.86, -4.27],
    ['hospital', 'Queen Elizabeth University Hospital', 55.8626, -4.3387],
  ]),
  city('edinburgh', 'Edinburgh', 'Scotland', 55.9533, -3.1883, 25, 'EH1 1BQ', [
    ['station', 'Edinburgh Waverley Station', 55.952, -3.19],
    ['hotel', 'The Balmoral, Edinburgh', 55.9524, -3.1893],
    ['airport', 'Edinburgh Airport', 55.95, -3.3725],
    ['business', 'Edinburgh Park', 55.927, -3.307],
    ['hospital', 'Royal Infirmary of Edinburgh', 55.9216, -3.137],
  ]),
  city('bristol', 'Bristol', 'South West England', 51.4545, -2.5879, 25, 'BS1 6QF', [
    ['station', 'Bristol Temple Meads Station', 51.4491, -2.5814],
    ['hotel', 'Bristol Marriott Royal Hotel', 51.453, -2.594],
    ['airport', 'Bristol Airport', 51.3827, -2.7191],
    ['business', 'Temple Quay, Bristol', 51.452, -2.583],
    ['hospital', 'Bristol Royal Infirmary', 51.4585, -2.596],
  ]),
];

export const cityIds = cities.map((c) => c.id) as [string, ...string[]];
export const DEFAULT_CITY = 'manchester';

export const findCity = (id?: string): City =>
  cities.find((c) => c.id === id) ?? cities.find((c) => c.id === DEFAULT_CITY)!;

/** The five sample places for one city, in the shape the booking form expects. */
export const placesFor = (cityId?: string) => findCity(cityId).places;

/** Great-circle distance in kilometres. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether a point falls inside one city's demo service radius. */
export const inCity = (p: { lat: number; lng: number }, cityId?: string): boolean => {
  const c = findCity(cityId);
  return distanceKm(p, c) <= c.radiusKm;
};

/** Whether a point falls inside any supported city. */
export const inAnyCity = (p: { lat: number; lng: number }): boolean =>
  cities.some((c) => distanceKm(p, c) <= c.radiusKm);

/** The city containing a point, if any. */
export const cityFor = (p: { lat: number; lng: number }): City | undefined =>
  cities.find((c) => distanceKm(p, c) <= c.radiusKm);

/** How close a point must be to count as the city's airport. */
const AIRPORT_RADIUS_KM = 3;

/**
 * Whether one side of a journey is really the airport.
 *
 * A custom pin overrides the slot, so the slot alone cannot decide this: the
 * form defaults `destination` to 'airport', and a booking that overrode the
 * destination with a city-centre pin was still priced as a fixed airport
 * transfer and still demanded flight details.
 */
export function isAirportSide(
  input: { city?: string; pickup?: string; destination?: string; pickupPoint?: { lat: number; lng: number }; destinationPoint?: { lat: number; lng: number } },
  side: 'pickup' | 'destination',
): boolean {
  const point = side === 'pickup' ? input.pickupPoint : input.destinationPoint;
  if (!point) return input[side] === 'airport';
  const airport = placesFor(input.city).find((p) => p.id === 'airport');
  return !!airport && distanceKm(point, airport) <= AIRPORT_RADIUS_KM;
}

/** Whether either end of the journey is the airport. */
export const isAirportJourney = (input: Parameters<typeof isAirportSide>[0]): boolean =>
  isAirportSide(input, 'pickup') || isAirportSide(input, 'destination');
