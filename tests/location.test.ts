import {before,after,it} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import {bootstrap,client,localJourney,type Client} from './helpers.js';
import {Booking,LivePosition} from '../server/db.js';
import {inDemoArea,ukTests} from '../shared/location.js';
import {cities,placesFor,inCity,inAnyCity} from '../shared/cities.js';
import {searchUK,roadEstimate} from '../server/geo.js';
let passenger:Client,dispatch:Client,driver:Client,other:Client,id:string,savedGeoKey:string|undefined;
const read=(c:Client,bookingId=id)=>c.agent.get(`/api/bookings/${bookingId}/location`).set(c.raw().headers);
const write=(c:Client,body:any)=>c.agent.post(`/api/bookings/${id}/location`).set(c.raw().headers).send(body);
const point=()=>({lat:53.4774,lng:-2.2309,accuracy:10,source:'uk-test',capturedAt:new Date().toISOString()});
const update=async(c:Client,extra={})=>{const r=await read(c);return write(c,{version:r.body.version,bookingVersion:r.body.bookingVersion,key:randomUUID(),point:point(),...extra});};
before(async()=>{// Never reach the live provider from tests, whatever .env holds.
 savedGeoKey=process.env.GEOAPIFY_API_KEY;delete process.env.GEOAPIFY_API_KEY;const app=await bootstrap('location');passenger=client(app,'passenger');dispatch=client(app,'dispatch');driver=client(app,'driver');other=client(app,'driver');await passenger.signIn('passenger');await dispatch.signIn('dispatch');await driver.signIn('drv-ashton');await other.signIn('drv-baker');const created=await passenger.create(localJourney());id=created.body._id;let r=await dispatch.act(id,{action:'confirm',version:0});r=await dispatch.act(id,{action:'offer',version:r.body.version,driverId:'drv-ashton'});r=await driver.act(id,{action:'accept',version:r.body.version});assert.equal(r.status,200);});
after(async()=>{if(savedGeoKey===undefined)delete process.env.GEOAPIFY_API_KEY;else process.env.GEOAPIFY_API_KEY=savedGeoKey;await mongoose.connection.dropDatabase();await mongoose.disconnect();});
it('recognises Manchester test points and rejects Pakistan coordinates',()=>{assert.ok(ukTests.every(inDemoArea));assert.equal(inDemoArea({lat:24.86,lng:67.01}),false);});
it('persists custom pickup and destination without replacing sample journeys',async()=>{const r=await passenger.create(localJourney({pickupPoint:ukTests[0],destinationPoint:ukTests[2]}));assert.equal(r.status,201);assert.equal(r.body.fromLabel,ukTests[0]!.label);assert.equal(r.body.toPoint.lat,ukTests[2]!.lat);assert.equal(r.body.status,'requested');const confirmation=await dispatch.act(r.body._id,{action:'confirm',version:0});assert.equal(confirmation.status,503);assert.equal((await Booking.findById(r.body._id))!.status,'requested');});
it('rejects out-of-area and identical custom pins',async()=>{assert.equal((await passenger.create(localJourney({pickupPoint:{...ukTests[0],lat:24.86,lng:67.01}}))).status,400);assert.equal((await passenger.create(localJourney({pickupPoint:ukTests[0],destinationPoint:ukTests[0]}))).status,400);});
it('requires CSRF and driver ownership',async()=>{assert.equal((await driver.agent.post(`/api/bookings/${id}/location`).set('X-Fleet-Seat','driver').send({})).status,403);assert.equal((await update(passenger)).status,403);const missing=await read(other,'missing');const forbidden=await read(other);assert.equal(forbidden.status,404);assert.deepEqual(missing.body,forbidden.body);});
it('shares the same labelled sample with assigned passenger and dispatch',async()=>{assert.equal((await update(driver)).status,200);const [a,b]=await Promise.all([read(passenger),read(dispatch)]);assert.equal(a.body.position.source,'uk-test');assert.deepEqual(a.body.position,b.body.position);assert.equal(a.body.stale,false);});
it('prevents double writes and stale concurrent telemetry versions',async()=>{const r=await read(driver);const body={key:randomUUID(),version:r.body.version,bookingVersion:r.body.bookingVersion,point:point()};const a=await write(driver,body);const replay=await write(driver,body);assert.equal(a.status,200);assert.equal(replay.body.version,a.body.version);const current=await read(driver);const inputs=[1,2].map(()=>({key:randomUUID(),version:current.body.version,bookingVersion:current.body.bookingVersion,point:point()}));const results=await Promise.all(inputs.map(v=>write(driver,v)));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);});
it('rejects stale clocks, non-demo test updates and out-of-area GPS',async()=>{assert.equal((await update(driver,{point:{...point(),capturedAt:new Date(Date.now()-120000).toISOString()}})).status,400);assert.equal((await update(driver,{point:{...point(),lat:24.86,lng:67.01}})).status,400);process.env.DEMO_MODE='false';try{assert.equal((await update(driver)).status,403);}finally{process.env.DEMO_MODE='true';}});
it('marks old locations stale and stop hides coordinates',async()=>{await LivePosition.updateOne({_id:id},{$set:{'point.capturedAt':new Date(Date.now()-45000).toISOString()}});assert.equal((await read(passenger)).body.stale,true);assert.equal((await update(driver,{stop:true,point:undefined})).status,200);assert.equal((await read(passenger)).body.position,null);});
it('cancel racing a GPS write never exposes a location after cancellation',async()=>{const current=await read(driver);const b=await Booking.findById(id);await Promise.all([write(driver,{key:randomUUID(),version:current.body.version,bookingVersion:b!.version,point:point()}),dispatch.act(id,{action:'cancel',version:b!.version,reason:'Location race test'})]);assert.equal((await read(passenger)).body.position,null);assert.equal((await read(driver)).status,404);});
it('search adapter scopes to the selected city and validates results without live credentials',async()=>{process.env.GEOAPIFY_API_KEY='fake-test-key';try{const fake=(async(url:any)=>{
 // Results are constrained to the chosen city's radius and biased to its centre,
 // so "station" returns that city's station rather than a UK-wide list.
 assert.match(url.searchParams.get('filter'),/^circle:-2\.2426,53\.4808,25000$/);
 assert.match(url.searchParams.get('bias'),/^proximity:-2\.2426,53\.4808$/);
 return new Response(JSON.stringify({results:[{country_code:'gb',formatted:'Manchester Piccadilly',lat:53.4774,lon:-2.2309},{country_code:'pk',formatted:'Karachi',lat:24.86,lon:67.01}]}));}) as typeof fetch;const result=await searchUK('Manchester',fake,'manchester');assert.equal(result.results.length,1);assert.equal(result.results[0].inServiceArea,true);assert.equal(result.city,'Manchester');const route=await roadEstimate(localJourney(),(async()=>new Response(JSON.stringify({features:[{properties:{time:901,distance:6000}}]}))) as typeof fetch);assert.equal(route.estimatedMinutes,16);await assert.rejects(searchUK('Manchester',(async()=>new Response('',{status:429})) as typeof fetch),/provider unavailable/);}finally{delete process.env.GEOAPIFY_API_KEY;}});
it('hides the driver location once the journey is completed',async()=>{
 // Privacy property: tracking exists only for the duration of an active job.
 // The shared job is cancelled by an earlier test, so this uses its own booking.
 const created=await passenger.create(localJourney());const trip=created.body._id;
 let r=await dispatch.act(trip,{action:'confirm',version:0});
 r=await dispatch.act(trip,{action:'offer',version:r.body.version,driverId:'drv-ashton'});
 r=await driver.act(trip,{action:'accept',version:r.body.version});
 const before=await read(driver,trip);
 const posted=await driver.agent.post(`/api/bookings/${trip}/location`).set(driver.raw().headers)
   .send({key:randomUUID(),version:before.body.version,bookingVersion:before.body.bookingVersion,point:point()});
 assert.equal(posted.status,200);
 assert.ok((await read(passenger,trip)).body.position,'visible while the job is active');

 for(const action of ['on_the_way','arrived','start'] as const){
   const current=await Booking.findById(trip);
   r=await driver.act(trip,{action,version:current!.version});
   assert.equal(r.status,200,`${action} should succeed`);
   assert.ok((await read(passenger,trip)).body.position,`still visible at ${action}`);
 }
 const running=await Booking.findById(trip);
 assert.equal((await driver.act(trip,{action:'complete',version:running!.version})).status,200);
 assert.equal((await read(passenger,trip)).body.position,null,'hidden once the trip is completed');
 assert.equal((await read(dispatch,trip)).body.position,null,'hidden from dispatch too');
});

it('gives every city real, distinct places for the same five slots',()=>{
 for(const c of cities){
  assert.equal(c.places.length,5,`${c.id} must fill all five slots`);
  assert.deepEqual(c.places.map(p=>p.id).sort(),['airport','business','hospital','hotel','station']);
  for(const p of c.places){
   assert.ok(!/^Demo /.test(p.label),`${c.id}/${p.id} still uses a placeholder label`);
   assert.ok(inCity(p,c.id),`${c.id}/${p.id} sits outside its own ${c.radiusKm}km service area`);
  }
 }
 // Real cities, so the same slot must differ between them.
 assert.notEqual(placesFor('manchester').find(p=>p.id==='station')!.label,
                 placesFor('london').find(p=>p.id==='station')!.label);
});

it('keeps city service areas separate',async()=>{
 const manchesterStation=placesFor('manchester').find(p=>p.id==='station')!;
 assert.equal(inCity(manchesterStation,'manchester'),true);
 assert.equal(inCity(manchesterStation,'london'),false,'Manchester is not inside the London area');
 assert.equal(inAnyCity({lat:24.86,lng:67.01}),false,'Karachi is in no supported city');
});

it('books a London journey against London coordinates',async()=>{
 const r=await passenger.create(localJourney({city:'london',pickup:'station',destination:'airport',
   flightNumber:'BA123',flightDate:'2026-09-20',meetingPoint:'T5 arrivals'}));
 assert.equal(r.status,201);
 assert.match(r.body.fromLabel,/King's Cross/);
 assert.match(r.body.toLabel,/Heathrow/);
});

it('refuses a pin from the wrong city',async()=>{
 // A valid Manchester point is still invalid for a London booking.
 const manchesterPin={...placesFor('manchester').find(p=>p.id==='station')!,source:'manual' as const};
 const r=await passenger.create(localJourney({city:'london',pickupPoint:manchesterPin}));
 assert.equal(r.status,400);
 assert.match(r.body.error,/London/,'the error should name the booking’s own city');
});

it('rejects driver GPS from a different city than the booking',async()=>{
 // Needs its own booking: the shared one is cancelled by an earlier test.
 const created=await passenger.create(localJourney());const trip=created.body._id;
 let r=await dispatch.act(trip,{action:'confirm',version:0});
 r=await dispatch.act(trip,{action:'offer',version:r.body.version,driverId:'drv-ashton'});
 r=await driver.act(trip,{action:'accept',version:r.body.version});
 assert.equal(r.status,200);
 const state=await read(driver,trip);
 const london=placesFor('london').find(p=>p.id==='station')!;
 const post=await driver.agent.post(`/api/bookings/${trip}/location`).set(driver.raw().headers).send({
  key:randomUUID(),version:state.body.version,bookingVersion:state.body.bookingVersion,
  point:{lat:london.lat,lng:london.lng,accuracy:10,source:'uk-test',capturedAt:new Date().toISOString()},
 });
 assert.equal(post.status,400,'a London point is not valid for a Manchester booking');
 assert.match(post.body.error,/Manchester/,'the error names the booking’s own city');
});

it('does not price a custom-pin journey as an airport transfer',async()=>{
 // QA TC-69: the form defaults destination to the 'airport' slot. Overriding it
 // with a city-centre pin left the slot behind, so the journey kept the fixed
 // £45 airport fare and still demanded flight details.
 const cityCentre={lat:53.4794,lng:-2.2453,label:'Deansgate, Manchester',source:'manual' as const};
 const r=await passenger.create(localJourney({
   pickup:'station',destination:'airport',destinationPoint:cityCentre,
   flightNumber:'',flightDate:'',meetingPoint:'',
 }));
 assert.equal(r.status,201,'no flight details required for a non-airport pin');
 assert.equal(r.body.fare.type,'estimate','priced as a local journey, not a fixed transfer');
 assert.equal(r.body.fare.amount,1600,'£16 local fare, not the £45 airport fare');
});

it('still prices a genuine airport pin as an airport transfer',async()=>{
 const airport=placesFor('manchester').find(p=>p.id==='airport')!;
 const r=await passenger.create(localJourney({
   pickup:'station',destination:'airport',
   destinationPoint:{lat:airport.lat,lng:airport.lng,label:airport.label,source:'manual' as const},
   flightNumber:'BA123',flightDate:'2026-09-20',meetingPoint:'T2 arrivals',
 }));
 assert.equal(r.status,201);
 assert.equal(r.body.fare.type,'fixed');
 assert.equal(r.body.fare.amount,4500,'a pin at the airport is still an airport transfer');
});

it('requires flight details when a pin is at the airport',async()=>{
 const airport=placesFor('manchester').find(p=>p.id==='airport')!;
 const r=await passenger.create(localJourney({
   pickup:'station',destination:'hotel',
   destinationPoint:{lat:airport.lat,lng:airport.lng,label:airport.label,source:'manual' as const},
   flightNumber:'',flightDate:'',meetingPoint:'',
 }));
 assert.equal(r.status,400,'an airport pin needs flight details even on a non-airport slot');
 assert.match(r.body.error,/flight/i);
});
