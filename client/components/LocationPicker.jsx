import {useState} from 'react';
import {useSession} from '../lib/session.jsx';
import {Button,inputClass,ErrorNote} from './ui.jsx';
import GeoMap from './GeoMap.jsx';
const R=6371,rad=d=>d*Math.PI/180;
const distanceKm=(a,b)=>{const dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));};
export default function LocationPicker({title,value,onChange,city}){
 // Test pins and the service-area check follow the selected city, so this works
 // for every supported city rather than only Manchester.
 const tests=(city?.places??[]).slice(0,2).map(p=>({label:`${city.name} test · ${p.label}`,lat:p.lat,lng:p.lng,source:'uk-test'}));
 const inside=p=>!!city&&distanceKm(p,city)<=city.radiusKm;
 const {api}=useSession();const [query,setQuery]=useState(''),[results,setResults]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[draft,setDraft]=useState(value??tests[0]??{lat:city?.lat??53.4808,lng:city?.lng??-2.2426,label:'Manual pin',source:'manual'});
 const choose=p=>{setDraft(p);setError(inside(p)?'':`Outside the ${city?.name??'demo'} service area (${city?.radiusKm??25} km). Your real location has not been changed.`);};
 async function search(){setBusy(true);setError('');setResults([]);try{setResults((await api.searchUK(query,city?.id)).results);}catch(e){setError(e.message);}finally{setBusy(false);}}
 function locate(){setError('');if(!navigator.geolocation){setError('Device location is unavailable');return;}navigator.geolocation.getCurrentPosition(p=>choose({lat:p.coords.latitude,lng:p.coords.longitude,label:'Device-selected pickup pin',source:'device'}),e=>setError(e.code===1?'Location permission denied. Use a manual or UK test point.':'Could not get a location. Try a manual pin.'),{timeout:10000,maximumAge:0,enableHighAccuracy:true});}
 return <details className="rounded-lg border border-ink-200 p-3"><summary className="cursor-pointer font-semibold">{title} · {value?value.label:'optional — set an exact address'}</summary>
 <div className="mt-3 space-y-3"><p className="rounded bg-ink-50 p-2 text-xs text-ink-700"><strong>Optional.</strong> You have already chosen a {title.toLowerCase()} from the sample places above. Use this only to pick a different, exact address — by searching, dropping a pin on the map, or entering coordinates. Journeys using a custom pin need a road estimate before dispatch can confirm them.</p><p className="text-xs text-ink-600">Demo service area: <strong>{city?.name??'—'}</strong> within {city?.radiusKm??25} km, not company-approved. Search is biased to this city; results outside the radius are marked and cannot be booked. Device location stays local until you apply the pin and submit a booking.</p>
 <label className="block text-sm">Address or postcode in {city?.name??'the UK'}<input className={inputClass} value={query} onChange={e=>setQuery(e.target.value)} maxLength={160} placeholder={city?`e.g. ${city.places[0].label}`:'e.g. street name or postcode'}/></label>
 <p className="text-xs text-ink-500">Search matches <strong>addresses and postcodes</strong>, not categories — “{city?.places[0].label.split(',')[0]??'a named place'}” or “{city?.samplePostcode??'a postcode'}” work, a bare word like “station” may not. For a category use the sample places above.</p>
 <Button type="button" onClick={search} disabled={busy||query.trim().length<3}>Search {city?.name??'UK'} addresses</Button>
 {busy?null:results.length===0&&query.trim().length>=3?<p className="rounded border border-dashed border-ink-200 p-2 text-xs text-ink-600">No {city?.name??'UK'} address matched that. Try a street name, a building name or a postcode — the provider searches addresses, not place categories.</p>:null}
 {results.map((r,i)=><button type="button" key={i} onClick={()=>choose(r)} className="block w-full rounded border border-ink-200 p-2 text-left text-sm">{r.label}{r.inServiceArea?'':' · outside demo area'}</button>)}
 <p className="text-xs text-ink-600">Address search powered by Geoapify / OpenStreetMap when configured.</p>
 <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={locate}>Use my location</Button>{tests.map(p=><Button type="button" variant="secondary" key={p.label} onClick={()=>choose(p)}>{p.label}</Button>)}</div>
 <GeoMap point={draft} onPick={choose}/>
 <div className="grid grid-cols-2 gap-2"><label className="text-sm">Latitude<input className={inputClass} type="number" step="any" value={draft.lat} onChange={e=>choose({...draft,lat:Number(e.target.value),source:'manual'})}/></label><label className="text-sm">Longitude<input className={inputClass} type="number" step="any" value={draft.lng} onChange={e=>choose({...draft,lng:Number(e.target.value),source:'manual'})}/></label></div>
 <label className="block text-sm">Pin description<input className={inputClass} value={draft.label} maxLength={200} onChange={e=>setDraft({...draft,label:e.target.value})}/></label>
 <p className="text-xs text-ink-600">Source: {draft.source}. Test pins are simulated. Select the Airport journey option above when airport flight details are needed.</p>
 <ErrorNote>{error}</ErrorNote><div className="flex gap-2"><Button type="button" disabled={!inside(draft)||draft.label.trim().length<2} onClick={()=>onChange(draft)}>Apply {title.toLowerCase()} pin</Button>{value&&<Button type="button" variant="secondary" onClick={()=>onChange(undefined)}>Use sample address again</Button>}</div>
 {value&&<p className="text-sm font-semibold">Applied: {value.label}. Saved on booking submission; fare remains a demo assumption.</p>}
 </div></details>;
}
