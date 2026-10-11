import { gsap,ScrollTrigger } from './scroll-motion.js?v=editorial-4';
import { setTheme } from './theme.js?v=editorial-4';

export function createTypeStage(chapters,reducedMotion){
 const themeOrder=['green','green','silver','pink','green','silver'];
 const scenes=chapters.map(chapter=>{
  const heading=chapter.querySelector('h1,h2');heading.setAttribute('aria-label',heading.textContent);
  const text=heading.querySelector('.title-chinese');const walker=document.createTreeWalker(text,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(node=>{const fragment=document.createDocumentFragment();for(const character of node.textContent){const mask=document.createElement('span');mask.className='glyph-mask';mask.setAttribute('aria-hidden','true');const glyph=document.createElement('span');glyph.className='glyph';glyph.textContent=character;mask.append(glyph);fragment.append(mask);}node.replaceWith(fragment);});
  return {chapter,heading,english:heading.querySelector('.title-english'),glyphs:heading.querySelectorAll('.glyph')};
 });
 const media=gsap.matchMedia();
 media.add({desktop:'(min-width:768px) and (prefers-reduced-motion:no-preference)',simple:'(max-width:767px), (prefers-reduced-motion:reduce)'},context=>{
  const desktop=context.conditions.desktop;
  scenes.forEach((scene,index)=>{
   ScrollTrigger.create({trigger:scene.chapter,start:'top 45%',end:'bottom 45%',onEnter:()=>setTheme(themeOrder[index]),onEnterBack:()=>setTheme(themeOrder[index])});
   if(index===0)return;
   if(desktop){
    const timeline=gsap.timeline({scrollTrigger:{trigger:scene.chapter,start:'top 78%',toggleActions:'play none none reverse'}});
    timeline.from(scene.english,{x:-70,opacity:0,duration:.9,ease:'power4.out'},0).from(scene.glyphs,{yPercent:110,stagger:.04,duration:.85,ease:'power4.out'},.15);
    const grid=scene.chapter.querySelector('.info-grid');
    if(grid){let rule=grid.querySelector('.animated-rule');if(!rule){rule=document.createElement('span');rule.className='animated-rule';rule.setAttribute('aria-hidden','true');grid.prepend(rule);}
     gsap.timeline({scrollTrigger:{trigger:grid,start:'top 87%'}}).from(rule,{scaleX:0,transformOrigin:'left',duration:.7,ease:'power3.out'}).from(grid.querySelectorAll('.description,.info-cell,.section-action'),{y:16,opacity:0,duration:.65,stagger:.08,ease:'power3.out'},.2);
    }
    const image=scene.chapter.querySelector('.feature-media');if(image)gsap.timeline({scrollTrigger:{trigger:image,start:'top 88%'}}).from(image,{clipPath:'inset(100% 0 0 0)',duration:1.1,ease:'power4.out'}).from(image.querySelector('img'),{scale:1.2,duration:1.25,ease:'power3.out'},0);
    const storyboard=scene.chapter.querySelector('.storyboard');if(storyboard)gsap.from(storyboard.children,{opacity:0,y:35,duration:.7,stagger:.12,scrollTrigger:{trigger:storyboard,start:'top 86%'}});
   }else{
    const elements=scene.chapter.querySelectorAll('.info-grid,.feature-media,.storyboard');if(elements.length)gsap.from(elements,{opacity:0,duration:.4,scrollTrigger:{trigger:scene.chapter,start:'top 80%'}});
   }
  });
  if(desktop){
   const first=chapters[0],words=document.querySelectorAll('#big-type p');
   gsap.set(words[0],{xPercent:10});gsap.set(words[1],{xPercent:-30});
   const transition=gsap.timeline({scrollTrigger:{trigger:first,start:'top top',end:'+=250%',scrub:1,pin:true,refreshPriority:10,anticipatePin:1,invalidateOnRefresh:true}});
   transition.to('.hero-copy',{yPercent:-40,opacity:0,duration:.28,ease:'none'},0).to('.hero-aside',{y:-80,opacity:0,duration:.25,ease:'none'},0).to('.hero-info',{opacity:0,y:30,duration:.18},.06)
   .to('#portrait',{clipPath:'inset(18% 26% 18% 26% round 16px)',duration:.42,ease:'none'},.04)
   .to('#big-type',{opacity:1,duration:.15},.18).to(words[0],{xPercent:-30,duration:.64,ease:'none'},.18).to(words[1],{xPercent:10,duration:.64,ease:'none'},.18)
   .to('.wave-trace',{opacity:1,duration:.1},.28).to('.wave-trace path',{strokeDashoffset:0,duration:.35,ease:'none'},.28)
   .to('.wave-trace',{opacity:0,duration:.15},.7).to('#big-type',{opacity:0,duration:.18},.82);
  }else{gsap.set('#portrait',{clipPath:'none'});gsap.set('#big-type,.wave-trace',{opacity:0});}
 });
 function intro(){const first=scenes[0];if(reducedMotion.matches||innerWidth<768){gsap.from(first.heading,{opacity:0,duration:.35});return;}gsap.timeline().from(first.english,{x:-80,opacity:0,duration:.9,ease:'power4.out'}).from(first.glyphs,{yPercent:110,duration:.85,stagger:.04,ease:'power4.out'},.15).from('.hero-aside,.hero-info',{opacity:0,y:24,duration:.8,stagger:.15},.45);}
 ScrollTrigger.sort();
 document.addEventListener('music-enter',intro,{once:true});
 return {update(){},destroy(){media.revert();}};
}
