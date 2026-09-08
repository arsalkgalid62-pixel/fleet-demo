import mongoose from 'mongoose';
import {randomUUID,createHash} from 'node:crypto';
import {DateTime} from 'luxon';
import {bookingInput,actionInput,addresses,isSyntheticContact,type Role,type BookingInput} from '../shared/domain.js';
import {Booking,Driver,Vehicle,Event,Operation,Payment,Notification} from './db.js';
import { LivePosition } from './db.js';
import { inServiceArea, positionInput } from '../shared/location.js';
import { findCity, isAirportJourney } from '../shared/cities.js';
import { validatePlaces, roadEstimate } from './geo.js';
export class Fault extends Error{constructor(public status:number,message:string){super(message);}}
export type Actor={id:string;role:Role;driverId?:string};
export function pickupTime(input:BookingInput,now=new Date()){
 if(input.timing==='now')return now;
 if(!input.pickupLocal||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.pickupLocal))throw new Fault(400,'Specify an exact UK date and time');
 const time=DateTime.fromISO(input.pickupLocal,{zone:'Europe/London'});
 if(!time.isValid||time.toFormat("yyyy-MM-dd'T'HH:mm")!==input.pickupLocal||time.getPossibleOffsets().length!==1)throw new Fault(400,'This UK clock time is missing or ambiguous due to daylight saving. Choose another time.');
 if(time.toMillis()<now.getTime()-60000||time.toMillis()>now.getTime()+90*86400000)throw new Fault(400,'Schedule within the next 90 days');return time.toJSDate();
}
export function quote(input:BookingInput){const airport=isAirportJourney(input);return {type:airport?'fixed':'estimate',amount:(airport?4500:1600)+(input.passengers>4?1000:0),currency:'GBP',pricingVersion:'demo-v1',extras:input.passengers>4?1000:0,estimatedMinutes:airport?60:30,label:'Demo assumptions—not company-approved'};}
export function canRead(actor:Actor,b:any){return actor.role==='dispatch'||(actor.role==='passenger'&&b.owner===actor.id)||(actor.role==='driver'&&b.driverId===actor.driverId);}
export function present(actor:Actor,b:any){const value=b.toObject?b.toObject():{...b};if(actor.role==='passenger'&&['completed','cancelled','no_show'].includes(b.status))delete value.simulation;return value;}
async function transaction<T>(fn:(session:mongoose.ClientSession)=>Promise<T>):Promise<T>{
 for(let attempt=0;attempt<4;attempt++){const session=await mongoose.startSession();try{let result!:T;await session.withTransaction(async()=>{result=await fn(session);},{maxCommitTimeMS:5000});return result;}catch(e:any){if(attempt<3&&(e.code===11000||e.hasErrorLabel?.('TransientTransactionError')))continue;throw e;}finally{await session.endSession();}}throw new Fault(409,'Concurrent change: refresh and retry');
}
async function audit(session:mongoose.ClientSession,actor:Actor,b:any,type:string,details:unknown={}){const id=randomUUID();await Event.create([{_id:id,bookingId:b._id,actor:actor.id,type,details}],{session});if(['confirm','offer','cancel'].includes(type))await Notification.create([{_id:id,eventId:id,bookingId:b._id,channel:'sms/email',state:'preview_only',text:`Demo preview: ${b.reference} · ${type}. No message sent.`}],{session});}
export async function createBooking(actor:Actor,raw:unknown,key:string){
 if(actor.role==='driver')throw new Fault(403,'Drivers cannot create bookings');if(!/^[0-9a-f-]{36}$/i.test(key))throw new Fault(400,'A UUID idempotency key is required');
 const input=bookingInput.parse(raw);validatePlaces(input);
 if(process.env.ALLOW_REAL_CONTACTS!=='true'&&!isSyntheticContact(input.contact))throw new Fault(400,'Contact: use a synthetic @example.invalid address. Set ALLOW_REAL_CONTACTS=true to allow real addresses in this demo.');const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 return transaction(async session=>{const old=await Operation.findById(`${actor.id}:${key}`).session(session);if(old){if(old.fingerprint!==fingerprint)throw new Fault(409,'Idempotency key already used for another request');return Booking.findById(old.bookingId).session(session);}
 const pickupAt=pickupTime(input),fare=quote(input);if(isAirportJourney(input)&&(!/^\d{4}-\d{2}-\d{2}$/.test(input.flightDate)||!input.flightNumber||!input.meetingPoint))throw new Fault(400,'Airport trips need a flight date, flight number and meeting point');
 const id=randomUUID();const [b]=await Booking.create([{_id:id,reference:`FD-${id.slice(0,8).toUpperCase()}`,owner:actor.id,input,pickupAt,reservedStart:new Date(+pickupAt-15*60000),endAt:new Date(+pickupAt+(fare.estimatedMinutes+15)*60000),fare}],{session});await Operation.create([{_id:`${actor.id}:${key}`,actor:actor.id,fingerprint,bookingId:id}],{session});await audit(session,actor,b,'requested');return b;});
}
async function lockVehicle(id:string,session:mongoose.ClientSession){const v=await Vehicle.findOneAndUpdate({_id:id},{$inc:{scheduleVersion:1}},{session,new:true});if(!v)throw new Fault(409,'Vehicle unavailable');return v;}
async function available(v:any,b:any,session:mongoose.ClientSession){if(v.seats<b.input.passengers||v.luggage<b.input.luggage||(b.input.accessible&&!v.accessible))return false;return !await Booking.exists({_id:{$ne:b._id},vehicleId:v._id,status:{$in:['confirmed','in_progress']},reservedStart:{$lt:b.endAt},endAt:{$gt:b.reservedStart}}).session(session);}
export async function act(actor:Actor,id:string,raw:unknown){const x=actionInput.parse(raw);let route:Awaited<ReturnType<typeof roadEstimate>>|undefined; if(x.action==='confirm' && actor.role==='dispatch'){const candidate=await Booking.findById(id);if(candidate && candidate.version===x.version && candidate.status==='requested' && (candidate.input.pickupPoint||candidate.input.destinationPoint))route=await roadEstimate(candidate.input);}const fingerprint=createHash('sha256').update(JSON.stringify({id,...x})).digest('hex');return transaction(async session=>{
 const prior=await Operation.findById(`${actor.id}:${x.key}`).session(session);if(prior){if(prior.fingerprint!==fingerprint)throw new Fault(409,'Idempotency key reused');const replay=await Booking.findById(id).session(session);if(!replay||!canRead(actor,replay))throw new Fault(404,'Booking unavailable');return replay;}
 const b=await Booking.findById(id).session(session);if(!b||!canRead(actor,b))throw new Fault(404,'Booking unavailable');if(b.version!==x.version)throw new Fault(409,'This booking changed. Refresh before trying again.');
 const staff=['confirm','offer','withdraw','no_show','payment','fare_override','delay','dismiss_delay','simulation'];const driver=['accept','decline','on_the_way','arrived','start','complete'];
 if(staff.includes(x.action)&&actor.role!=='dispatch'||driver.includes(x.action)&&actor.role!=='driver')throw new Fault(403,'Action not permitted');
 const requireState=(ok:boolean,message='Invalid journey transition')=>{if(!ok)throw new Fault(409,message);};
 const active=['requested','confirmed'].includes(b.status!);
 if(x.action==='confirm'){requireState(b.status==='requested');if(b.input.pickupPoint||b.input.destinationPoint){requireState(!!route,'A road travel estimate is required before reserving this custom journey');b.fare={...b.fare,estimatedMinutes:Math.max(30,route!.estimatedMinutes),route};b.endAt=new Date(+b.pickupAt!+(Math.max(30,route!.estimatedMinutes)+15)*60000);}const vehicles=await Vehicle.find().sort({_id:1}).session(session);let chosen=null;for(const candidate of vehicles){const v=await lockVehicle(candidate._id!,session);if(await available(v,b,session)){chosen=v;break;}}requireState(!!chosen,'No suitable capacity for the full buffered interval; request remains awaiting review');b.vehicleId=chosen!._id;b.status='confirmed';}
 if(x.action==='offer'){requireState(b.status==='confirmed'&&b.progress==='unassigned');const d=await Driver.findOneAndUpdate({_id:x.driverId,duty:'available'},{$inc:{version:1}},{session,new:true});requireState(!!d&&d.vehicleId===b.vehicleId,'Driver must be on duty in the reserved vehicle');const v=await lockVehicle(b.vehicleId!,session);requireState(await available(v,b,session),'Vehicle schedule conflict');b.driverId=d!._id;b.progress='offered';b.offerExpires=new Date(Date.now()+60000);}
 if(x.action==='withdraw'){requireState(b.status==='confirmed'&&b.progress!=='unassigned');b.driverId=undefined;b.progress='unassigned';b.offerExpires=undefined;}
 if(x.action==='accept'){requireState(b.status==='confirmed'&&b.progress==='offered'&&!!b.offerExpires&&+b.offerExpires>Date.now(),'Offer has expired or changed');const d=await Driver.findOneAndUpdate({_id:actor.driverId,duty:'available'},{$inc:{version:1}},{session,new:true});requireState(!!d&&d.vehicleId===b.vehicleId,'Driver or vehicle unavailable');const v=await lockVehicle(b.vehicleId!,session);requireState(await available(v,b,session),'Schedule conflict');b.progress='accepted';b.offerExpires=undefined;}
 if(x.action==='decline'){requireState(b.progress==='offered'&&b.status==='confirmed');b.driverId=undefined;b.progress='unassigned';b.offerExpires=undefined;}
 if(x.action==='on_the_way'){requireState(b.status==='confirmed'&&b.progress==='accepted');b.progress='on_the_way';}
 if(x.action==='arrived'){requireState(b.status==='confirmed'&&b.progress==='on_the_way');b.progress='arrived';}
 if(x.action==='start'){requireState(b.status==='confirmed'&&b.progress==='arrived');b.status='in_progress';b.simulation={running:true,elapsed:0,since:new Date().toISOString()};}
 if(x.action==='complete'){requireState(b.status==='in_progress');b.status='completed';b.simulation={running:false,elapsed:120,since:null};}
 if(x.action==='cancel'||x.action==='no_show'){requireState(active);requireState(!!x.reason?.trim(),'A reason is required');if(x.action==='no_show')requireState(b.progress==='arrived');if(b.vehicleId)await lockVehicle(b.vehicleId,session);b.status=x.action==='cancel'?'cancelled':'no_show';b.progress='unassigned';b.driverId=undefined;b.offerExpires=undefined;b.simulation={running:false,elapsed:0,since:null};}
 if(x.action==='payment'){requireState(b.status==='completed','Complete the trip before recording a payment preview');requireState(!!x.outcome);requireState(b.paymentStatus!=='paid','A successful simulated payment is already recorded');b.paymentStatus=x.outcome!;await Payment.create([{_id:`${actor.id}:${x.key}`,bookingId:id,outcome:x.outcome,amount:b.fare.finalAmount??b.fare.amount,simulated:true}],{session});}
 if(x.action==='fare_override'){requireState(!['cancelled','no_show'].includes(b.status!)&&b.paymentStatus!=='paid');requireState(x.amount!==undefined&&!!x.reason?.trim(),'Fare amount and reason required');b.fare={...b.fare,finalAmount:x.amount,overrideReason:x.reason};}
 if(x.action==='delay'){requireState(active&&(b.input.pickup==='airport'||b.input.destination==='airport'));b.delay={minutes:30,proposedPickupAt:new Date(+b.pickupAt!+30*60000),state:'review_required',label:'Simulated flight delay; schedule unchanged'};}
 if(x.action==='dismiss_delay'){requireState(!!b.delay);b.delay=null;}
 if(x.action==='simulation'){requireState(['confirmed','in_progress'].includes(b.status!));requireState(!!x.control);const sim=b.simulation;const elapsed=Math.min(120,sim.elapsed+(sim.running?(Date.now()-Date.parse(sim.since))/1000:0));b.simulation={running:x.control==='resume',elapsed:x.control==='reset'?0:elapsed,since:x.control==='resume'?new Date().toISOString():null};}
 b.version!++;await b.save({session});await audit(session,actor,b,x.action,{reason:x.reason,outcome:x.outcome,driverId:x.driverId});await Operation.create([{_id:`${actor.id}:${x.key}`,actor:actor.id,fingerprint,bookingId:id}],{session});return b;
 });}
export async function expireOffers(){const offers=await Booking.find({progress:'offered',offerExpires:{$lte:new Date()}});for(const offer of offers)await transaction(async session=>{const b=await Booking.findOneAndUpdate({_id:offer._id,version:offer.version,progress:'offered'},{$set:{progress:'unassigned'},$unset:{driverId:1,offerExpires:1},$inc:{version:1}},{session,new:true});if(b)await audit(session,{id:'system',role:'dispatch'},b,'offer_expired',{alert:'Offer expired; reassignment required'});});}
export async function setDuty(actor:Actor,duty:string){if(actor.role!=='driver')throw new Fault(403,'Driver only');if(!['available','break','off_duty'].includes(duty))throw new Fault(400,'Invalid duty');return transaction(async session=>{const d=await Driver.findOneAndUpdate({_id:actor.driverId},{$inc:{version:1}},{session,new:true});if(!d)throw new Fault(404,'Driver unavailable');if(await Booking.exists({driverId:actor.driverId,status:{$in:['confirmed','in_progress']},progress:{$ne:'unassigned'}}).session(session))throw new Fault(409,'Finish or release assigned jobs before changing duty');if(duty==='available'&&!d.vehicleId)throw new Fault(409,'No allocated vehicle');d.duty=duty as 'available'|'break'|'off_duty';await d.save({session});await Event.create([{_id:randomUUID(),actor:actor.id,type:'duty',details:{duty}}],{session});return d;});}
export {addresses};

/** Driver-reported telemetry. A booking write lock serialises revocation with GPS updates. */
export async function writePosition(actor:Actor,id:string,raw:unknown){
 const x=positionInput.parse(raw);const fingerprint=createHash('sha256').update(JSON.stringify({id,...x})).digest('hex');
 return transaction(async session=>{
  const b=await Booking.findById(id).session(session);if(!b||!canRead(actor,b))throw new Fault(404,'Booking unavailable');
  if(actor.role!=='driver')throw new Fault(403,'Driver location updates only');
  if(!['confirmed','in_progress'].includes(b.status!)||!['accepted','on_the_way','arrived'].includes(b.progress!))throw new Fault(409,'Location sharing requires an accepted active job');
  const old=await Operation.findById(`${actor.id}:${x.key}`).session(session);if(old){if(old.fingerprint!==fingerprint)throw new Fault(409,'Idempotency key reused');return LivePosition.findById(id).session(session);}
  if(b.version!==x.bookingVersion)throw new Fault(409,'Booking changed. Refresh before sharing location');
  const previous=await LivePosition.findById(id).session(session);if((previous?.version??0)!==x.version)throw new Fault(409,'Location changed. Refresh before sending another update');
  if(!x.stop){const point=x.point!;const city=findCity(b.input.city);if(!inServiceArea(point,city.id))throw new Fault(400,`Outside the ${city.name} demo service area. Use labelled UK test mode if you are not in the UK.`);if(point.source==='uk-test'&&process.env.DEMO_MODE!=='true')throw new Fault(403,'UK test positions require demo mode');const age=Date.now()-Date.parse(point.capturedAt);if(age>60000||age< -10000)throw new Fault(400,'Location timestamp is stale or in the future');}
  await Booking.updateOne({_id:id,version:b.version},{$inc:{locationSerial:1}},{session});
  const result=await LivePosition.findOneAndUpdate({_id:id},{$set:{driverId:actor.driverId,version:x.version+1,bookingVersion:b.version,active:!x.stop,point:x.stop?null:x.point,expiresAt:new Date(Date.now()+15*60000)}},{session,upsert:true,new:true});
  await Operation.create([{_id:`${actor.id}:${x.key}`,actor:actor.id,fingerprint,bookingId:id}],{session});
  await audit(session,actor,b,x.stop?'location_stopped':'location_updated',{source:x.point?.source});return result;
 });
}
export async function readPosition(actor:Actor,id:string){const b=await Booking.findById(id);if(!b||!canRead(actor,b))throw new Fault(404,'Booking unavailable');const row=await LivePosition.findById(id).lean();const visible=['confirmed','in_progress'].includes(b.status!)&&['accepted','on_the_way','arrived'].includes(b.progress!)&&row?.driverId===b.driverId&&row?.active&&row.expiresAt!>new Date();return {version:row?.version??0,bookingVersion:b.version,position:visible?row.point:null,stale:visible?Date.now()-Date.parse(row.point.capturedAt)>30000:true,notice:'Device-reported coordinates are not verified GPS. UK test movement is simulated.'};}
