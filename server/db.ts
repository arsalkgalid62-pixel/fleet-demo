import mongoose,{Schema} from 'mongoose';
mongoose.set('bufferCommands',false);
const options={timestamps:true,versionKey:false} as const;
export const User=mongoose.model('User',new Schema({_id:String,name:String,role:{type:String,enum:['passenger','dispatch','driver']},passwordHash:{type:String,required:true},driverId:String},options));
export const Driver=mongoose.model('Driver',new Schema({_id:String,name:String,vehicleId:String,duty:{type:String,enum:['available','break','off_duty']},version:{type:Number,default:0}},options));
Driver.schema.index({vehicleId:1},{unique:true,partialFilterExpression:{vehicleId:{$type:'string'}}});
export const Vehicle=mongoose.model('Vehicle',new Schema({_id:String,label:String,plate:String,seats:Number,luggage:Number,accessible:Boolean,scheduleVersion:{type:Number,default:0}},options));
const bookingSchema=new Schema({
 _id:String,reference:{type:String,unique:true},owner:{type:String,required:true},input:{type:Schema.Types.Mixed,required:true},
 pickupAt:{type:Date,required:true},endAt:{type:Date,required:true},reservedStart:{type:Date,required:true},
 status:{type:String,enum:['requested','confirmed','in_progress','completed','cancelled','no_show'],default:'requested'},
 progress:{type:String,enum:['unassigned','offered','accepted','on_the_way','arrived'],default:'unassigned'},
 vehicleId:String,driverId:String,offerExpires:Date,version:{type:Number,default:0},locationSerial:{type:Number,default:0},
 fare:{type:Schema.Types.Mixed,required:true},paymentStatus:{type:String,enum:['outstanding','paid','pending','failed'],default:'outstanding'},
 delay:{type:Schema.Types.Mixed,default:null},simulation:{type:Schema.Types.Mixed,default:{running:false,elapsed:0,since:null}},
},{...options,strict:true});
bookingSchema.index({vehicleId:1,status:1,reservedStart:1,endAt:1});
bookingSchema.index({progress:1,offerExpires:1});
bookingSchema.index({owner:1,createdAt:-1});bookingSchema.index({driverId:1,status:1});
export const Booking=mongoose.model('Booking',bookingSchema);
export const Event=mongoose.model('Event',new Schema({_id:String,bookingId:{type:String,index:true},actor:String,type:String,details:Schema.Types.Mixed},options));
export const Operation=mongoose.model('Operation',new Schema({_id:String,actor:String,fingerprint:String,bookingId:String},options));
export const Payment=mongoose.model('Payment',new Schema({_id:String,bookingId:String,outcome:String,amount:Number,simulated:{type:Boolean,default:true}},options));
export const Notification=mongoose.model('Notification',new Schema({_id:String,eventId:String,bookingId:String,channel:String,state:{type:String,default:'preview_only'},text:String},options));
export const FlightLookupCache=mongoose.model('FlightLookupCache',new Schema({_id:String,result:Schema.Types.Mixed,fetchedAt:Date,expiresAt:Date},options));
// Mongo reaps entries once expiresAt passes, so the cache cannot grow without bound.
FlightLookupCache.schema.index({expiresAt:1},{expireAfterSeconds:0});
export const Setup=mongoose.model('Setup',new Schema({_id:String,version:Number},options));
export const LivePosition=mongoose.model('LivePosition',new Schema({_id:String,driverId:String,version:{type:Number,default:0},bookingVersion:Number,point:Schema.Types.Mixed,active:Boolean,expiresAt:Date},options));
LivePosition.schema.index({expiresAt:1},{expireAfterSeconds:0});
export async function connectDb(uri:string){await mongoose.connect(uri,{serverSelectionTimeoutMS:5000});const hello=await mongoose.connection.db!.admin().command({hello:1});if(!hello.setName){await mongoose.disconnect();throw new Error('MongoDB replica set required');}}
export async function setupIndexes(){for(const model of [User,Driver,Vehicle,Booking,Event,Operation,Payment,Notification,FlightLookupCache,LivePosition,Setup])await model.createIndexes();await Setup.updateOne({_id:'schema'},{$set:{version:2}},{upsert:true});}
