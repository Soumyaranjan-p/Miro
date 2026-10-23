
(()=>{
const $=id=>document.getElementById(id),svg=$('miro'),NS='http://www.w3.org/2000/svg',stage=$('stage');
const A=matchMedia('(prefers-reduced-motion: reduce)').matches?.3:1;
const hx=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const mix=(a,b,t)=>{const x=hx(a),y=hx(b);return'#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('')};
const lerp=(a,b,t)=>a+(b-a)*t,cl=(v,a,b)=>Math.min(b,Math.max(a,v));
const P={s0:['#ffc98f','#ff8f84'],s1:['#ff9a3c','#ee4a3f'],s2:['#e8691c','#a81826'],b0:['#fffaf0','#ffe6e0'],b1:['#ffe3bf','#ffb9ae'],i0:['#b86f33','#ff5a3c'],i1:['#4a2412','#7a0f12']};
let target=0,m=0,t=0,last=performance.now(),lm=-1;
let tx=0,ty=0,lx=0,ly=0,sq=0,sqv=0,jy=0,jv=0,air=false,spin=0,sl=0,happy=0,dizzy=0,hover=-1,lastMove=0,asleep=false,mouthO=0,blinkT=-1,nextBlink=2,tw=0,nextTw=3,nextP=0,clicks=[];
const parts=[],fx=$('fx');
function burst(ch,n){for(let i=0;i<n;i++){const e=document.createElementNS(NS,'text');e.textContent=ch;e.setAttribute('text-anchor','middle');e.setAttribute('font-size',16+Math.random()*14);e.setAttribute('fill',target?'#ff5a4d':ch==='♥'?'#ff6f8a':ch==='Z'?'#8fb4ff':'#ffd25a');fx.appendChild(e);parts.push({e,x:200+(Math.random()-.5)*150,y:150+Math.random()*30,vx:(Math.random()-.5)*90,vy:-60-Math.random()*70,age:0,life:1.2+Math.random()*.5})}}
addEventListener('pointermove',e=>{const r=svg.getBoundingClientRect();tx=cl(((e.clientX-r.left)/r.width*400-200)/170,-1,1);ty=cl(((e.clientY-r.top)/r.height*400-215)/170,-1,1);lastMove=t;if(asleep){asleep=false;sq=-.12}});
const rig=$('rig');
rig.addEventListener('click',()=>{const n=performance.now();clicks=clicks.filter(c=>n-c<700);clicks.push(n);if(clicks.length>=3){dizzy=1.8;clicks=[];burst(target?'!':'✦',3)}else{sq=-.2;mouthO=.5;burst(target?'!':'♥',1)}});
rig.addEventListener('dblclick',()=>{if(!air){jv=-780*A;air=true}sq=.15;burst(target?'!':'✦',6)});
rig.addEventListener('pointerenter',()=>hover=t);rig.addEventListener('pointerleave',()=>hover=-1);
const cap=$('cap'),bN=$('bN'),bI=$('bI');
function setMode(v,quiet){target=v?1:0;stage.classList.toggle('alert',!!v);bN.setAttribute('aria-pressed',!v);bI.setAttribute('aria-pressed',!!v);cap.textContent=v?'On alert. Watching closely.':'Calm. Following your cursor.';if(!quiet){sq=-.2;asleep=false;lastMove=t;burst(v?'!':'✦',4)}}
bN.onclick=()=>setMode(0);bI.onclick=()=>setMode(1);
addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();if(k==='n')setMode(0);if(k==='i')setMode(1)});
window.Miro={setMode:n=>setMode(n==='incident'||n===1||n===true),get mode(){return target?'incident':'normal'}};
function paint(){for(const k in P)$(k).setAttribute('stop-color',mix(P[k][0],P[k][1],m));const lc=mix('#f58d36','#d8403a',m),ls=mix('#c8641c','#8e1219',m);document.querySelectorAll('.lid').forEach(l=>{l.setAttribute('fill',lc);l.setAttribute('stroke',ls)});document.querySelectorAll('.hl').forEach(h=>h.setAttribute('fill',mix('#ffffff','#ffd2cb',m)));svg.style.setProperty('--ear',mix('#ffc2a0','#7a1a22',m));document.querySelectorAll('.ch').forEach(c=>c.setAttribute('opacity',lerp(.35,.1,m)+happy*.3))}
function frame(now){
const dt=Math.min(.05,(now-last)/1000);last=now;t+=dt;
m+=(target-m)*Math.min(1,dt*(target>m?7:4));
if(Math.abs(m-lm)>.002||happy>.01){lm=m;paint()}
if(!asleep&&!target&&t-lastMove>12&&hover<0)asleep=true;
sl+=((asleep?.88:0)-sl)*Math.min(1,dt*3);
const love=hover>=0&&t-hover>2&&!target;
happy+=((love?1:0)-happy)*Math.min(1,dt*6);
let gx=asleep?0:tx,gy=asleep?.2:ty;if(dizzy>0){dizzy-=dt;gx=Math.cos(t*14);gy=Math.sin(t*14)}
const rate=1-Math.pow(1-(.1+m*.25),dt*60);lx+=(gx-lx)*rate;ly+=(gy-ly)*rate;
nextBlink-=dt;if(nextBlink<=0){blinkT=0;nextBlink=target?4+Math.random()*3:2+Math.random()*3}
let bl=0;if(blinkT>=0){blinkT+=dt;bl=Math.sin(cl(blinkT/.16,0,1)*Math.PI);if(blinkT>.16)blinkT=-1}
const base=Math.max(lerp(0,.36,m),sl,happy*.4),c=base+(1-base)*bl,ang=m*20;
$('lidL').setAttribute('transform',`rotate(${ang} 150 212) translate(0 ${-82+66*c})`);
$('lidR').setAttribute('transform',`rotate(${-ang} 250 212) translate(0 ${-82+66*c})`);
const it=`translate(${lx*7} ${ly*6})`;$('irL').setAttribute('transform',it);$('irR').setAttribute('transform',it);
const ht=`translate(${lx*4} ${ly*3})`;$('hlL').setAttribute('transform',ht);$('hlR').setAttribute('transform',ht);
document.querySelectorAll('.pu').forEach(p=>{p.setAttribute('rx',lerp(10,5.5,m));p.setAttribute('ry',lerp(11,14,m))});
$('face').setAttribute('transform',`translate(${lx*6} ${ly*3.5})`);
mouthO-=dt;let d,f='none';
if(dizzy>0)d='M184 258Q192 250 200 258T216 258';
else if(mouthO>0){d='M194 255Q200 276 206 255Q200 250 194 255Z';f='#3a1a10'}
else if(m>.5)d='M188 266Q200 255 212 266';
else if(happy>.3){d='M182 254Q200 282 218 254Q200 260 182 254Z';f='#3a1a10'}
else d='M186 254Q193 264 200 254Q207 264 214 254';
$('mouth').setAttribute('d',d);$('mouth').setAttribute('fill',f);
nextTw-=dt;if(nextTw<=0){tw=1;nextTw=3+Math.random()*4}tw=Math.max(0,tw-dt*4);
const ea=(lerp(-4,-34,m)-Math.sin(tw*Math.PI)*10*(1-m))*(A<1?.4:1);
$('eL').setAttribute('transform',`rotate(${ea} 140 168) translate(0 ${6*m})`);
$('eR').setAttribute('transform',`rotate(${-ea} 260 168) translate(0 ${6*m})`);
$('tail').setAttribute('transform',`rotate(${Math.sin(t*(1.8+m*9))*(9-6*m)*A-m*6} 272 290)`);
const wt=t-.5,wave=(wt>0&&wt<1.8&&!target)?-55+Math.sin(wt*12)*16:Math.sin(t*1.7)*2;
$('armR').setAttribute('transform',`rotate(${wave+m*10} 316 262)`);
$('armL').setAttribute('transform',`rotate(${-Math.sin(t*1.7)*2-m*10} 84 262)`);
sqv+=(-260*sq-14*sqv)*dt;sq+=sqv*dt;
if(air){jv+=2400*dt;jy+=jv*dt;spin+=554*dt*(A<1?0:1);if(jy>=0){jy=0;jv=0;air=false;spin=0;sq=-.22}}
const br=Math.sin(t*(asleep?1.3:2.2+m*4.5))*(.012+m*.006)*A;
const sy=1+br+sq,sx=1-br*.6-sq*.5,jx=Math.sin(t*47)*.8*m*A;
rig.setAttribute('transform',`translate(${jx} ${jy}) translate(200 346) rotate(${spin+lx*2.5}) scale(${sx} ${sy}) translate(-200 -346)`);
$('shadow').setAttribute('rx',100*cl(1+jy/500,.5,1.1)*(sx>1.02?1.05:1));
$('glow').setAttribute('opacity',m*(.55+.2*Math.sin(t*5.5)));
const p=(t*1.2)%1;$('ring').setAttribute('rx',140+p*70);$('ring').setAttribute('ry',130+p*60);$('ring').setAttribute('opacity',m*(1-p)*.55);
if(love){nextP-=dt;if(nextP<=0){burst('♥',1);nextP=.55}}
if(asleep){nextP-=dt;if(nextP<=0){burst('Z',1);nextP=1.5}}
for(let i=parts.length-1;i>=0;i--){const q=parts[i];q.age+=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.vy+=40*dt;if(q.age>=q.life){q.e.remove();parts.splice(i,1);continue}q.e.setAttribute('x',q.x);q.e.setAttribute('y',q.y);q.e.setAttribute('opacity',1-q.age/q.life)}
requestAnimationFrame(frame)}
setMode(0,true);paint();requestAnimationFrame(frame);
})();
