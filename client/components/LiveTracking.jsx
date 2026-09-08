import {useEffect,useRef,useState} from 'react';
import {useSession} from '../lib/session.jsx';
import {Button,ErrorNote} from './ui.jsx';
import GeoMap from './GeoMap.jsx';

export default function LiveTracking({booking}){
 const {api,user}=useSession();const [data,setData]=useState(null),[error,setError]=useState(''),[sharing,setSharing]=useState(false);const watch=useRef(null),busy=useRef(false),last=useRef(0),step=useRef(0);
 const allowed=['confirmed','in_progress'].includes(booking.status)&&['accepted','on_the_way','arrived'].includes(booking.progress);
 const clearWatch=()=>{if(watch.current!==null){navigator.geolocation?.clearWatch(watch.current);watch.current=null;}setSharing(false);};
 useEffect(()=>{let live=true;setData(null);setError('');const poll=async()=>{try{const r=await api.location(booking._id);if(live){setData(r);setError('');}}catch(e){if(live){setError(e.message);setData(null);clearWatch();}}};poll();const timer=setInterval(poll,5000);return()=>{live=false;clearInterval(timer);clearWatch();};},[api,booking._id,booking.version]);
 useEffect(()=>{const pause=()=>{if(document.hidden)clearWatch();};document.addEventListener('visibilitychange',pause);return()=>document.removeEventListener('visibilitychange',pause);},[]);
 async function send(point,stop=false){if(busy.current)return;busy.current=true;try{const latest=await api.location(booking._id);await api.sendLocation(booking._id,{key:crypto.randomUUID(),version:latest.version,bookingVersion:latest.bookingVersion,point,stop});setData(await api.location(booking._id));setError('');}catch(e){setError(e.message);clearWatch();}finally{busy.current=false;}}
 function start(){if(!navigator.geolocation){setError('Device location unavailable');return;}setError('');setSharing(true);watch.current=navigator.geolocation.watchPosition(p=>{if(Date.now()-last.current<10000)return;last.current=Date.now();send({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,capturedAt:new Date(p.timestamp).toISOString(),source:'device'});},e=>{setError(e.code===1?'Location permission denied.':'GPS unavailable.');clearWatch();},{enableHighAccuracy:true,maximumAge:10000,timeout:15000});}
 function testStep(){const a=booking.fromPoint,b=booking.toPoint;if(!a||!b)return;const t=(step.current++%11)/10;send({lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t,accuracy:0,capturedAt:new Date().toISOString(),source:'uk-test'});}
 return <section className="space-y-3 rounded-lg border border-ink-200 p-3" aria-label="Driver GPS tracking"><h3 className="font-semibold">Driver location</h3>
 <p className="text-xs text-ink-600">{allowed?'Updated every 5 seconds. Device locations require consent; coordinates are device-reported, not verified.':'Sharing is available only for an accepted, active job. No location is shown after the trip ends.'}</p>
 {allowed&&user.role==='driver'&&<><p className="text-xs text-ink-600">Start shares this device position with dispatch and this booking’s passenger while this page is visible. From Pakistan, use UK test movement instead. Hiding the page pauses capture; old points become stale.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={sharing} onClick={start}>Share device GPS</Button><Button type="button" variant="secondary" onClick={()=>{clearWatch();send(undefined,true);}}>Stop and hide location</Button><Button type="button" variant="secondary" disabled={sharing} onClick={testStep}>Advance UK test position</Button></div></>}
 <ErrorNote>{error}</ErrorNote>
 {allowed&&data?.position?<><p className="text-sm font-semibold">{data.position.source==='uk-test'?'SIMULATED UK test movement':'Device-reported location'} · {data.stale?'STALE — not current':'recent sample'}</p><p className="text-xs text-ink-600">{new Date(data.position.capturedAt).toLocaleString('en-GB',{timeZone:'Europe/London'})} UK · accuracy ±{Math.round(data.position.accuracy)}m</p><GeoMap point={data.position} otherPoint={booking.fromPoint}/><p className="text-xs">{data.position.lat.toFixed(5)}, {data.position.lng.toFixed(5)} · no road navigation or live ETA</p></>:<p className="text-sm text-ink-600">No shared driver location.</p>}
 </section>;
}
