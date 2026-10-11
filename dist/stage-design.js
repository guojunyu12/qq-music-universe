import * as THREE from 'three';
import { Reflector } from './vendor/Reflector.js';

export function createDesignedStage(scene,world,reducedMotion){
 const accents=[],group=new THREE.Group();world.add(group);
 const neutral=new THREE.MeshBasicMaterial({color:'#353b34',transparent:true,opacity:.42});
 const floor=new Reflector(new THREE.PlaneGeometry(22,22),{textureWidth:512,textureHeight:512,color:0x17241b,clipBias:.003});floor.rotation.x=-Math.PI/2;floor.position.y=-.95;group.add(floor);
 let portraitReflection=null;
 const reflect=floor.onBeforeRender;
 floor.onBeforeRender=function(...args){if(portraitReflection)portraitReflection.visible=true;try{return reflect.apply(this,args);}finally{if(portraitReflection)portraitReflection.visible=false;}};
 const floorBase=new THREE.Mesh(new THREE.PlaneGeometry(22,22),new THREE.MeshStandardMaterial({color:'#09110d',roughness:.28,metalness:.85}));floorBase.rotation.x=-Math.PI/2;floorBase.position.y=-.955;group.add(floorBase);
 for(let i=0;i<18;i++){const line=new THREE.Mesh(new THREE.TorusGeometry(1.7+i*.27,.004,4,100),neutral);line.rotation.x=-Math.PI/2;line.position.y=-.92;group.add(line);}
 const vinyl=new THREE.Group();vinyl.position.set(0,2.6,-1.8);vinyl.rotation.z=-.18;group.add(vinyl);
 const disc=new THREE.Mesh(new THREE.RingGeometry(.25,3.35,128),new THREE.MeshStandardMaterial({color:'#121a15',roughness:.24,metalness:.65,transparent:true,opacity:.82,side:THREE.DoubleSide}));vinyl.add(disc);
 const rimMat=new THREE.MeshBasicMaterial({color:'#5cf08a',transparent:true,opacity:.35});accents.push(rimMat);
 const rim=new THREE.Mesh(new THREE.TorusGeometry(3.35,.009,6,128),rimMat);vinyl.add(rim);
 for(let i=0;i<28;i++){const groove=new THREE.Mesh(new THREE.TorusGeometry(.85+i*.082,.003,4,128),neutral);groove.position.z=.012;vinyl.add(groove);}
 const label=new THREE.Mesh(new THREE.RingGeometry(.27,.78,64),new THREE.MeshBasicMaterial({color:'#687364',transparent:true,opacity:.35,side:THREE.DoubleSide}));label.position.z=.018;vinyl.add(label);
 const notch=new THREE.Mesh(new THREE.RingGeometry(1.8,1.81,64,1,0,.7),new THREE.MeshBasicMaterial({color:'#aab4a3',transparent:true,opacity:.3}));notch.position.z=.02;vinyl.add(notch);
 // A sparse DJ desk retains the stage identity without a floating UI card stack.
 const desk=new THREE.Group();desk.position.set(0,.75,.55);group.add(desk);
 const black=new THREE.MeshStandardMaterial({color:'#0d1510',metalness:.7,roughness:.3});
 const tabletop=new THREE.Mesh(new THREE.BoxGeometry(3.8,.16,1),black);desk.add(tabletop);
 for(const x of [-1.25,1.25]){const platter=new THREE.Mesh(new THREE.CylinderGeometry(.47,.47,.045,64),new THREE.MeshStandardMaterial({color:'#242d25',metalness:.8,roughness:.27}));platter.position.set(x,.1,0);desk.add(platter);const dot=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.048,24),rimMat);dot.position.copy(platter.position);dot.position.y=.104;desk.add(dot);}
 for(let i=0;i<8;i++){const fader=new THREE.Mesh(new THREE.BoxGeometry(.035,.026,.22),neutral);fader.position.set((i-3.5)*.1,.1,0);desk.add(fader);}
 const rings=[];
 for(let ring=0;ring<3;ring++){const count=96+ring*32,positions=new Float32Array(count*3),base=[];for(let i=0;i<count;i++){const angle=i/count*Math.PI*2,radius=2.7+ring*.8;base.push(angle,radius);positions.set([Math.sin(angle)*radius,-.87,Math.cos(angle)*radius],i*3);}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));const material=new THREE.PointsMaterial({color:'#5cf08a',size:.028,transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending});accents.push(material);const points=new THREE.Points(geometry,material);group.add(points);rings.push({points,base,positions});}
 const cones=[];
 for(let i=0;i<3;i++){const material=new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color('#5cf08a')},uTime:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform vec3 uColor;uniform float uTime;varying vec2 vUv;float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){float dust=.75+.25*noise(floor(vUv*80.+vec2(0.,uTime*.3)));float alpha=pow(1.-vUv.y,1.5)*.025*dust;gl_FragColor=vec4(uColor,alpha);}`});const cone=new THREE.Mesh(new THREE.ConeGeometry(2,7,32,1,true),material);cone.position.set((i-1)*2.7,3,-.8);cone.rotation.z=(i-1)*.2;group.add(cone);cones.push(cone);}
 const positions=new Float32Array(400*3);let seed=28;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<400;i++)positions.set([(random()-.5)*18,random()*10-1,(random()-.5)*16],i*3);
 const particles=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)),new THREE.PointsMaterial({color:'#b5c5b8',size:.018,transparent:true,opacity:.35,depthWrite:false}));group.add(particles);
 return {setPortrait(image,depth){
  const material=new THREE.ShaderMaterial({uniforms:{uImage:{value:image},uDepth:{value:depth}},transparent:true,depthWrite:false,side:THREE.DoubleSide,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D uImage,uDepth;varying vec2 vUv;void main(){float alpha=smoothstep(.12,.27,texture2D(uDepth,vUv).r);if(alpha<.05)discard;gl_FragColor=vec4(texture2D(uImage,vUv).rgb,alpha*.5);}' });
  portraitReflection=new THREE.Mesh(new THREE.PlaneGeometry(3.25,5.8),material);portraitReflection.position.set(0,2.15,.4);portraitReflection.visible=false;group.add(portraitReflection);
 },update({time,bass,mid,high,color,pointer,dt}){const desktop=innerWidth>=768&&!reducedMotion.matches;const node=document.querySelector('#space');if(node.dataset.reflection!==(desktop?'on':'off'))node.dataset.reflection=desktop?'on':'off';floor.visible=desktop;floorBase.visible=!desktop;cones.forEach(cone=>{cone.visible=desktop;cone.material.uniforms.uTime.value=time;cone.material.uniforms.uColor.value.lerp(color,1-Math.exp(-dt*3));});vinyl.rotation.z=-.18+time*.025;accents.forEach(mat=>mat.color.lerp(color,1-Math.exp(-dt*3)));rings.forEach(({points,base,positions},ring)=>{const energy=ring===0?bass:ring===1?mid:high;points.material.opacity=.18+energy*.65;points.scale.setScalar(1+energy*.035);for(let i=0;i<positions.length/3;i++)positions[i*3+1]=-.87+(ring>0?Math.sin(time*2+base[i*2]*8)*energy*.16:0);points.geometry.attributes.position.needsUpdate=true;});particles.rotation.y=time*.008;particles.position.x=pointer.x*.15;particles.position.y=pointer.y*.08;}};
}
