import * as THREE from './vendor/three.module.js';

const $ = id => document.getElementById(id);
const game = $('game'), app = $('app');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  game.appendChild(renderer.domElement);
} catch (e) { $('loading').classList.add('hidden'); $('error').classList.remove('hidden'); throw e; }
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc5c5b3);
scene.fog = new THREE.Fog(0xc5c5b3, 180, 480);
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, .08, 700);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xe5eddd, 0x776b59, 2));
const sun = new THREE.DirectionalLight(0xffe1b3, 2.6);
sun.position.set(-70,120,50);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:300});sun.shadow.bias=-.00035;scene.add(sun,sun.target);
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.88,...extra});
const M={road:mat(0x777870),pavement:mat(0xb7a991),curb:mat(0xdbcbb0),ground:mat(0xc7b49a),white:mat(0xe8e6dc),blue:mat(0x315e77),dark:mat(0x252c2c),rubber:mat(0x202323),metal:mat(0x858b84,{metalness:.55,roughness:.4}),yellow:mat(0xe8c575),skin:mat(0xb88260),seat:mat(0x71594a),glass:mat(0x9bc4c5,{transparent:true,opacity:.18,depthWrite:false,roughness:.2,metalness:.1,side:THREE.DoubleSide})};
const geom=new Map();
function box(w,h,d,m,x=0,y=0,z=0,parent=scene,shadow=true){const key=[w,h,d].join(',');if(!geom.has(key))geom.set(key,new THREE.BoxGeometry(w,h,d));const mesh=new THREE.Mesh(geom.get(key),m);mesh.position.set(x,y,z);mesh.castShadow=shadow;mesh.receiveShadow=true;parent.add(mesh);return mesh}
function cyl(rt,rb,h,m,x,y,z,parent=scene,segments=12){const key=`c${rt},${rb},${h},${segments}`;if(!geom.has(key))geom.set(key,new THREE.CylinderGeometry(rt,rb,h,segments));const mesh=new THREE.Mesh(geom.get(key),m);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh}
function sphere(r,m,x,y,z,parent=scene){const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,12,8),m);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh}
let seed=3257;function rnd(){seed=(seed*16807)%2147483647;return(seed-1)/2147483646}function pick(a){return a[Math.floor(rnd()*a.length)]}
// Canvas textures add masonry and street detail without external assets.
function texture(draw,w=512,h=512){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return t}
const roadTex=texture((c,w,h)=>{c.fillStyle='#666b67';c.fillRect(0,0,w,h);for(let i=0;i<15000;i++){const v=Math.floor(75+rnd()*55);c.fillStyle=`rgba(${v},${v},${v},${rnd()*.3})`;c.fillRect(rnd()*w,rnd()*h,1+rnd()*3,1+rnd()*3)}for(let i=0;i<22;i++){c.strokeStyle='rgba(41,43,40,.13)';c.lineWidth=1;c.beginPath();let x=rnd()*w,y=rnd()*h;c.moveTo(x,y);for(let j=0;j<4;j++){x+=rnd()*30-15;y+=rnd()*28;c.lineTo(x,y)}c.stroke()}});
roadTex.wrapS=roadTex.wrapT=THREE.RepeatWrapping;roadTex.repeat.set(10,10);M.road.map=roadTex;M.road.needsUpdate=true;
const facadeColors=['#b6a38d','#c8b79e','#aa9c89','#cbb99f','#a89a88','#bdb2a1'];
function facadeTexture(color){return texture((c,w,h)=>{c.fillStyle=color;c.fillRect(0,0,w,h);for(let i=0;i<2400;i++){const a=rnd()*.075;c.fillStyle=rnd()>.5?`rgba(255,255,255,${a})`:`rgba(50,40,30,${a})`;c.fillRect(rnd()*w,rnd()*h,2+rnd()*30,1+rnd()*8)}
 for(let y=42;y<h-40;y+=110){c.fillStyle='rgba(72,59,50,.18)';c.fillRect(0,y+78,w,5);for(let x=25;x<w-35;x+=100){c.fillStyle='#796c5d';c.fillRect(x-5,y-5,66,78);c.fillStyle=pick(['#454e4c','#52625d','#585c55','#66706a']);c.fillRect(x,y,56,68);c.fillStyle='#9d9181';c.fillRect(x+26,y,4,68);c.fillRect(x,y+32,56,4);c.fillStyle='#d5c4aa';c.fillRect(x-7,y+67,70,7);if(rnd()>.7){c.fillStyle='#c4bdac';c.fillRect(x+34,y+44,27,24);c.fillStyle='#87877c';c.fillRect(x+38,y+48,19,15)}}}})}
const facades=facadeColors.map(c=>new THREE.MeshStandardMaterial({map:facadeTexture(c),roughness:1}));
const labelCache=new Map();
function label(text,bg='#3d5b50',color='#fff1d0'){const key=text+bg+color;if(labelCache.has(key))return labelCache.get(key);const t=texture((c,w,h)=>{c.fillStyle=bg;c.fillRect(0,0,w,h);c.strokeStyle='rgba(255,255,255,.5)';c.lineWidth=7;c.strokeRect(7,7,w-14,h-14);c.fillStyle=color;c.direction='rtl';c.textAlign='center';c.textBaseline='middle';c.font='bold 66px Arial';c.fillText(text,w/2,h/2)},512,128);const m=new THREE.MeshBasicMaterial({map:t,side:THREE.FrontSide});labelCache.set(key,m);return m}
function sign(text,w,h,x,y,z,rot,bg){const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),label(text,bg));p.position.set(x,y,z);p.rotation.y=rot;scene.add(p);return p}
// A connected grid of roads: every intersection can be turned into, not just a single corridor.
const LIMIT=282, roads=[-240,-120,0,120,240];
box(600,.2,600,M.ground,0,-.22,0);
for(const n of roads){box(24,.12,600,M.road,n,-.08,0);box(600,.12,24,M.road,0,-.075,n);for(let t=-276;t<=276;t+=12){if(roads.some(r=>Math.abs(t-r)<14))continue;box(.18,.025,5,M.white,n,.005,t,scene,false);box(5,.025,.18,M.white,t,.007,n,scene,false)}}
const buildingBounds=[];
const shopNames=['بقالة الحاج','فول وطعمية','قهوة البلد','أولاد البلد','عصير قصب','قطع غيار','مخبز بلدي','سوبر ماركت','جزارة المعلم','صيدلية النور'];
const shopColors=['#425c50','#76584d','#4c6670','#735f4d','#556247'];
function storefront(x,z,side){ // outward-facing planes must point toward the street, never their mirrored back side
 const bg=pick(shopColors),name=pick(shopNames);if(side==='left'||side==='right'){const dir=side==='left'?-1:1,face=x+dir*13.6;box(.15,2.7,12,mat(0x51473d),face,1.45,z);box(1.4,.18,13,mat(pick([0x8a6855,0x5a756e,0xa48462])),face+dir*.7,3.1,z);sign(name,11,1.25,face+dir*.12,3.95,z,dir*Math.PI/2,bg)}else{const dir=side==='front'?-1:1,face=z+dir*13.6;box(12,2.7,.15,mat(0x51473d),x,1.45,face);box(13,.18,1.4,mat(pick([0x8a6855,0x5a756e,0xa48462])),x,3.1,face+dir*.7);sign(name,11,1.25,x,3.95,face+dir*.12,dir<0?Math.PI:0,bg)}}
for(let bx=-180;bx<=180;bx+=120)for(let bz=-180;bz<=180;bz+=120){box(95,.35,95,M.pavement,bx,.06,bz);for(let ix=-1;ix<=1;ix++)for(let iz=-1;iz<=1;iz++){let x=bx+ix*30,z=bz+iz*30;let h=12+Math.floor(rnd()*5)*4;box(27,h,27,pick(facades),x,h/2+.25,z);box(28,.35,28,M.curb,x,h+.35,z);buildingBounds.push({minX:x-14,maxX:x+14,minZ:z-14,maxZ:z+14});if(ix===-1)storefront(x,z,'left');if(ix===1)storefront(x,z,'right');if(iz===-1)storefront(x,z,'front');if(iz===1)storefront(x,z,'back');if(rnd()>.5){cyl(.8,.8,1.6,M.dark,x+5,h+1.1,z-5);box(4,.2,3,M.metal,x-6,h+1,z+4)}}}
function tree(x,z){cyl(.25,.35,4,mat(0x75624c),x,2,z);for(let i=0;i<3;i++){const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(2.2+rnd()*.7,1),mat(pick([0x697f58,0x7c8961,0x597350])));leaf.position.set(x+(rnd()-.5)*2,4.7+rnd()*1.7,z+(rnd()-.5)*2);leaf.castShadow=true;scene.add(leaf)}}
for(const x of roads)for(let z=-265;z<270;z+=40){if(roads.some(r=>Math.abs(z-r)<18))continue;tree(x+14,z);if(rnd()>.45)tree(x-14,z+10);for(const side of [-1,1]){cyl(.09,.12,8,M.dark,x+side*12.7,4,z+18);box(1.3,.15,.16,M.dark,x+side*12.1,8,z+18);box(.5,.14,.4,M.yellow,x+side*11.5,7.9,z+18)}}
for(const z of roads)for(let x=-260;x<260;x+=60){if(roads.some(r=>Math.abs(x-r)<20))continue;cyl(.09,.12,8,M.dark,x,4,z+12.7);box(.16,.15,1.4,M.dark,x,8,z+12.1);box(.4,.14,.5,M.yellow,x,7.9,z+11.5)}
// A detailed, open-window microbus with an interior and actual seated passengers.
function makeBus(){const g=new THREE.Group();
 box(3.1,.8,7.4,M.white,0,1.02,0,g);box(3.14,.32,7.42,M.blue,0,1.38,0,g);box(3.05,.18,7.3,M.white,0,3.55,0,g);box(3,.15,7.1,M.dark,0,.65,0,g);
 // Window pillars and glazing leave the interior visible.
 for(const side of [-1,1]){for(const z of [-3.38,-1.65,.25,2.05,3.42])box(.18,1.95,.18,M.white,side*1.46,2.52,z,g);for(const z of [-2.5,-.7,1.15,2.75])box(.04,1.35,1.45,M.glass,side*1.49,2.57,z,g,false);box(.13,.16,7.05,M.white,side*1.47,1.89,0,g);box(.12,.12,7.05,M.metal,side*1.52,1.62,0,g);
 for(const z of [-2.32,2.3]){let wheel=cyl(.62,.62,.38,M.rubber,side*1.55,.64,z,g,20);wheel.rotation.z=Math.PI/2;let hub=cyl(.31,.31,.4,M.metal,side*1.76,.64,z,g,20);hub.rotation.z=Math.PI/2;let cap=cyl(.12,.12,.42,M.dark,side*1.78,.64,z,g,16);cap.rotation.z=Math.PI/2}}
 box(2.8,1.3,.05,M.glass,0,2.62,-3.48,g,false);box(2.8,1.3,.05,M.glass,0,2.62,3.48,g,false);box(3,.12,.12,M.white,0,3.3,-3.5,g);box(3,.12,.12,M.white,0,1.94,-3.5,g);box(3,.12,.12,M.white,0,3.3,3.5,g);box(3,.12,.12,M.white,0,1.94,3.5,g);
 box(3.2,.18,.22,M.metal,0,.79,-3.76,g);box(3.2,.18,.22,M.metal,0,.79,3.76,g);box(2.7,.35,.06,M.dark,0,1.14,-3.72,g);for(const side of [-1,1]){box(.5,.3,.08,mat(0xffe4a9),side*1.14,1.38,-3.75,g);box(.48,.3,.08,mat(0xb94d39),side*1.15,1.38,3.75,g);box(.32,.48,.42,M.dark,side*1.75,2.38,-2.95,g)}
 const rearSign=new THREE.Mesh(new THREE.PlaneGeometry(2.2,.38),label('إمبابة - التحرير','#e7dac0','#263b37'));rearSign.position.set(0,3.28,3.53);g.add(rearSign);
 for(const z of [-.55,1.15,2.7]){box(2.5,.2,.65,M.seat,0,1.55,z,g);box(2.5,.82,.16,M.seat,0,2.03,z+.35,g)}
 const riders=[];const colors=[0x536f70,0x936c5d,0xd1b998,0x596779,0x8d8871,0x685748,0xc4b19d,0x557060];for(let i=0;i<8;i++){const p=new THREE.Group(),x=(i%3-1)*.8,z=[-.55,1.15,2.7][Math.floor(i/3)];box(.54,.62,.35,mat(colors[i]),0,2.05,0,p);sphere(.22,mat(i%2?0xb78967:0x9c6b50),0,2.64,0,p);box(.14,.55,.18,mat(colors[i]),-.36,2.05,0,p);box(.14,.55,.18,mat(colors[i]),.36,2.05,0,p);p.position.set(x,0,z);p.visible=false;g.add(p);riders.push(p)}
 return {mesh:g,riders}}
const {mesh:bus,riders}=makeBus();scene.add(bus);
function makeCar(color){const g=new THREE.Group();box(3,.85,5.3,mat(color),0,1,0,g);box(2.75,.95,2.6,mat(color),0,1.9,.25,g);box(2.45,.65,.04,M.glass,0,2,-1.08,g,false);box(2.45,.65,.04,M.glass,0,2,1.58,g,false);for(const s of [-1,1])for(const z of [-1.6,1.6]){const w=cyl(.52,.52,.28,M.rubber,s*1.5,.55,z,g);w.rotation.z=Math.PI/2}return g}
const traffic=[];for(let i=0;i<7;i++){const car=makeCar(pick([0xe0d8c4,0x677d79,0x925f50,0xc5a878,0x4f6265]));car.position.set(i%2?-5:5,0,-250+i*75);if(i%2)car.rotation.y=Math.PI;scene.add(car);traffic.push({mesh:car,dir:i%2?1:-1,speed:5+rnd()*5})}
function person(x,z,shirt){const p=new THREE.Group();box(.62,.9,.4,mat(shirt),0,1.4,0,p);sphere(.25,M.skin,0,2.1,0,p);box(.22,.8,.25,M.dark,-.18,.5,0,p);box(.22,.8,.25,M.dark,.18,.5,0,p);box(.18,.8,.2,mat(shirt),-.42,1.3,0,p);box(.18,.8,.2,mat(shirt),.42,1.3,0,p);p.position.set(x,0,z);scene.add(p);return p}
const stops=[{name:'موقف إمبابة',x:5,z:-95,people:2,desc:'اتجه للموقف واستنى الركاب'}, {name:'شارع الوحدة',x:5,z:-220,people:3,desc:'وصّل الركاب ولمّ ناس تانية'}, {name:'ميدان الكيت كات',x:120,z:-235,people:3,desc:'لف يمين من التقاطع للموقف'}, {name:'محطة التحرير',x:235,z:-120,people:0,desc:'وصّل الركاب لنهاية المشوار'}];
const stopGroups=stops.map((s,i)=>{const group=new THREE.Group();scene.add(group);const marker=new THREE.Mesh(new THREE.TorusGeometry(5,.15,8,48),new THREE.MeshBasicMaterial({color:0xe9c47b}));marker.rotation.x=Math.PI/2;marker.position.set(s.x,.12,s.z);group.add(marker);cyl(.11,.12,4,M.dark,s.x+7,2,s.z,group);box(2.4,1.2,.15,M.blue,s.x+7,4.4,s.z,group);const panel=new THREE.Mesh(new THREE.PlaneGeometry(2.1,.95),label('موقف','#315a69'));panel.position.set(s.x+7,4.4,s.z+.1);group.add(panel);let persons=[];for(let p=0;p<Math.max(2,s.people);p++)persons.push(person(s.x+8+p*.8,s.z+2+p*.8,pick([0x647a78,0x9d705c,0xd4c4a7,0x586678])));return {group,marker,persons}});
// First-person cockpit is attached to the camera so wheel and hands stay in the driver's view.
const cockpit=new THREE.Group();camera.add(cockpit);cockpit.visible=false;
box(4,.5,1.1,mat(0x323b38),0,-1.05,-1.3,cockpit);box(4,.2,.3,mat(0x252c2a),0,-.8,-1.7,cockpit);box(.9,.18,.3,mat(0x151d1c),.55,-.78,-1.62,cockpit);box(.4,.16,.05,M.metal,.55,-.73,-1.79,cockpit);box(1,.26,.3,mat(0x212a28),-.45,-.74,-1.53,cockpit);
const wheelGroup=new THREE.Group();wheelGroup.position.set(-.35,-.68,-1.23);cockpit.add(wheelGroup);
const wheel=new THREE.Mesh(new THREE.TorusGeometry(.43,.055,12,40),mat(0x171e1d));wheelGroup.add(wheel);box(.72,.08,.06,M.dark,0,0,0,wheelGroup);box(.08,.43,.06,M.dark,0,-.15,0,wheelGroup);sphere(.12,M.dark,0,0,.04,wheelGroup);
function armBetween(a,b,r,m,parent){const delta=new THREE.Vector3().subVectors(b,a);const mesh=cyl(r,r,delta.length(),m,0,0,0,parent,10);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return mesh}
for(const s of [-1,1]){armBetween(new THREE.Vector3(s*.72,-.8,.15),new THREE.Vector3(s*.41,-.03,.04),.1,mat(0x52615a),wheelGroup);sphere(.11,M.skin,s*.4,0,.07,wheelGroup)}
// Controls, trip state, and free driving.
let playing=false,routeCompleted=false,velocity=0,heading=0,steering=0,stopIndex=0,passengerCount=0,fare=0,dwell=0,hitCooldown=0,sound=false,audioCtx,msgTimer=0,firstPerson=false;
const keys={up:false,down:false,left:false,right:false,brake:false};
function msg(text,time=3){$('message').textContent=text;$('message').classList.remove('hidden');msgTimer=time}
function beep(freq=440,duration=.12){if(!sound)return;try{audioCtx ||= new AudioContext();if(audioCtx.state==='suspended')audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.045,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration)}catch(e){}}
function updateHUD(){const s=stops[stopIndex];$('stopName').textContent=s?s.name:'جولة حرة';$('stopDesc').textContent=s?s.desc:'لف في المنطقة براحتك';document.querySelector('.route-no').textContent=s?`0${stopIndex+1} / 04`:'حر';$('passengers').innerHTML=`${passengerCount} <small>/ 8</small>`;$('fare').innerHTML=`${fare} <small>ج.م</small>`;$('routeProgress').style.width=`${stopIndex/4*100}%`;riders.forEach((p,i)=>p.visible=i<passengerCount)}
function setView(value){firstPerson=value;cockpit.visible=value;$('cameraBtn').innerHTML=value?'◉ <span>منظور خارجي</span>':'◉ <span>منظور السائق</span>';camera.fov=value?72:60;camera.updateProjectionMatrix()}
function start(){playing=true;routeCompleted=false;velocity=0;heading=0;steering=0;stopIndex=0;passengerCount=0;fare=0;dwell=0;bus.position.set(5,0,35);bus.rotation.y=0;traffic.forEach((c,i)=>{c.mesh.position.z=-250+i*75});stopGroups.forEach(s=>{s.group.visible=true;s.persons.forEach(p=>p.visible=true)});$('intro').classList.add('hidden');$('sceneCaption').classList.add('hidden');$('edition').classList.add('hidden');$('finish').classList.add('hidden');$('hud').classList.remove('hidden');app.classList.add('playing');setView(true);updateHUD();msg('لف بحرية واتجه للموقف على الخريطة. C لتغيير الكاميرا',5);beep(550)}
$('startBtn').addEventListener('click',start);$('restartBtn').addEventListener('click',start);$('continueBtn').addEventListener('click',()=>{$('finish').classList.add('hidden');playing=true;msg('كمّل جولتك في المنطقة براحتك',3)});
$('cameraBtn').addEventListener('click',()=>setView(!firstPerson));$('soundBtn').addEventListener('click',()=>{sound=!sound;$('soundText').textContent=sound?'الصوت شغال':'الصوت مغلق';$('soundBtn').setAttribute('aria-label',sound?'إغلاق الصوت':'تشغيل الصوت');if(sound)beep(600)});
const map={ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',' ':'brake'};
window.addEventListener('keydown',e=>{if(map[e.key]){e.preventDefault();keys[map[e.key]]=true}else if((e.key==='c'||e.key==='C')&&!e.repeat&&playing){setView(!firstPerson)}});window.addEventListener('keyup',e=>{if(map[e.key]){e.preventDefault();keys[map[e.key]]=false}});window.addEventListener('blur',()=>Object.keys(keys).forEach(k=>keys[k]=false));
document.querySelectorAll('[data-key]').forEach(b=>{const key=b.dataset.key;const release=e=>{e.preventDefault();keys[key]=false;b.classList.remove('pressed')};b.addEventListener('pointerdown',e=>{e.preventDefault();keys[key]=true;b.classList.add('pressed');b.setPointerCapture(e.pointerId)});b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',()=>{keys[key]=false;b.classList.remove('pressed')})});
const mapCtx=$('minimap').getContext('2d');
function drawMap(){const c=mapCtx,w=180,scale=w/600; c.fillStyle='#9a9e86';c.fillRect(0,0,w,w);c.fillStyle='#596962';for(const r of roads){c.fillRect((r+300-12)*scale,0,24*scale,w);c.fillRect(0,(r+300-12)*scale,w,24*scale)}const toX=x=>(x+300)*scale,toY=z=>(z+300)*scale;const target=stops[stopIndex];if(target){c.fillStyle='#e9c16f';c.beginPath();c.arc(toX(target.x),toY(target.z),4,0,Math.PI*2);c.fill();c.strokeStyle='#e9c16faa';c.beginPath();c.moveTo(toX(bus.position.x),toY(bus.position.z));c.lineTo(toX(target.x),toY(target.z));c.stroke()}c.save();c.translate(toX(bus.position.x),toY(bus.position.z));c.rotate(-heading);c.fillStyle='#fff8e5';c.beginPath();c.moveTo(0,-6);c.lineTo(4,4);c.lineTo(0,2);c.lineTo(-4,4);c.closePath();c.fill();c.restore()}
function collides(x,z){if(Math.abs(x)>LIMIT||Math.abs(z)>LIMIT)return true;return buildingBounds.some(b=>x+1.8>b.minX&&x-1.8<b.maxX&&z+1.8>b.minZ&&z-1.8<b.maxZ)}
const clock=new THREE.Clock();
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);
 if(playing){
  if(keys.up)velocity+=12*dt;else if(keys.down)velocity-=12*dt;else velocity*=Math.exp(-1.2*dt);if(keys.brake)velocity*=Math.exp(-5*dt);velocity=THREE.MathUtils.clamp(velocity,-7,24);if(Math.abs(velocity)<.05)velocity=0;
  const input=(keys.right?1:0)-(keys.left?1:0);steering=THREE.MathUtils.lerp(steering,input,Math.min(1,dt*5));heading-=steering*velocity*.017*dt;bus.rotation.y=heading;
  const nx=bus.position.x-Math.sin(heading)*velocity*dt,nz=bus.position.z-Math.cos(heading)*velocity*dt;
  hitCooldown=Math.max(0,hitCooldown-dt);if(!collides(nx,nz)){bus.position.x=nx;bus.position.z=nz}else{velocity*=-.12;if(hitCooldown===0){msg('بالراحة يا أسطى! خد بالك من المباني',2);hitCooldown=2;beep(160,.2)}}
  traffic.forEach(c=>{c.mesh.position.z+=c.dir*c.speed*dt;if(c.mesh.position.z>280)c.mesh.position.z=-280;if(c.mesh.position.z< -280)c.mesh.position.z=280;if(hitCooldown===0&&Math.hypot(c.mesh.position.x-bus.position.x,c.mesh.position.z-bus.position.z)<4.2){velocity*=.2;hitCooldown=2;msg('خلي بالك من العربيات!',2);beep(160,.2)}});
  const target=stops[stopIndex];const dist=target?Math.round(Math.hypot(bus.position.x-target.x,bus.position.z-target.z)):0;$('distance').textContent=target?`${dist} م`:'—';$('speed').textContent=Math.round(Math.abs(velocity)*3);document.querySelectorAll('.speed-bars i').forEach((b,i)=>b.classList.toggle('on',i<Math.abs(velocity)/2.4));
  if(target&&dist<11&&Math.abs(velocity)<2){dwell+=dt;if(dwell>1.2){if(stopIndex<3){passengerCount+=target.people;fare+=target.people*15;msg(`تمام! ركب ${target.people} من الركاب. كمل مشوارك`,3);beep(740,.2)}else{passengerCount=0;routeCompleted=true;playing=false;$('finalFare').textContent=`${fare} ج.م`;$('finish').classList.remove('hidden');beep(880,.35)}stopGroups[stopIndex].group.visible=false;stopGroups[stopIndex].persons.forEach(p=>p.visible=false);stopIndex++;dwell=0;updateHUD()}}else{dwell=0;if(target&&dist<25&&Math.abs(velocity)>3&&msgTimer<=0)msg('الموقف قرب! اهدى واقف عشان الركاب',2)}
  if(msgTimer>0){msgTimer-=dt;if(msgTimer<=0)$('message').classList.add('hidden')};drawMap();
 }
 wheelGroup.rotation.z=THREE.MathUtils.lerp(wheelGroup.rotation.z,-steering*.65,Math.min(1,dt*5));
 bus.updateMatrixWorld(true);
 if(firstPerson&&app.classList.contains('playing')){const eye=new THREE.Vector3(-.72,2.75,-2.05).applyMatrix4(bus.matrixWorld);camera.position.copy(eye);camera.rotation.set(0,heading,0)}else{const offset=new THREE.Vector3(0,8,18).applyAxisAngle(new THREE.Vector3(0,1,0),heading);camera.position.lerp(bus.position.clone().add(offset),Math.min(1,dt*4));camera.lookAt(bus.position.clone().add(new THREE.Vector3(0,1.7,0)))}
 sun.position.set(bus.position.x-70,120,bus.position.z+50);sun.target.position.copy(bus.position);sun.target.updateMatrixWorld();stopGroups.forEach((s,i)=>{if(s.group.visible)s.marker.material.color.setHex(i===stopIndex?0xe9c47b:0x879d91)});renderer.render(scene,camera)
}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
bus.position.set(5,0,35);camera.position.set(10,13,58);$('loading').classList.add('hidden');animate();
