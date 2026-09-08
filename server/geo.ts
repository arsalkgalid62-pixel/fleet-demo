import { z } from 'zod';
import { inServiceArea, place } from '../shared/location.js';
import { findCity, placesFor } from '../shared/cities.js';
import { Fault } from './service.js';
export function endpoint(input:any,side:'pickup'|'destination'){return input[`${side}Point`]??placesFor(input.city).find(a=>a.id===input[side])!;}
export function validatePlaces(input:any){const city=findCity(input.city);for(const side of ['pickup','destination'] as const){if(!inServiceArea(endpoint(input,side),city.id))throw new Fault(400,`That ${side} is outside the ${city.name} demo service area (${city.radiusKm} km). Choose another city or a nearer point. Your actual GPS location is not changed.`);}const a=endpoint(input,'pickup'),b=endpoint(input,'destination');if(Math.abs(a.lat-b.lat)+Math.abs(a.lng-b.lng)<0.00001)throw new Fault(400,'Pickup and destination must differ');}
async function provider(path:string,params:Record<string,string>,fetcher:typeof fetch){
 if(!process.env.GEOAPIFY_API_KEY)throw new Fault(503,'UK address search/routing is not configured. Manual pins and UK test locations remain available.');
 const url=new URL(`https://api.geoapify.com/v1/${path}`);Object.entries({...params,apiKey:process.env.GEOAPIFY_API_KEY}).forEach(([k,v])=>url.searchParams.set(k,v));
 try{const r=await fetcher(url,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error();return await r.json();}catch{throw new Fault(503,'Location provider unavailable. Try again later.');}
}
export async function searchUK(raw:unknown,fetcher:typeof fetch=fetch,cityId?:string){
 const query=z.string().trim().min(3).max(160).parse(raw);const city=findCity(cityId);
 // Bias to the selected city so "station" returns that city's station, and
 // filter to its service radius so unbookable results are not offered first.
 const body=await provider('geocode/search',{text:query,filter:`circle:${city.lng},${city.lat},${Math.round(city.radiusKm*1000)}`,bias:`proximity:${city.lng},${city.lat}`,limit:'5',format:'json'},fetcher);
 return {provider:'Geoapify',attribution:'Powered by Geoapify · © OpenStreetMap contributors',city:city.name,
  results:(body.results??[]).filter((r:any)=>r.country_code==='gb').map((r:any)=>place.parse({lat:r.lat,lng:r.lon,label:r.formatted,source:'search'})).map((r:any)=>({...r,inServiceArea:inServiceArea(r,city.id)}))};}
/**
 * Type-ahead suggestions.
 *
 * Uses Geoapify's autocomplete endpoint rather than plain geocoding: it is
 * built for partial input, so typing "kin" can suggest King's Cross. Results
 * are still confined to the selected city's circle, and the city's own sample
 * places are matched locally by the caller so the field works with no key at
 * all.
 */
export async function autocompleteUK(raw:unknown,fetcher:typeof fetch=fetch,cityId?:string){
 const query=z.string().trim().min(1).max(160).parse(raw);const city=findCity(cityId);
 const body=await provider('geocode/autocomplete',{text:query,filter:`circle:${city.lng},${city.lat},${Math.round(city.radiusKm*1000)}`,bias:`proximity:${city.lng},${city.lat}`,limit:'6',format:'json'},fetcher);
 return {provider:'Geoapify',attribution:'Powered by Geoapify · © OpenStreetMap contributors',city:city.name,
  results:(body.results??[]).filter((r:any)=>r.country_code==='gb').map((r:any)=>place.parse({lat:r.lat,lng:r.lon,label:r.formatted,source:'search'})).map((r:any)=>({...r,inServiceArea:inServiceArea(r,city.id)}))};}

export async function roadEstimate(input:any,fetcher:typeof fetch=fetch){validatePlaces(input);const a=endpoint(input,'pickup'),b=endpoint(input,'destination');const body=await provider('routing',{waypoints:`${a.lat},${a.lng}|${b.lat},${b.lng}`,mode:'drive'},fetcher);const properties=z.object({time:z.number().positive().max(86400),distance:z.number().positive()}).parse(body.features?.[0]?.properties);return {provider:'Geoapify',estimatedMinutes:Math.ceil(properties.time/60),distanceMetres:properties.distance,checkedAt:new Date().toISOString(),label:'Road travel estimate—not live traffic or guaranteed ETA'};}
