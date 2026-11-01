import * as THREE from './vendor/three.module.js';

const $ = id => document.getElementById(id);
const game = $('game'), app = $('app');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  game.appendChild(renderer.domElement);
} catch(e) { $('loading').classList.add('hidden'); $('error').classList.remove('hidden'); throw e; }
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb7b2a0);
scene.fog = new THREE.Fog(0xb7b2a0, 80, 300);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 600);
const hemi = new THREE.HemisphereLight(0xe8e3c9, 0x655445, 2.05); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe1aa, 2.3); sun.position.set(-60, 100, 40); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-70;sun.shadow.camera.right=70;sun.shadow.camera.top=70;sun.shadow.camera.bottom=-70;sun.shadow.camera.far=250; sun.shadow.bias=-.0004; scene.add(sun); scene.add(sun.target);
const mat = (color, extra={}) => new THREE.MeshStandardMaterial({color,roughness:.9,...extra});
const M={road:mat(0x555851),side:mat(0xb7a58a), curb:mat(0xd0bea2), sand:mat(0xc2aa8b), white:mat(0xe6e0cc), blue:mat(0x315a69), dark:mat(0x293231), glass:mat(0x364d50,{roughness:.25,metalness:.15}), rubber:mat(0x202322), metal:mat(0x9a9e94,{metalness:.55,roughness:.35}), yellow:mat(0xdcb46e), green:mat(0x6b7955)};
function box(w,h,d,material,x=0,y=0,z=0,parent=scene){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
function cyl(rt,rb,h,material,x,y,z,parent=scene,seg=8){const o=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),material);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o}
function label(text, bg='#304a45', color='#f4dfad', width=512, height=160){const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,width,height);x.strokeStyle='rgba(255,255,255,.25)';x.lineWidth=5;x.strokeRect(6,6,width-12,height-12);x.fillStyle=color;x.textAlign='center';x.textBaseline='middle';x.font=`bold ${Math.floor(height*.42)}px Arial`;x.fillText(text,width/2,height/2);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide})}
function planeLabel(text,w,h,x,y,z,rot=0,bg){const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),label(text,bg));p.position.set(x,y,z);p.rotation.y=rot;scene.add(p);return p}
// Long, sun-faded avenue and pavements.
box(220,.2,1900,M.sand,0,-.3,-800);box(24,.15,1900,M.road,0,-.12,-800);
for(const side of [-1,1]) {box(5,.35,1900,M.side,side*14.5,.04,-800);box(.35,.4,1900,M.curb,side*12,.1,-800);}
for(let z=35;z>-1550;z-=12){box(.18,.025,5,M.white,0,.02,z);box(.12,.03,5,mat(0xa3a399),-6,.025,z);box(.12,.03,5,mat(0xa3a399),6,.025,z)}
let seed=762;function rnd(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646}function pick(a){return a[Math.floor(rnd()*a.length)]}
const wallColors=[0xb9a58f,0xc6b39b,0xa99582,0xd1bda3,0xa7a093,0xb6a891,0x978c80];
const awnings=[0x74594c,0x597c72,0x9d785a,0x817050,0x59717a];
const signs=['بقالة الحاج','فول وطعمية','كافيه البلد','أولاد البلد','عصير قصب','قطع غيار','مخبز بلدي','سوبر ماركت'];
function building(side,z,index){const w=10+rnd()*7, depth=11+rnd()*8, floors=3+Math.floor(rnd()*4), height=floors*3.8;const x=side*(18+w/2);const wall=mat(pick(wallColors));box(w,height,depth,wall,x,height/2,z);box(w+.4,.35,depth+.4,mat(0x8d8170),x,height,z);
 // Windows and balconies on street-facing facade
 for(let f=1;f<floors;f++){for(let q=-1;q<=1;q++){const zz=z+q*(depth*.28);const face=side*(18-.06);box(.12,1.55,1.35,M.glass,face,f*3.8+1.5,zz);box(.15,.12,1.55,M.curb,face-side*.08,f*3.8+.72,zz);if((f+q+index)%3===0){box(1.35,.18,2.4,M.curb,face-side*.65,f*3.8+.5,zz);box(.1,.65,2.4,M.metal,face-side*1.25,f*3.8+.9,zz)}}}
 // Ground level shop fronts, perpendicular to the road
 box(.15,2.7,depth*.7,mat(pick(awnings)),side*17.92,1.5,z); box(1.5,.17,depth*.75,mat(pick(awnings)),side*17.3,3.1,z);
 planeLabel(pick(signs),depth*.55,1.1,side*17.8,3.75,z,side*Math.PI/2, pick(['#405850','#76594b','#555a50','#766743']));
 // water tanks and dishes
 if(index%2===0){cyl(.8,.8,1.5,mat(0x4e504a),x,height+.8,z,scene,12);const dish=new THREE.Mesh(new THREE.SphereGeometry(.75,12,8,0,Math.PI*2,0,Math.PI/2),M.curb);dish.position.set(x+2,height+.8,z+2);dish.rotation.x=.8;scene.add(dish)}
}
for(let z=15,i=0;z>-1100;z-=16,i++){building(-1,z,i);building(1,z-7,i+2)}
function tree(x,z){cyl(.22,.32,4,mat(0x78654c),x,2,z);for(let i=0;i<4;i++){let leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(2+ rnd(),1),mat(pick([0x657451,0x74805a,0x596c50,0x80865e])));leaf.position.set(x+(rnd()-.5)*2,4.5+rnd()*2,z+(rnd()-.5)*2);leaf.castShadow=true;scene.add(leaf)}}
for(let z=-10;z>-1100;z-=39){tree(-15.2,z);if(rnd()>.45)tree(15.2,z-18);for(const side of [-1,1]){cyl(.08,.1,7,M.dark,side*12.9,3.5,z-14);box(1.1,.12,.15,M.dark,side*12.5,7,z-14);box(.5,.13,.3,M.yellow,side*12,6.9,z-14)}}
// Microbus assembled from individual parts so it remains readable while driving.
function vehicle(primary=M.white, stripe=M.blue, isBus=true){const g=new THREE.Group();const length=isBus?7.5:5.3;box(3.15,1.25,length,primary,0,1.55,0,g);box(3.0,1.35,length*.72,primary,0,2.7,isBus?.2:.3,g);box(3.2,.33,length+.05,stripe,0,1.64,0,g);box(3.03,.12,length*.73,M.curb,0,3.43,isBus?.2:.3,g);
 // windshield and rear window; bus front points toward negative z
 box(2.6,.9,.04,M.glass,0,2.75,-length*.37,g);box(2.55,.9,.04,M.glass,0,2.75,length*.37,g);
 for(const s of [-1,1]){for(let i=0;i<(isBus?3:2);i++){box(.04,.87,isBus?1.35:1.1,M.glass,s*1.51,2.75,-length*.24+i*(isBus?1.8:1.5),g)}for(const z of [-length*.31,length*.3]){const wheel=cyl(.63,.63,.3,M.rubber,s*1.58,.65,z,g,16);wheel.rotation.z=Math.PI/2;const hub=cyl(.27,.27,.32,M.metal,s*1.75,.65,z,g,12);hub.rotation.z=Math.PI/2}box(.1,.35,.5,M.dark,s*1.65,2.3,-length*.35,g)}
 box(2.7,.2,.15,M.metal,0,.95,length/2+.08,g);box(2.7,.2,.15,M.metal,0,.95,-length/2-.08,g);for(const s of [-1,1]){box(.5,.3,.06,mat(0xb14b3b),s*1.12,1.52,length/2+.04,g);box(.48,.3,.06,mat(0xf4dca5),s*1.1,1.52,-length/2-.04,g)}
 if(isBus){box(2.2,.38,.05,mat(0xe4d4a5),0,3.1,length*.37+.04,g);const lp=new THREE.Mesh(new THREE.PlaneGeometry(1.9,.32),label('إمبابة - التحرير','#e3d6b8','#263935'));lp.position.set(0,3.12,length*.37+.08);g.add(lp);box(1,.22,.07,M.yellow,0,1.17,length/2+.1,g)}return g}
const bus=vehicle();bus.position.set(3,0,20);scene.add(bus);
const traffic=[];const carColors=[0xe0ded0,0x78908b,0x9c6250,0xd2b382,0x737d7a];for(let i=0;i<8;i++){const v=vehicle(mat(pick(carColors)),mat(pick(carColors)),false);v.position.set(i%2?-5:7,0,-100-i*90);if(i%2)v.rotation.y=Math.PI;scene.add(v);traffic.push({mesh:v,oncoming:i%2===1,speed:9+rnd()*6})}
function person(x,z,shirt){const p=new THREE.Group();box(.65,1,.4,mat(shirt),0,1.45,0,p);cyl(.23,.23,.48,mat(0xb98764),0,2.15,0,p,10);box(.22,.8,.25,M.dark,-.18,.5,0,p);box(.22,.8,.25,M.dark,.18,.5,0,p);box(.18,.8,.2,mat(shirt),-.43,1.38,0,p);box(.18,.8,.2,mat(shirt),.43,1.38,0,p);p.position.set(x,0,z);scene.add(p);return p}
const stops=[{name:'موقف إمبابة',z:-110,people:2,desc:'لمّ أول ركاب من الموقف'}, {name:'شارع الوحدة',z:-300,people:3,desc:'استنى الركاب عند شارع الوحدة'}, {name:'ميدان الكيت كات',z:-500,people:3,desc:'آخر ركاب قبل نهاية الخط'}, {name:'محطة التحرير',z:-700,people:0,desc:'وصّل الركاب لنهاية المشوار'}];
const stopGroups=[];stops.forEach((s,i)=>{const group=new THREE.Group();scene.add(group);const marker=new THREE.Mesh(new THREE.TorusGeometry(4,.1,8,40),new THREE.MeshBasicMaterial({color:0xe9c47b}));marker.rotation.x=Math.PI/2;marker.position.set(5,.12,s.z);group.add(marker);box(.25,4,.25,M.dark,11.1,2,s.z,group);box(2.4,1.4,.15,M.blue,11.1,4.4,s.z,group);const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.1,1.1),label('موقف','#315a69','#fff1c8'));sign.position.set(11.1,4.4,s.z+.1);group.add(sign);let persons=[];for(let p=0;p<Math.max(2,s.people);p++)persons.push(person(13+(p%2)*1.1,s.z+p*1.3,pick([0x647a78,0x9d705c,0xd4c4a7,0x586678])));stopGroups.push({group,persons,marker})});
// overhead utility wires are a familiar part of the street silhouette
for(let side of [-1,1])for(let z=0;z>-1100;z-=40){cyl(.09,.12,9,mat(0x5c5a50),side*16,4.5,z);const wire=box(.035,.035,40,M.dark,side*16,8.6,z-20);wire.castShadow=false}
let playing=false, finished=false, velocity=0, stopIndex=0, passengerCount=0, fare=0, dwell=0, hitCooldown=0, sound=false, audioCtx, msgTimer=0;
const keys={up:false,down:false,left:false,right:false,brake:false};
function msg(text,time=3){$('message').textContent=text;$('message').classList.remove('hidden');msgTimer=time}
function beep(freq=440,duration=.12){if(!sound)return;try{audioCtx ||= new AudioContext();if(audioCtx.state==='suspended')audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.045,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration)}catch(e){}}
function start(){playing=true;finished=false;velocity=0;stopIndex=0;passengerCount=0;fare=0;dwell=0;bus.position.set(3,0,20);bus.rotation.y=0;traffic.forEach((c,i)=>{c.mesh.position.z=-100-i*90});stopGroups.forEach(s=>{s.group.visible=true;s.persons.forEach(p=>p.visible=true)});$('intro').classList.add('hidden');$('sceneCaption').classList.add('hidden');$('edition').classList.add('hidden');$('finish').classList.add('hidden');$('hud').classList.remove('hidden');app.classList.add('playing');updateHUD();msg('يلا يا أسطى! دوس بنزين واتجه للموقف',4);beep(550)}
$('startBtn').addEventListener('click',start);$('restartBtn').addEventListener('click',start);
$('soundBtn').addEventListener('click',()=>{sound=!sound;$('soundText').textContent=sound?'الصوت شغال':'الصوت مغلق';$('soundBtn').setAttribute('aria-label',sound?'إغلاق الصوت':'تشغيل الصوت');if(sound)beep(600)});
const map={ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',' ':'brake'};
window.addEventListener('keydown',e=>{if(map[e.key]){e.preventDefault();keys[map[e.key]]=true}});window.addEventListener('keyup',e=>{if(map[e.key]){e.preventDefault();keys[map[e.key]]=false}});window.addEventListener('blur',()=>Object.keys(keys).forEach(k=>keys[k]=false));
document.querySelectorAll('[data-key]').forEach(b=>{const key=b.dataset.key;const release=e=>{e.preventDefault();keys[key]=false;b.classList.remove('pressed')};b.addEventListener('pointerdown',e=>{e.preventDefault();keys[key]=true;b.classList.add('pressed');b.setPointerCapture(e.pointerId)});b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',()=>{keys[key]=false;b.classList.remove('pressed')})});
function updateHUD(){const s=stops[Math.min(stopIndex,3)];$('stopName').textContent=s.name;$('stopDesc').textContent=s.desc;document.querySelector('.route-no').textContent=`0${Math.min(stopIndex+1,4)} / 04`;$('passengers').innerHTML=`${passengerCount} <small>/ 8</small>`;$('fare').innerHTML=`${fare} <small>ج.م</small>`;$('routeProgress').style.width=`${stopIndex/4*100}%`;}
const clock=new THREE.Clock();let introTime=0;
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);introTime+=dt;
 if(playing&&!finished){
  if(keys.up)velocity+=14*dt;else velocity-=4*dt;if(keys.down||keys.brake)velocity-=28*dt;velocity=THREE.MathUtils.clamp(velocity,0,28);
  const steer=(keys.left?-1:0)+(keys.right?1:0);bus.position.x=THREE.MathUtils.clamp(bus.position.x+steer*dt*(3+velocity*.22),-10.2,10.2);bus.rotation.y=THREE.MathUtils.lerp(bus.rotation.y,-steer*.13,dt*5);bus.position.z-=velocity*dt;
  hitCooldown=Math.max(0,hitCooldown-dt);
  traffic.forEach(c=>{c.mesh.position.z+=(c.oncoming?c.speed:-c.speed*.35)*dt;if(c.mesh.position.z>bus.position.z+45)c.mesh.position.z=bus.position.z-480;if(c.mesh.position.z<bus.position.z-520)c.mesh.position.z=bus.position.z-380;if(hitCooldown===0&&Math.abs(c.mesh.position.z-bus.position.z)<5.3&&Math.abs(c.mesh.position.x-bus.position.x)<2.9){velocity*=.25;hitCooldown=2;msg('بالراحة يا أسطى! خلي بالك من الطريق',2.5);beep(160,.3)}});
  const target=stops[stopIndex];let dist=Math.max(0,Math.round(bus.position.z-target.z));$('distance').textContent=`${dist} م`;$('speed').textContent=Math.round(velocity*3);document.querySelectorAll('.speed-bars i').forEach((b,i)=>b.classList.toggle('on',i<velocity/2.8));
  if(Math.abs(bus.position.z-target.z)<13&&velocity<4){dwell+=dt;if(dwell>1.1){if(stopIndex<3){passengerCount+=target.people;fare+=target.people*15;msg(`تمام! ركب ${target.people} من الركاب. كمل مشوارك`,3);beep(740,.2)}else{fare+=0;finished=true;playing=false;$('finalFare').textContent=`${fare} ج.م`;$('finish').classList.remove('hidden');beep(880,.35)}stopGroups[stopIndex].group.visible=false;stopGroups[stopIndex].persons.forEach(p=>p.visible=false);stopIndex++;dwell=0;updateHUD()}}else{dwell=0;if(dist<30&&dist>0&&velocity>5&&msgTimer<=0)msg('الموقف قرب! هدي واقف عشان الركاب',2)}
  // If a stop is missed, gently return the vehicle to its approach so every trip remains completable.
  if(stopIndex<4&&bus.position.z<stops[stopIndex].z-18){bus.position.z=stops[stopIndex].z+35;velocity=0;msg('فاتك الموقف! ارجع قرّب منه واهدَى',3)}
  if(msgTimer>0){msgTimer-=dt;if(msgTimer<=0)$('message').classList.add('hidden')}
 } else if(!finished){bus.rotation.y=Math.sin(introTime*.3)*.025}
 const desired=new THREE.Vector3(bus.position.x*.45,12.5,bus.position.z+25);camera.position.lerp(desired,playing?.07:.025);camera.lookAt(bus.position.x*.35,2.4,bus.position.z-28);sun.position.set(bus.position.x-60,100,bus.position.z+40);sun.target.position.set(bus.position.x,0,bus.position.z-20);sun.target.updateMatrixWorld();
 stopGroups.forEach((s,i)=>{if(s.group.visible)s.marker.material.color.setHex(i===stopIndex?0xe9c47b:0x96a794)});renderer.render(scene,camera)
}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
camera.position.set(4,13,45);$('loading').classList.add('hidden');animate();
