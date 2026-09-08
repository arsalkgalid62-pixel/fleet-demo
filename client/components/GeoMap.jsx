import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

export default function GeoMap({point,onPick,otherPoint}) {
 const host=useRef(null),map=useRef(null),callback=useRef(onPick),layers=useRef([]);const [ready,setReady]=useState(false);
 callback.current=onPick;
 const tileKey=import.meta.env.VITE_GEOAPIFY_MAP_KEY;
 useEffect(()=>{let alive=true;let instance;
  import('leaflet').then(({default:L})=>{if(!alive)return;instance=L.map(host.current,{scrollWheelZoom:false}).setView([53.4774,-2.2309],12);map.current={instance,L};
   if(tileKey)L.tileLayer(`https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(tileKey)}`,{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://www.geoapify.com/">Geoapify</a>'}).addTo(instance);
   instance.on('click',e=>callback.current?.({lat:e.latlng.lat,lng:e.latlng.lng,label:'Manually selected pickup pin',source:'manual'}));setReady(true);
  });return()=>{alive=false;instance?.remove();map.current=null;};
 },[tileKey]);
 useEffect(()=>{if(!ready||!map.current)return;const {instance,L}=map.current;layers.current.forEach(l=>l.remove());layers.current=[];const pts=[point,otherPoint].filter(Boolean);pts.forEach((p,i)=>{layers.current.push(L.circleMarker([p.lat,p.lng],{radius:9,color:i?'#698411':'#133e35',fillOpacity:1}).addTo(instance));});if(pts.length===1)instance.setView([point.lat,point.lng],14);if(pts.length>1)instance.fitBounds(pts.map(p=>[p.lat,p.lng]),{padding:[25,25],maxZoom:15});},[point?.lat,point?.lng,otherPoint?.lat,otherPoint?.lng,ready]);
 return <div><div ref={host} className="relative z-0 h-64 w-full rounded-lg bg-ink-100" role="region" aria-label="Location map; coordinate entry is available below"/>
 <p className="mt-2 text-xs text-ink-600">{tileKey?'Map tiles: Geoapify / OpenStreetMap. Pins are selected or device-reported locations.':'Basemap unavailable: configure a map key. This is a coordinate canvas, not a street map.'} {onPick?'Click to select a pin, or use the coordinate fields.':''}</p></div>;
}
