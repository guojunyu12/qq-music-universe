import * as THREE from 'three';
import { clamp,damp,smoothStep } from './scene-math.js?v=editorial-4';
import { gazeFiles,gazeIndex,gazeCoordinates,springStep } from './gaze-math.js?v=portrait-9';
import { trackAsset } from './loading.js?v=editorial-4';

export const portraitAssets={
 atlas:'assets/portrait/head-atlas.webp',meta:'assets/portrait/head-atlas.json',blink:'assets/portrait/head-blink.webp',mask:'assets/portrait/head-mask.png',
 hair:'assets/portrait/hair-mask.png',skirt:'assets/portrait/skirt-mask.png',necklace:'assets/portrait/necklace-mask.png',track:'assets/portrait/body-head-track.json',
 still:'assets/raw/绿幕图/g05-正视.png',depth:'assets/portrait-depth.png',
 calm:'assets/portrait/body-calm',peak:'assets/portrait/body-peak'
};

function loadVideo(base){
 const video=document.createElement('video');video.muted=true;video.defaultMuted=true;video.playsInline=true;video.loop=true;video.preload='auto';
 const webm=video.canPlayType('video/webm; codecs="vp9"');video.src=base+(webm?'.webm?v=portrait-10':'.mp4?v=portrait-10');
 const ready=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>finish(new Error('Portrait video load timed out')),12000);
  const finish=error=>{clearTimeout(timer);video.removeEventListener('loadeddata',onLoad);video.removeEventListener('error',onError);error?reject(error):resolve(video);};
  const onLoad=()=>finish(),onError=()=>finish(new Error('Portrait video unavailable'));
  video.addEventListener('loadeddata',onLoad,{once:true});video.addEventListener('error',onError,{once:true});video.load();
 });return {video,ready};
}
const json=async path=>{const response=await fetch(path);if(!response.ok)throw new Error(`Portrait data ${response.status}`);return response.json();};

export async function createPortrait(mount,reducedMotion){
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));renderer.outputColorSpace=THREE.SRGBColorSpace;mount.appendChild(renderer.domElement);
 const loader=new THREE.TextureLoader();
 const texture=async(path,color=false)=>{const t=await trackAsset(loader.loadAsync(path));if(color)t.colorSpace=THREE.SRGBColorSpace;return t;};
 const [image,depth]=await Promise.all([texture(portraitAssets.still,true),texture(portraitAssets.depth)]);
 let atlas,meta,blink,mask,hair,skirt,necklace,track,legacy=[];
 try{
  [atlas,meta,blink,mask,hair,skirt,necklace,track]=await Promise.all([
   texture(portraitAssets.atlas,true),trackAsset(json(portraitAssets.meta)),texture(portraitAssets.blink,true),texture(portraitAssets.mask),texture(portraitAssets.hair),texture(portraitAssets.skirt),texture(portraitAssets.necklace),trackAsset(json(portraitAssets.track))
  ]);
  if(meta.columns!==9||meta.rows!==3||meta.tileSize!==384)throw new Error('Unexpected portrait atlas layout');
 }catch(error){
  console.warn('Portrait atlas unavailable; using original nine gaze images',error);
  atlas=null;
  legacy=await Promise.all(gazeFiles.map(async file=>{
   const source=await trackAsset(new THREE.ImageLoader().loadAsync(`assets/gaze/${encodeURIComponent(file)}`));
   const canvas=document.createElement('canvas');canvas.width=canvas.height=512;canvas.getContext('2d').drawImage(source,source.width*.32,source.height*.10,source.width*.48,source.height*.34,0,0,512,512);
   const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
  }));
 }
 const videos={};let videoFailed=false;
 if(atlas&&!reducedMotion.matches){
  for(const name of ['calm','peak']){
   const resource=loadVideo(portraitAssets[name]);
   try{await trackAsset(resource.ready);const t=new THREE.VideoTexture(resource.video);t.colorSpace=THREE.SRGBColorSpace;videos[name]={...resource,texture:t,failed:false};resource.video.className='portrait-source';resource.video.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';resource.video.setAttribute('aria-hidden','true');resource.video.tabIndex=-1;mount.appendChild(resource.video);}
   catch(error){resource.video.pause();resource.video.removeAttribute('src');resource.video.load();console.warn(`Portrait ${name} video fallback`,error);if(name==='calm')videoFailed=true;}
  }
 }
 // Atlas cells and matte edges must never borrow neighboring pixels through mipmaps.
 for(const t of [atlas,blink,mask,...legacy].filter(Boolean)){t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.needsUpdate=true;}
 const placeholder=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);placeholder.needsUpdate=true;
 const uniforms={uImage:{value:image},uDepth:{value:depth},uBody:{value:videos.calm?.texture||image},uPeak:{value:videos.peak?.texture||image},
 uAtlas:{value:atlas||placeholder},uBlink:{value:blink||placeholder},uMask:{value:mask||placeholder},uHair:{value:hair||placeholder},uSkirt:{value:skirt||placeholder},uNecklace:{value:necklace||placeholder},
 uFit:{value:new THREE.Vector2(1,1)},uOffset:{value:new THREE.Vector2()},uPointer:{value:new THREE.Vector2()},uGrid:{value:new THREE.Vector2(4,1)},uHeadInv:{value:new THREE.Matrix3()},uCrop:{value:new THREE.Vector4(.32,.56,.48,.34)},
 uZoom:{value:1},uCard:{value:0},uBackdrop:{value:new THREE.Color('#0b1610')},uTime:{value:0},uWind:{value:1},uKick:{value:0},uEnergy:{value:0},uShine:{value:-1},uBlinkAmount:{value:0},uVideo:{value:videos.calm?1:0},uPeakMix:{value:0},uFrom:{value:4},uTo:{value:4},uBlend:{value:1}};
 if(meta){const c=meta.crop;uniforms.uCrop.value.set(c.left,1-c.top-c.height,c.width,c.height);}
 legacy.forEach((t,i)=>uniforms[`uHead${i}`]={value:t});
 const headCode=atlas?`
 vec3 atlasCell(vec2 cell,vec2 h){vec2 safe=clamp(h,vec2(.5/384.),vec2(383.5/384.));return texture2D(uAtlas,(vec2(cell.x,2.-cell.y)+safe)/vec2(9.,3.)).rgb;}
 vec3 headColor(vec2 h){vec2 c=min(floor(uGrid),vec2(7.,1.)),f=uGrid-c;vec3 top=mix(atlasCell(c,h),atlasCell(c+vec2(1.,0.),h),f.x);vec3 bottom=mix(atlasCell(c+vec2(0.,1.),h),atlasCell(c+vec2(1.,1.),h),f.x);return mix(mix(top,bottom,f.y),texture2D(uBlink,h).rgb,uBlinkAmount);}
 `:`vec3 head(int i,vec2 h){${legacy.map((_,i)=>`if(i==${i})return texture2D(uHead${i},h).rgb;`).join('')}return texture2D(uHead4,h).rgb;}vec3 headColor(vec2 h){return mix(head(uFrom,h),head(uTo,h),uBlend);}`;
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:`uniform sampler2D uImage,uDepth,uBody,uPeak,uAtlas,uBlink,uMask,uHair,uSkirt,uNecklace${legacy.map((_,i)=>',uHead'+i).join('')};
 uniform vec2 uFit,uOffset,uPointer,uGrid;uniform vec4 uCrop;uniform mat3 uHeadInv;uniform float uZoom,uCard,uTime,uWind,uKick,uEnergy,uShine,uBlinkAmount,uVideo,uPeakMix,uBlend;uniform int uFrom,uTo;uniform vec3 uBackdrop;varying vec2 vUv;
 vec3 mod289(vec3 x){return x-floor(x/289.)*289.;}vec2 mod289(vec2 x){return x-floor(x/289.)*289.;}vec3 permute(vec3 x){return mod289((x*34.+1.)*x);}
 float snoise(vec2 v){const vec4 C=vec4(.2113248654,.3660254038,-.5773502692,.0243902439);vec2 i=floor(v+dot(v,C.yy)),x0=v-i+dot(i,C.xx);vec2 i1=x0.x>x0.y?vec2(1.,0.):vec2(0.,1.);vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);m=m*m;m=m*m;vec3 x=2.*fract(p*C.www)-1.,h=abs(x)-.5,ox=floor(x+.5),a0=x-ox;m*=1.792842914-.853734721*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.*dot(m,g);}
 float key(vec3 color){color/=max(max(color.r,max(color.g,color.b)),.001);vec2 cbcr=vec2(dot(color,vec3(-.169,-.331,.5)),dot(color,vec3(.5,-.419,-.081)));float distance=length(cbcr-vec2(-.331,-.419));return smoothstep(.10,.24,distance);}
 ${headCode}
 void main(){vec2 origin=(vUv-.5)/uZoom*uFit+.5+uOffset,uv=origin;
 for(int i=0;i<6;i++){float d=texture2D(uDepth,clamp(uv,.002,.998)).r;uv=origin+uPointer*vec2(.018,.009)*(d-.3);}
 if(origin.x<0.||origin.x>1.||origin.y<0.||origin.y>1.){gl_FragColor=vec4(uBackdrop,uCard);
 #include <colorspace_fragment>
 return;}
 float hm=texture2D(uHair,uv).r,sm=texture2D(uSkirt,uv).r;
 float wave=snoise(uv*3.+uTime*.6)*.004+uKick*.012*sin(uv.y*20.+uTime*8.);
 vec2 bodyUv=uv+vec2(clamp((hm*2.+sm)*wave*uWind,-.018,.018),clamp((hm+sm)*wave*uWind*.12,-.002,.002));
 vec3 body=mix(sRGBTransferEOTF(texture2D(uBody,bodyUv)).rgb,sRGBTransferEOTF(texture2D(uPeak,bodyUv)).rgb,uPeakMix);vec3 color=mix(texture2D(uImage,bodyUv).rgb,body,uVideo);float alpha=key(color);
 vec2 ref=(uHeadInv*vec3(uv.x,1.-uv.y,1.)).xy;ref.y=1.-ref.y;vec2 headUv=(ref-uCrop.xy)/uCrop.zw;
 // Sample unconditionally: divergent UV-bound branches leave texture derivatives
 // undefined at the rectangle edge. The explicit zero border also rejects any
 // atlas/key spill, so the crop itself can never draw a frame around the person.
 vec2 safeHeadUv=clamp(headUv,vec2(.001),vec2(.999));
 float cropInterior=smoothstep(0.,.04,headUv.x)*smoothstep(0.,.04,1.-headUv.x)*smoothstep(0.,.04,headUv.y)*smoothstep(0.,.04,1.-headUv.y);
 vec3 headSample=headColor(safeHeadUv);
 float headMask=${atlas?'smoothstep(.025,.62,texture2D(uMask,safeHeadUv).r)':'1.-smoothstep(.72,1.,length((ref-vec2(.545,.746))/vec2(.153,.105)))'}*cropInterior*key(headSample);
 color=mix(color,headSample,headMask);alpha=max(alpha,headMask);
 // Limit green spill at the key boundary; preserve intentional green stage light.
 float edgeSpill=1.-smoothstep(.25,.95,alpha);color.g=mix(color.g,min(color.g,max(color.r,color.b)),edgeSpill);
 float necklace=texture2D(uNecklace,uv).r;float highlight=uShine>=0.?exp(-pow((uv.x-uShine)/.025,2.))*max(0.,1.-uShine):0.;color+=necklace*highlight*.8*vec3(1.,.96,.88);
 alpha*=smoothstep(0.,.10,origin.x)*smoothstep(0.,.10,1.-origin.x)*smoothstep(0.,.06,uv.y);
 gl_FragColor=vec4(mix(uBackdrop,color,alpha),max(alpha,uCard));
 #include <colorspace_fragment>
 }`});
 const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));const camera=new THREE.Camera(),target=new THREE.Vector2();
 const gaze={x:4,y:1,vx:0,vy:0,targetX:4,targetY:1};let next=4,current=4,blend=1,time=0,blinkStart=-10,nextBlink=3+Math.random()*3,peakMix=0,peakTarget=0,peakEvidence=0,holdUntil=0,lastEnergy=0,lastHigh=0,kick=0,shine=-1,lastShine=-2;
 const listeners=[],on=(node,event,fn,options)=>{node.addEventListener(event,fn,options);listeners.push(()=>node.removeEventListener(event,fn,options));};
 function reset(){target.set(0,0);gaze.targetX=4;gaze.targetY=1;next=4;}
 function resize(){const width=mount.clientWidth,height=mount.clientHeight;renderer.setSize(width,height);const aspect=width/height,imageAspect=image.image.width/image.image.height,fitY=innerWidth<768?1:.91;uniforms.uFit.value.set(fitY*aspect/imageAspect,fitY);uniforms.uOffset.value.set(innerWidth<768?0:-.14*uniforms.uFit.value.x,(1-fitY)*.1);}
 on(window,'resize',resize);resize();
 on(window,'pointermove',event=>{if(!document.body.classList.contains('entered')||document.querySelector('dialog[open]'))return;
  target.set(clamp(event.clientX/innerWidth*2-1,-1,1),clamp(1-event.clientY/innerHeight*2,-1,1));const c=gazeCoordinates(event.clientX/innerWidth,event.clientY/innerHeight,innerWidth<768?.5:.64,.31);gaze.targetX=c.x;gaze.targetY=c.y;next=gazeIndex(event.clientX/innerWidth,event.clientY/innerHeight,innerWidth<768?.5:.64,.31);
 },{passive:true});
 on(document,'pointerleave',reset);on(document.querySelector('#reset-view'),'click',reset);
 let portraitVisible=true;
 const active=()=>portraitVisible&&document.body.classList.contains('entered')&&!document.hidden&&!reducedMotion.matches;
 function synchronizeVideos(){for(const [name,r]of Object.entries(videos)){if(active()&&!r.failed&&(name==='calm'||peakTarget||peakMix>0)){r.video.play().catch(()=>{r.blocked=true;});}else r.video.pause();}}
 on(document,'music-enter',synchronizeVideos);on(document,'visibilitychange',synchronizeVideos);on(reducedMotion,'change',()=>{reset();synchronizeVideos();});
 on(window,'pointerdown',()=>{if(Object.values(videos).some(r=>r.blocked)){for(const r of Object.values(videos))r.blocked=false;synchronizeVideos();}},{passive:true});
 for(const [name,r]of Object.entries(videos))on(r.video,'error',()=>{r.failed=true;r.video.pause();if(name==='calm'){videoFailed=true;uniforms.uVideo.value=0;}else peakTarget=0;});
 let wasActive=false,contextLost=false;
 on(renderer.domElement,'webglcontextlost',event=>{event.preventDefault();contextLost=true;renderer.domElement.hidden=true;mount.classList.add('static-portrait');for(const r of Object.values(videos))r.video.pause();});
 on(renderer.domElement,'webglcontextrestored',()=>location.reload());
 function headTrack(){
  if(!track||!uniforms.uVideo.value){uniforms.uHeadInv.value.identity();return;}
  const get=name=>{const r=videos[name],t=track[`body-${name}`];if(!r||!t)return [1,0,0,0,1,0];const f=t.frames[Math.min(t.frames.length-1,Math.floor(r.video.currentTime*t.fps))].matrix;return [...f[0],...f[1]];};
  const a=get('calm'),b=get('peak'),m=a.map((v,i)=>v*(1-peakMix)+b[i]*peakMix),matrix=new THREE.Matrix3();
  // Convert pixel transform to normalized top-left coordinates before inversion.
  matrix.set(m[0],m[1]*1280/720,m[2]/720,m[3]*720/1280,m[4],m[5]/1280,0,0,1);uniforms.uHeadInv.value.copy(matrix.invert());
 }
 mount.dataset.ready='true';mount.dataset.portraitMode=atlas?'atlas-video':'nine-images';
 const api={image,depth,update(position,dt,audio={}){
  if(typeof audio==='number')audio={bass:audio,energy:audio,playing:false};
  const reduced=reducedMotion.matches,visible=1-smoothStep((position-.78)/.28);portraitVisible=visible>.001;const running=active();
  if(running!==wasActive){wasActive=running;if(running)synchronizeVideos();else for(const r of Object.values(videos))r.video.pause();}
  if(running)time+=dt;
  const pointer=uniforms.uPointer.value;pointer.x=damp(pointer.x,reduced?0:target.x,4,dt);pointer.y=damp(pointer.y,reduced?0:target.y,4,dt);
  for(const axis of ['x','y']){const v='v'+axis;const step=springStep(gaze[axis],gaze[v],reduced?(axis==='x'?4:1):gaze[axis==='x'?'targetX':'targetY'],dt);gaze[axis]=step.position;gaze[v]=step.velocity;}
  uniforms.uGrid.value.set(clamp(gaze.x,0,8),clamp(gaze.y,0,2));
  if(!atlas){const selected=reduced?4:next;if(selected!==uniforms.uTo.value){current=blend>.5?uniforms.uTo.value:current;uniforms.uFrom.value=current;uniforms.uTo.value=selected;blend=0;}blend=Math.min(1,blend+dt*6);uniforms.uBlend.value=smoothStep(blend);}
  if(time>=nextBlink&&Math.abs(gaze.x-4)<.75&&Math.abs(gaze.y-1)<.35&&running){blinkStart=time;nextBlink=time+3+Math.random()*3;}
  const elapsed=time-blinkStart;uniforms.uBlinkAmount.value=reduced?0:elapsed<.06?clamp(elapsed/.06,0,1):elapsed<.10?1:elapsed<.19?1-(elapsed-.10)/.09:0;
  const energy=audio.playing?audio.energy||0:0,bass=audio.playing?audio.bass||0:0,high=audio.playing?(audio.mid||0)+(audio.high||0):0;
  kick=Math.max(kick*Math.exp(-dt*14),clamp((bass-lastEnergy)*8,0,1));lastEnergy=bass;
  if(high-lastHigh>.035&&running&&time-lastShine>.2){shine=0;lastShine=time;}lastHigh=high;shine=shine<0?-1:shine+dt*3.2;if(shine>1)shine=-1;
  // Sustain/hysteresis avoids changing body loops on every beat.
  peakEvidence=audio.playing&&energy>.42?peakEvidence+dt:Math.max(0,peakEvidence-dt*2);
  if(videos.peak&&!videos.peak.failed&&running&&peakEvidence>.8&&peakTarget===0){peakTarget=1;holdUntil=time+2.5;videos.peak.video.currentTime=0;synchronizeVideos();}
  if((!audio.playing||energy<.26)&&time>holdUntil)peakTarget=0;
  peakMix=clamp(peakMix+(peakTarget?1:-1)*dt/.6,0,1);uniforms.uPeakMix.value=peakMix;
  uniforms.uVideo.value=running&&!videoFailed&&videos.calm&&!videos.calm.failed&&!videos.calm.blocked&&videos.calm.video.readyState>=2?1:0;
  uniforms.uTime.value=time;uniforms.uWind.value=reduced?0:1;uniforms.uKick.value=kick;uniforms.uEnergy.value=energy;uniforms.uShine.value=reduced?-1:shine;headTrack();
  const card=reduced||innerWidth<768?0:smoothStep(position/.7);uniforms.uCard.value=card;uniforms.uZoom.value=1-card*.22;uniforms.uOffset.value.x=innerWidth<768?0:-.14*uniforms.uFit.value.x*(1-card);mount.style.opacity=String(visible);mount.style.transform=reduced?'none':`translate3d(${pointer.x*.3}vw,${pointer.y*-.25}vh,0)`;document.querySelector('#atmosphere').style.opacity=String(.08*visible);
  mount.dataset.gaze=`${gaze.x.toFixed(2)},${gaze.y.toFixed(2)}`;mount.dataset.blink=String(uniforms.uBlinkAmount.value);mount.dataset.peak=peakMix.toFixed(3);mount.dataset.wind=kick.toFixed(3);mount.dataset.audioEnergy=energy.toFixed(3);mount.dataset.audioBands=JSON.stringify([bass,audio.mid||0,audio.high||0]);mount.dataset.shine=String(shine);mount.dataset.track=JSON.stringify(uniforms.uHeadInv.value.elements);mount.dataset.portraitMode=!atlas?'nine-images':uniforms.uVideo.value?'atlas-video':'atlas-static';
  if(visible>.001&&!contextLost)renderer.render(scene,camera);
 },getState:()=>({mode:mount.dataset.portraitMode,gaze:{x:gaze.x,y:gaze.y},blink:uniforms.uBlinkAmount.value,peakMix,videoTimes:Object.fromEntries(Object.entries(videos).map(([k,r])=>[k,r.video.currentTime])),wind:kick,headMatrix:uniforms.uHeadInv.value.elements,rendererErrors:renderer.info.programs?.some(p=>p.diagnostics&&!p.diagnostics.runnable)}),destroy(){for(const remove of listeners)remove();for(const r of Object.values(videos)){r.video.pause();r.video.removeAttribute('src');r.video.load();r.texture.dispose();}material.dispose();renderer.dispose();renderer.domElement.remove();}};
 return api;
}
