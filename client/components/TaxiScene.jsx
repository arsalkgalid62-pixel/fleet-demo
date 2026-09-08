import { useId, useState } from 'react';
import './TaxiScene.css';
import useTaxiAudio from './useTaxiAudio.js';

function Street({ offset = 0 }) {
  return <g transform={`translate(${offset} 0)`}>
    {[0, 150, 300, 600, 750, 900].map((x,i)=><g key={x} transform={`translate(${x} ${i%2?12:0})`}>
      <path d="M0 246V136L66 99L132 136V246" fill={i%2?'#254f46':'#305d51'}/>
      <path d="M-4 136L66 94L136 136" fill="none" stroke="#6c8871" strokeWidth="5"/>
      <path d="M90 115V86H105V124" fill="#305d51"/>
      {[22,78].map(wx=><g key={wx}><rect x={wx} y="151" width="30" height="35" rx="2" fill="#c9bb83" opacity=".65"/><path d={`M${wx+15} 151V186M${wx} 169H${wx+30}`} stroke="#254b41" strokeWidth="3"/></g>)}
      <rect x="47" y="205" width="29" height="41" rx="14" fill="#102f29"/>
      <path d="M12 196H120M12 241H120" stroke="#728878" opacity=".35"/>
    </g>)}
    <g transform="translate(455 0)"><rect x="0" y="167" width="43" height="83" rx="4" fill="#a85042"/><path d="M-3 169Q21 150 46 169" fill="#bd6a50"/><rect x="6" y="172" width="30" height="10" fill="#e6dabb"/><path d="M8 191H35V241H8ZM21 191V241M8 207H35M8 224H35" fill="none" stroke="#e6dabb" strokeWidth="2" opacity=".75"/></g>
    {[180,570,960].map(x=><g key={x} transform={`translate(${x} 0)`}><path d="M0 252V137M-12 137H12L8 113H-8Z" stroke="#8aa18a" strokeWidth="3" fill="#d6db9f"/><ellipse cy="125" rx="29" ry="34" fill="#d6db9f" opacity=".04"/></g>)}
    <g transform="translate(530 210)"><rect x="-3" y="-20" width="6" height="63" fill="#102f29"/><ellipse cy="-24" rx="29" ry="39" fill="#3d6750"/><ellipse cx="-12" cy="-22" rx="22" ry="29" fill="#47735a"/></g>
  </g>;
}

export default function TaxiScene(){
 const id=useId().replace(/:/g,'');const [paused,setPaused]=useState(false);
 const sound=useTaxiAudio();
 return <figure className={`taxi-scene ${paused?'taxi-scene--paused':''}`} aria-label="Decorative animated UK taxi street illustration">
  <div className="taxi-scene__heading"><span>THE NEXT JOURNEY STARTS HERE</span><div className="taxi-scene__controls"><button type="button" onClick={sound.toggle} disabled={paused} aria-pressed={sound.enabled} aria-label={sound.enabled?'Mute taxi sound':'Enable taxi sound'}>{sound.enabled?'Sound on':'Sound off'}</button><button className="taxi-scene__pause" type="button" onClick={()=>{sound.stop();setPaused(p=>!p);}} aria-pressed={paused}>{paused?'Play animation':'Pause animation'}</button></div></div>
  {sound.error&&<p className="taxi-scene__audio-error" role="status">{sound.error}</p>}
  <svg viewBox="0 0 1000 370" role="img" aria-labelledby={`${id}-title`}>
   <title id={`${id}-title`}>An illustrated black cab travelling past British terraced houses and a red telephone box. Decorative animation, not live tracking.</title>
   <defs>
    <linearGradient id={`${id}-sky`} x2="0" y2="1"><stop stopColor="#102d29"/><stop offset="1" stopColor="#426450"/></linearGradient>
    <linearGradient id={`${id}-paint`} x2="0" y2="1"><stop stopColor="#344c48"/><stop offset=".55" stopColor="#172e2b"/><stop offset="1" stopColor="#081c1a"/></linearGradient>
    <linearGradient id={`${id}-glass`} x2="1" y2="1"><stop stopColor="#a8c3b0"/><stop offset="1" stopColor="#536f66"/></linearGradient>
    <linearGradient id={`${id}-beam`}><stop stopColor="#ebefbe" stopOpacity=".25"/><stop offset="1" stopColor="#ebefbe" stopOpacity="0"/></linearGradient>
    <pattern id={`${id}-road`} width="160" height="12" patternUnits="userSpaceOnUse"><path d="M10 6H82" stroke="#e0dcb8" strokeWidth="3" opacity=".38"/></pattern>
   </defs>
   <path d="M0 0H1000V370H0Z" fill={`url(#${id}-sky)`}/>
   <circle cx="823" cy="61" r="23" fill="#e6dfb7" opacity=".75"/><circle cx="823" cy="61" r="39" fill="#e6dfb7" opacity=".03"/>
   <g fill="#789383" opacity=".18"><path d="M0 155V101H45V78H78V132H129V102H187V155ZM323 160V114H373V80H414V129H445V107H501V160ZM675 162V95H724V66H750V109H790V132H850V101H913V162Z"/></g>
   <g className="taxi-scene__street"><Street/><Street offset={1100}/></g>
   <path d="M0 250H1000V370H0Z" fill="#102421"/><path d="M0 253H1000" stroke="#7b9180" strokeWidth="4"/>
   <g className="taxi-scene__road"><rect x="0" y="329" width="1320" height="12" fill={`url(#${id}-road)`}/></g>
   <ellipse cx="537" cy="316" rx="182" ry="13" fill="#071714" opacity=".7"/>
   <g className="taxi-scene__cab">
    <path d="M700 268L948 234V307L700 284Z" fill={`url(#${id}-beam)`}/>
    <path d="M347 282L360 235Q366 224 391 222L424 175Q431 164 447 164H552Q570 164 582 180L621 226L673 240Q693 245 699 265L702 290Q699 302 688 303H361Q343 301 347 282Z" fill={`url(#${id}-paint)`} stroke="#648176" strokeWidth="2"/>
    <path d="M400 222L434 180Q438 177 448 177H479V222ZM490 177H548Q560 177 569 189L596 222H490Z" fill={`url(#${id}-glass)`} stroke="#0c2520" strokeWidth="4"/>
    <path d="M441 183L414 215M452 183L426 215M514 182L541 214" stroke="#d6e7ce" strokeWidth="4" opacity=".2"/>
    <path d="M484 228V288M604 230L610 287M370 279H681" stroke="#526c61" strokeWidth="1.5"/>
    <path d="M448 237H465M568 237H585" stroke="#c0c5ae" strokeWidth="4" strokeLinecap="round"/>
    <rect x="464" y="150" width="66" height="17" rx="4" fill="#c6df68"/><text x="497" y="162" textAnchor="middle" fontFamily="sans-serif" fontSize="11" fontWeight="800" letterSpacing="3" fill="#16392d">TAXI</text>
    <path d="M595 223L615 215L623 219V229H607" fill="#314f45" stroke="#728c7d" strokeWidth="2"/>
    <rect x="350" y="263" width="9" height="15" rx="3" fill="#c76d50"/><path d="M680 256Q695 258 697 275H680Z" fill="#ecedbf"/>
    <path d="M686 282H699M347 289H375M661 295H701" stroke="#b6c0a9" strokeWidth="4" strokeLinecap="round"/>
    <text x="544" y="266" textAnchor="middle" fill="#d2ddc1" fontFamily="sans-serif" fontSize="12" fontWeight="700" letterSpacing="4">FLEET</text>
    {[409,640].map(x=><g key={x} transform={`translate(${x} 296)`}><circle r="29" fill="#071a17"/><circle r="21" fill="#738c7d"/><circle r="16" fill="#293f36"/><g className="taxi-scene__wheel" stroke="#a7b9a0" strokeWidth="3"><path d="M0 -14V14M-14 0H14M-10 -10L10 10M10 -10L-10 10"/></g><circle r="5" fill="#b9c8af"/></g>)}
   </g>
   <g className="taxi-scene__foreground" fill="#72917a" opacity=".4"><path d="M92 350H121M83 354H103M845 353H881M862 357H900"/></g>
  </svg>
  <figcaption><span>Local streets. Airport arrivals. Every journey connected.</span><span>Illustration · not live tracking</span></figcaption>
 </figure>;
}
