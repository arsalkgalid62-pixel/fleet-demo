import { z } from 'zod';
import { inAnyCity, inCity } from './cities.js';
export const coordinates=z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)});
export const place=coordinates.extend({label:z.string().trim().min(2).max(200),source:z.enum(['manual','search','device','uk-test'])});
export type Place=z.infer<typeof place>;
/**
 * Demo service area. Not a legal UK boundary or an approved operator area.
 *
 * `inDemoArea` now means "inside any supported city", so a booking is checked
 * against its own city rather than a hardcoded Manchester rectangle.
 */
export function inDemoArea(p:{lat:number;lng:number}){return inAnyCity(p);}
export function inServiceArea(p:{lat:number;lng:number},cityId?:string){return inCity(p,cityId);}
export const ukTests:Place[]=[
 {label:'UK test · Manchester Piccadilly',lat:53.4774,lng:-2.2309,source:'uk-test'},
 {label:'UK test · Manchester Airport',lat:53.365,lng:-2.272,source:'uk-test'},
 {label:'UK test · Manchester city centre',lat:53.4808,lng:-2.2426,source:'uk-test'}
];
export const positionInput=z.object({key:z.string().uuid(),version:z.number().int().min(0),bookingVersion:z.number().int().min(0),stop:z.boolean().default(false),point:coordinates.extend({accuracy:z.number().min(0).max(10000),capturedAt:z.string().datetime(),source:z.enum(['device','uk-test'])}).optional()}).strict().refine(v=>v.stop||!!v.point,{message:'Location coordinates required'});
