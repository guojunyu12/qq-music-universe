import * as THREE from 'three';
import { setupSmoothScroll, gsap, ScrollTrigger } from './scroll-motion.js?v=editorial-4';
import { createTypeStage } from './type-stage.js?v=editorial-4';
import { createPortrait } from './portrait.js?v=tempo-14';
import { createDesignedStage } from './stage-design.js?v=portrait-10';
import { themes } from './theme.js?v=editorial-4';
import { trackAsset, assetsReady } from './loading.js?v=editorial-4';
import { clamp, chapterPosition, smoothStep, damp } from './scene-math.js?v=editorial-4';

const $ = selector => document.querySelector(selector);
const chapters = [...document.querySelectorAll('.chapter')];
const chapterNames = ['音乐现场', '播放与歌词', '发现好音乐', '沉浸音质', '个性播放器', '继续聆听'];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const audio = $('#music');
let audioContext, analyser, audioData, audioBusy = false, noticeTimer;
function notify(message) {
  $('#notice').textContent = message;
  $('#notice').classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('#notice').classList.remove('visible'), 4200);
}
function soundState() {
  const playing = !audio.paused;
  $('#sound').setAttribute('aria-pressed', String(playing));
  $('#sound').setAttribute('aria-label', playing ? '关闭音乐' : '开启音乐');
  $('#sound-label').textContent = playing ? '声音已开启' : '开启声音';
  $('.sound-invite').firstChild.textContent = playing ? '关闭声音 ' : '开启声音，感受舞台 ';
}
let autoMusicPending = false;
function connectAudio() {
  if (audioContext) return;
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024; analyser.smoothingTimeConstant = .8;
  const source = audioContext.createMediaElementSource(audio);
  source.connect(analyser); analyser.connect(audioContext.destination);
  audioData = new Uint8Array(analyser.frequencyBinCount);
}
function bandEnergy(lowHz,highHz){
  const resolution=audioContext.sampleRate/analyser.fftSize;
  const start=Math.max(1,Math.floor(lowHz/resolution)),end=Math.min(audioData.length,Math.ceil(highHz/resolution));
  let energy=0;for(let i=start;i<end;i++)energy+=audioData[i];
  return end>start?energy/((end-start)*255):0;
}
async function startAudio(automatic = false) {
  if (audioBusy || !audio.paused) return;
  audioBusy = true; $('#sound').disabled = true;
  try {
    audio.volume = .35;
    if (!automatic) { connectAudio(); await audioContext.resume(); }
    await audio.play();
    connectAudio();
    if (automatic) audioContext.resume().catch(() => {});
    autoMusicPending = false;
  } catch (error) {
    if (automatic && error.name === 'NotAllowedError') {
      $('#sound-label').textContent = '点击开启声音';
      $('#sound').setAttribute('aria-label', '点击开启音乐');
      $('#sound').dataset.autoplay = 'blocked';
    } else {
      notify('音乐暂时无法播放，请点击声音按钮重试。');
      console.error('Audio playback failed:', error);
    }
  } finally {
    audioBusy = false; $('#sound').disabled = false;
    if (!audio.paused) soundState();
  }
}
function toggleAudio() {
  autoMusicPending = false;
  if (!audio.paused) audio.pause(); else startAudio();
}
$('#sound').addEventListener('click', toggleAudio);
$('.sound-invite').addEventListener('click', toggleAudio);
document.addEventListener('click', event => {
  if (event.target.closest('#sound, .sound-invite')) return;
  if (autoMusicPending) startAudio();
  else if (!audio.paused && audioContext?.state === 'suspended') audioContext.resume();
}, { capture: true });
document.addEventListener('keydown', event => {
  if (autoMusicPending && ['Enter', ' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) startAudio();
});
audio.addEventListener('play', soundState);
audio.addEventListener('pause', soundState);
audio.addEventListener('error', () => { autoMusicPending = false; soundState(); notify('配乐文件加载失败，请检查网络后重试。'); });
trackAsset(document.fonts.ready);
trackAsset(new Promise(resolve=>{if(audio.readyState>=2)return resolve();let timeout=setTimeout(done,12000);function done(){clearTimeout(timeout);audio.removeEventListener('loadeddata',done);audio.removeEventListener('error',done);resolve();}audio.addEventListener('loadeddata',done,{once:true});audio.addEventListener('error',done,{once:true});audio.load();}));
function enter(withSound){
  if(document.body.classList.contains('entered'))return;
  if(withSound)startAudio();else audio.pause();
  document.body.classList.add('entered');document.dispatchEvent(new CustomEvent('music-enter'));
  gsap.to('#loading',reducedMotion.matches?{opacity:0,duration:.3,onComplete:()=>$('#loading').classList.add('done')}:{clipPath:'inset(0 0 100% 0)',duration:.9,ease:'expo.inOut',onComplete:()=>$('#loading').classList.add('done')});
  ScrollTrigger.refresh();measure();
}
$('#enter-sound').addEventListener('click',()=>enter(true));$('#enter-muted').addEventListener('click',()=>enter(false));
$('#index-button').addEventListener('click',()=>$('#index-dialog').showModal());
$('#index-dialog').querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>$('#index-dialog').close()));

const galleryItems = [
  ['横屏模式 · AI 陪伴相框', '用 AI 创意定制横屏陪伴，给音乐一个温暖的画面。'],
  ['AI 播放器 · 随心定制', '从复古唱片到创意外观，让播放器拥有你的模样。'],
  ['横屏模式 · 炫彩粒子', '官方横屏歌词与粒子展示，感受音乐的视觉表达。'],
  ['魔性语音', '让评论化作旋律，探索声音表达的新玩法。'],
  ['AI 助手 · 识图推歌', '通过画面寻找音乐，让此刻的氛围有自己的 BGM。'],
  ['评论区发语音', '用语音传递听歌心情，让交流不止于文字。']
];
let galleryIndex = 0, galleryWheelTotal = 0, galleryWheelAt = 0, galleryWheelChangedAt = -500;
const galleryDots = galleryItems.map(([title],index) => {
  const dot=document.createElement('button');dot.type='button';dot.className='gallery-dot';dot.setAttribute('aria-label',`查看${title}`);dot.addEventListener('click',()=>showGallery(index));$('#gallery-dots').appendChild(dot);return dot;
});
function showGallery(index) {
  galleryIndex = (index + galleryItems.length) % galleryItems.length;
  galleryWheelTotal = 0;
  $('#gallery-img').src = `assets/official-${galleryIndex + 1}.webp`;
  $('#gallery-img').alt = `QQ音乐官方宣传图：${galleryItems[galleryIndex][0]}`;
  $('#gallery-title').textContent = galleryItems[galleryIndex][0];
  $('#gallery-description').textContent = galleryItems[galleryIndex][1];
  galleryDots.forEach((dot,i)=>{const selected=i===galleryIndex;dot.classList.toggle('active',selected);dot.setAttribute('aria-pressed',String(selected));});
  if (!$('#gallery').open) $('#gallery').showModal();
}
document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => showGallery(Number(button.dataset.open))));
document.querySelector('.gallery-image').addEventListener('wheel',event=>{
  if(!$('#gallery').open||event.ctrlKey)return;
  event.preventDefault();event.stopPropagation();
  const now=performance.now();
  if(now-galleryWheelChangedAt<400)return;
  if(now-galleryWheelAt>250)galleryWheelTotal=0;
  galleryWheelAt=now;
  const unit=event.deltaMode===1?16:event.deltaMode===2?innerHeight:1;
  galleryWheelTotal+=(Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY)*unit;
  if(Math.abs(galleryWheelTotal)>=60){
    const direction=Math.sign(galleryWheelTotal);galleryWheelChangedAt=now;showGallery(galleryIndex+direction);
  }
},{passive:false});
$('#gallery').addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') showGallery(galleryIndex + 1);
  if (e.key === 'ArrowLeft') showGallery(galleryIndex - 1);
});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) dialog.close();
  });
});


let offsets = [], currentChapter = -1, scrollPosition = 0;
function measure() { offsets = chapters.map(el => el.offsetTop); updateScroll(); }
function updateScroll() {
  scrollPosition = chapterPosition(window.scrollY, offsets);
  const index = clamp(Math.floor(scrollPosition+.08), 0, chapters.length - 1);
  const progress = clamp(window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight), 0, 1);
  $('#progress').style.transform = `scaleX(${progress})`;
  if (index === currentChapter) return;
  currentChapter = index;
  $('#chapter-label').textContent = chapterNames[index];
  $('#header-chapter').textContent = chapterNames[index];
  document.querySelectorAll('.chapter-rail a').forEach((a, i) => {
    a.classList.toggle('active', i === index);
    if (i === index) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('.nav a').forEach((a, i) => a.classList.toggle('active', i === (index === 0 || index === 5 ? 0 : index === 4 ? 2 : 1)));
}
window.addEventListener('scroll', updateScroll, { passive: true });
window.addEventListener('resize', measure);
measure();
setupSmoothScroll(chapters);
$('#stage').prepend($('#portrait'));
let typeStage = createTypeStage(chapters, reducedMotion);
ScrollTrigger.addEventListener('refresh',measure);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (error) {
  $('#fallback').hidden = false;
  $('#portrait').classList.add('static-portrait');

  console.error('WebGL unavailable:', error);
}
if (renderer) buildSpace();
assetsReady().then(()=>{ScrollTrigger.refresh();measure();});

function buildSpace() {
  const mount = $('#space');
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  mount.appendChild(renderer.domElement);
  mount.tabIndex = 0;
  mount.setAttribute('role', 'region');
  mount.setAttribute('aria-label', '音乐空间。移动鼠标体验人物视差；拖动或方向键微调镜头，Escape 重置。');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07120d');
  scene.fog = new THREE.FogExp2('#07120d', .022);
  const camera = new THREE.PerspectiveCamera(39, innerWidth / innerHeight, .1, 100);
  const world = new THREE.Group(); world.position.x = 2.25; scene.add(world);
  scene.add(new THREE.HemisphereLight(0xc9ffee, 0x16331c, 2.8));
  const key = new THREE.DirectionalLight(0xffffff, 3.8); key.position.set(-3, 7, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x31c27c, 4); rim.position.set(4, 3, -4); scene.add(rim);
  const warm = new THREE.PointLight(0xe4ffc6, 20, 15, 2); warm.position.set(0, 5, 3); world.add(warm);

  const dark=new THREE.MeshStandardMaterial({color:'#0d1811',roughness:.3,metalness:.8});
  function mesh(geometry,material,parent,x=0,y=0,z=0){const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);parent.add(object);return object;}
  const designedStage=createDesignedStage(scene,world,reducedMotion);
  let portrait = null;
  trackAsset(createPortrait($('#portrait'), reducedMotion)).then(result => { portrait = result; window.__portrait=result; designedStage.setPortrait(result.image,result.depth); })
    .catch(error => { console.error('Portrait depth effect unavailable:', error); $('#portrait').classList.add('static-portrait'); });

  const floaters=[];
  const textureLoader=new THREE.TextureLoader();
  function phone(imageIndex,x,y,z,angle,scale=1) {
    const group=new THREE.Group();group.position.set(x,y,z);group.rotation.set(-.04,angle,.06);group.scale.setScalar(scale);world.add(group);
    mesh(new THREE.BoxGeometry(1.05,2.24,.07),dark,group);
    const screen=mesh(new THREE.PlaneGeometry(.99,2.14),new THREE.MeshBasicMaterial({color:'#d9efe2'}),group,0,0,.04);
    trackAsset(textureLoader.loadAsync(`assets/official-${imageIndex}.webp`)).then(texture=>{texture.colorSpace=THREE.SRGBColorSpace;screen.material.map=texture;screen.material.needsUpdate=true;}).catch(()=>console.warn('Official image unavailable',imageIndex));
    const border= new THREE.EdgesGeometry(new THREE.BoxGeometry(1.06,2.25,.075));
    group.add(new THREE.LineSegments(border,new THREE.LineBasicMaterial({color:'#31c27c',transparent:true,opacity:.35})));
    group.userData.base={x,y,z,angle};floaters.push(group);return group;
  }
  const playerPhone=phone(2,1.0,2.0,1.5,-.25,1.3);
  const discoverPhone=phone(5,1.55,2.2,-.1,-.16,1.15);
  const personalPhone=phone(1,-1,2.3,1.2,.15,.95);
  playerPhone.visible=discoverPhone.visible=personalPhone.visible=false;
  const themeColor=new THREE.Color(themes[document.body.dataset.theme].accent),backgroundColor=new THREE.Color(themes[document.body.dataset.theme].background);
  window.addEventListener('music-theme',event=>{themeColor.set(event.detail.accent);backgroundColor.set(event.detail.background);});
  const stagePointer=new THREE.Vector2();window.addEventListener('pointermove',event=>{stagePointer.set(event.clientX/innerWidth*2-1,1-event.clientY/innerHeight*2);},{passive:true});

  let drag=false, pointerStart=null, dragX=0, dragY=0, lastInteraction=0;
  window.addEventListener('pointerdown',e=>{
    if(e.target.closest('a,button,dialog')||smoothedPosition>1)return;
    if(e.button!==0||document.querySelector('dialog[open]'))return;
    drag=true;pointerStart={x:e.clientX,y:e.clientY};mount.setPointerCapture(e.pointerId);lastInteraction=performance.now();
  });
  mount.addEventListener('pointermove',e=>{
    if(!drag||!pointerStart)return;
    dragX=clamp(dragX+(e.clientX-pointerStart.x)*.001,-.12,.12);dragY=clamp(dragY+(e.clientY-pointerStart.y)*.001,-.08,.08);
    pointerStart={x:e.clientX,y:e.clientY};lastInteraction=performance.now();
  });
  function release(){drag=false;pointerStart=null;lastInteraction=performance.now();}
  mount.addEventListener('pointerup',release);mount.addEventListener('pointercancel',release);mount.addEventListener('lostpointercapture',release);
  function resetView(){dragX=dragY=0;lastInteraction=0;}
  $('#reset-view').addEventListener('click',resetView);
  mount.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(e.key))return;
    e.preventDefault();lastInteraction=performance.now();
    if(e.key==='ArrowLeft')dragX=clamp(dragX-.03,-.12,.12);if(e.key==='ArrowRight')dragX=clamp(dragX+.03,-.12,.12);
    if(e.key==='ArrowUp')dragY=clamp(dragY-.1,-.35,.5);if(e.key==='ArrowDown')dragY=clamp(dragY+.1,-.35,.5);
    if(e.key==='Escape')resetView();
  });
  const frames=[
    {pos:[0,3.6,11.4],look:[0,1.6,0]},
    {pos:[-.7,3.3,9],look:[.25,1.8,.2]},
    {pos:[1.7,3.1,9.7],look:[.9,1.7,0]},
    {pos:[-1.2,4.4,10.1],look:[.3,1.65,0]},
    {pos:[.6,3.3,10],look:[.3,1.8,.3]},
    {pos:[-2,5.4,14],look:[.15,1.5,0]}
  ];
  camera.position.fromArray(frames[0].pos);
  const lookAt=new THREE.Vector3(...frames[0].look),desiredPosition=new THREE.Vector3(),desiredLook=new THREE.Vector3(),orbitOffset=new THREE.Vector3();
  let lastTime=performance.now(),time=0,smoothedPosition=scrollPosition,bass=0,mid=0,high=0,frameId;
  window.__musicSpace={ready:false,model:'参考人物图与 AI 深度视差（MVP）',getState:()=>({chapter:currentChapter,scroll:scrollPosition,dragX,dragY,audioPlaying:!audio.paused,audioTime:audio.currentTime,bass,frames:renderer.info.render.calls,theme:themeColor.getHexString()})};
  function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  window.addEventListener('resize',resize);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frameId);audio.pause();$('#fallback').hidden=false;});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{location.reload();});
  function animate(now) {
    const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
    if(!reducedMotion.matches)time+=dt;
    typeStage.update(scrollPosition, dt, now);
    smoothedPosition=reducedMotion.matches?scrollPosition:damp(smoothedPosition,scrollPosition,5,dt);
    const index=clamp(Math.floor(smoothedPosition),0,frames.length-2),t=smoothStep(smoothedPosition-index);
    desiredPosition.fromArray(frames[index].pos).lerp(new THREE.Vector3(...frames[index+1].pos),t);
    desiredLook.fromArray(frames[index].look).lerp(new THREE.Vector3(...frames[index+1].look),t);
    if(innerWidth<700){desiredPosition.set(2.2,3.5,12);desiredLook.set(2.2,4.2,0);}
    if(!drag&&now-lastInteraction>1000){dragX=damp(dragX,0,1.8,dt);dragY=damp(dragY,0,1.8,dt);}
    const radius=desiredPosition.distanceTo(desiredLook),phi=dragX+(reducedMotion.matches?0:smoothedPosition*.16);
    const elevation=Math.asin(clamp((desiredPosition.y-desiredLook.y)/radius,-1,1))+dragY;
    orbitOffset.set(Math.sin(phi)*Math.cos(elevation)*radius,Math.sin(elevation)*radius,Math.cos(phi)*Math.cos(elevation)*radius);
    camera.position.copy(desiredLook).add(orbitOffset);lookAt.copy(desiredLook);camera.lookAt(lookAt);
    if(analyser&&!audio.paused){analyser.getByteFrequencyData(audioData);const energy=bandEnergy(40,250);bass=damp(bass,energy,12,dt);}else bass=damp(bass,0,8,dt);
    const isPlayer=smoothedPosition>.95&&smoothedPosition<1.85,isDiscover=Math.abs(smoothedPosition-2)<.7,isPersonal=Math.abs(smoothedPosition-4)<.7;
    playerPhone.visible=isPlayer;discoverPhone.visible=isDiscover;personalPhone.visible=isPersonal;

    if(analyser&&!audio.paused){mid=bandEnergy(250,2000);high=bandEnergy(2000,8000);}else{mid=high=0;}
    if(portrait)portrait.update(smoothedPosition,dt,{bass,mid,high,energy:(bass+mid+high)/3,playing:!audio.paused});
    designedStage.update({time,bass,mid,high,color:themeColor,pointer:reducedMotion.matches?{x:0,y:0}:stagePointer,dt});
    scene.background.lerp(backgroundColor,1-Math.exp(-dt*3));scene.fog.color.copy(scene.background);
    const entrance=smoothStep((smoothedPosition-.2)/.8);
    mount.style.opacity = String(1-.75*smoothStep(smoothedPosition/.9));
    playerPhone.position.x=1+(1-entrance)*1.7;
    playerPhone.position.z=1.5-(1-entrance)*3;
    playerPhone.scale.setScalar(.05+entrance*1.25);
    playerPhone.rotation.y=-.25+(1-entrance)*.7;
    floaters.forEach((f,i)=>{f.position.y=f.userData.base.y+Math.sin(time*.7+i*1.5)*.045;f.rotation.z=.035+Math.sin(time*.4+i)*.018;});
    rim.color.lerp(themeColor,1-Math.exp(-dt*3));rim.intensity=2.6+bass;
    renderer.render(scene,camera);
    frameId=requestAnimationFrame(animate);
  }
  renderer.render(scene,camera);
  window.__musicSpace.ready=true;

  frameId=requestAnimationFrame(animate);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancelAnimationFrame(frameId);audio.pause();}
    else{lastTime=performance.now();frameId=requestAnimationFrame(animate);}
  });
}
