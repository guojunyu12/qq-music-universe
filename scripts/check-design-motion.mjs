import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=(await readFile('dist/type-stage.js','utf8')).replace(/^import .*;\n/gm,'').replace('export function','function');
for(const desktop of [true,false]){
 const configs=[],events={},head={textContent:'Listen/让音乐发生',setAttribute(){},querySelector(){return {};},querySelectorAll(){return [];}};
 const chapter={querySelector(selector){return selector==='h1,h2'?head:null;},querySelectorAll(){return [];}};
 const timeline={from(){return this;},to(){return this;}};
 const gsap={matchMedia(){return{add(_query,fn){fn({conditions:{desktop,simple:!desktop}});},revert(){}};},set(){},from(_target,options){configs.push(options);},timeline(options={}){configs.push(options);return timeline;}};
 const ScrollTrigger={create(){},sort(){}};
 const document={createTreeWalker(){return{nextNode(){return false;}};},querySelectorAll(){return[{},{}];},addEventListener(name,callback){events[name]=callback;}};
 vm.runInNewContext(source+'\ncreateTypeStage([chapter,chapter],{matches:!desktop});',{desktop,gsap,ScrollTrigger,document,chapter,NodeFilter:{SHOW_TEXT:4},setTheme(){},innerWidth:desktop?1280:390});
 const pins=configs.filter(config=>config.scrollTrigger?.pin);
 assert.equal(pins.length,desktop?1:0);
 if(desktop){assert.equal(pins[0].scrollTrigger.scrub,1);assert.equal(pins[0].scrollTrigger.end,'+=250%');assert.equal(pins[0].scrollTrigger.refreshPriority,10);}
 else{assert.ok(configs.every(config=>!config.scrollTrigger?.scrub));events['music-enter']();assert.ok(configs.every(config=>!config.yPercent),'reduced intro must use opacity only');}
}
console.log('Passed: editorial hero pin/scrub, refresh priority, mobile/reduced-motion simple intro.');
