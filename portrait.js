import * as THREE from 'three';
import { clamp, damp, smoothStep } from './scene-math.js?v=editorial-4';
import { gazeFiles,gazeIndex } from './gaze-math.js?v=editorial-4';
import { trackAsset } from './loading.js?v=editorial-4';

// Keep the original body and depth map. Only the matching head region follows the pointer.
export async function createPortrait(mount,reducedMotion){
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));renderer.outputColorSpace=THREE.SRGBColorSpace;mount.appendChild(renderer.domElement);
 const loader=new THREE.TextureLoader(), images=new THREE.ImageLoader();
 const headTextures=await Promise.all(gazeFiles.map(async file=>{
  const image=await trackAsset(images.loadAsync(`assets/gaze/${encodeURIComponent(file)}`));
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  canvas.getContext('2d').drawImage(image,image.width*.32,image.height*.10,image.width*.48,image.height*.34,0,0,512,512);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
 }));
 const [image,depth]=await Promise.all([trackAsset(loader.loadAsync('assets/portrait-mvp.jpg')),trackAsset(loader.loadAsync('assets/portrait-depth.png'))]);
 image.colorSpace=THREE.SRGBColorSpace;
 const uniforms={uImage:{value:image},uDepth:{value:depth},uFit:{value:new THREE.Vector2(1,1)},uOffset:{value:new THREE.Vector2()},uPointer:{value:new THREE.Vector2()},uZoom:{value:1},uCard:{value:0},uBackdrop:{value:new THREE.Color('#0b1610')},uFrom:{value:4},uTo:{value:4},uBlend:{value:1}};
 headTextures.forEach((texture,index)=>uniforms[`uHead${index}`]={value:texture});
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
 vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
 fragmentShader:`uniform sampler2D uImage,uDepth,${headTextures.map((_,i)=>'uHead'+i).join(',')};uniform vec2 uFit,uOffset,uPointer;uniform float uZoom,uBlend,uCard;uniform vec3 uBackdrop;uniform int uFrom,uTo;varying vec2 vUv;
 vec3 head(int i,vec2 uv){${headTextures.map((_,i)=>`if(i==${i})return texture2D(uHead${i},uv).rgb;`).join('')}return texture2D(uHead4,uv).rgb;}
 void main(){vec2 origin=(vUv-.5)/uZoom*uFit+.5+uOffset;vec2 uv=origin;
 for(int i=0;i<6;i++){float d=texture2D(uDepth,clamp(uv,.002,.998)).r;uv=origin+uPointer*vec2(.018,.009)*(d-.3);}
 if(origin.x<0.||origin.x>1.||origin.y<0.||origin.y>1.){gl_FragColor=vec4(uBackdrop,uCard);return;}
 vec3 color=texture2D(uImage,uv).rgb;vec2 headUv=(uv-vec2(.32,.56))/vec2(.48,.34);
 float headMask=1.-smoothstep(.72,1.,length((uv-vec2(.545,.746))/vec2(.153,.105)));
 if(headUv.x>=0.&&headUv.x<=1.&&headUv.y>=0.&&headUv.y<=1.)color=mix(color,mix(head(uFrom,headUv),head(uTo,headUv),uBlend),headMask);
 float d=texture2D(uDepth,uv).r;float edge=smoothstep(0.,.15,origin.x)*smoothstep(0.,.15,1.-origin.x);float alpha=smoothstep(.12,.27,d)*edge*smoothstep(0.,.06,uv.y);
 color.r=mix(color.r,texture2D(uImage,uv+vec2(.00025,0.)).r,.08);gl_FragColor=vec4(mix(uBackdrop,color,alpha),max(alpha,uCard));
 #include <colorspace_fragment>
 }`});
 const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));const camera=new THREE.Camera(),target=new THREE.Vector2();
 let next=4,current=4,blend=1;
 function resize(){const width=mount.clientWidth,height=mount.clientHeight;renderer.setSize(width,height);const aspect=width/height,imageAspect=image.image.width/image.image.height;const fitY=innerWidth<768?1:.91;uniforms.uFit.value.set(fitY*aspect/imageAspect,fitY);uniforms.uOffset.value.set(innerWidth<768?0:-.14*uniforms.uFit.value.x,(1-fitY)*.1);}
 window.addEventListener('resize',resize);resize();
 window.addEventListener('pointermove',event=>{if(!document.body.classList.contains('entered')||document.querySelector('dialog[open]'))return;target.set(clamp(event.clientX/innerWidth*2-1,-1,1),clamp(1-event.clientY/innerHeight*2,-1,1));next=gazeIndex(event.clientX/innerWidth,event.clientY/innerHeight,innerWidth<768?.5:.64,innerWidth<768?.31:.31);},{passive:true});
 document.addEventListener('pointerleave',()=>{target.set(0,0);next=4;});document.querySelector('#reset-view').addEventListener('click',()=>{target.set(0,0);next=4;});
 mount.dataset.ready='true';
 return {image,depth,update(position,dt){const pointer=uniforms.uPointer.value;pointer.x=damp(pointer.x,reducedMotion.matches?0:target.x,4,dt);pointer.y=damp(pointer.y,reducedMotion.matches?0:target.y,4,dt);
 const selected=reducedMotion.matches?4:next;if(selected!==uniforms.uTo.value){current=blend>.5?uniforms.uTo.value:current;uniforms.uFrom.value=current;uniforms.uTo.value=selected;blend=0;}blend=Math.min(1,blend+dt*6);uniforms.uBlend.value=smoothStep(blend);mount.dataset.gaze=String(selected);
 const fade=1-smoothStep((position-.78)/.28);const card=reducedMotion.matches||innerWidth<768?0:smoothStep(position/.7);uniforms.uCard.value=card;uniforms.uZoom.value=1-card*.22;uniforms.uOffset.value.x=innerWidth<768?0:-.14*uniforms.uFit.value.x*(1-card);mount.style.opacity=String(fade);mount.style.transform=reducedMotion.matches?'none':`translate3d(${pointer.x*.3}vw,${pointer.y*-.25}vh,0)`;document.querySelector('#atmosphere').style.opacity=String(.08*fade);if(fade>.001)renderer.render(scene,camera);
 }};
}
