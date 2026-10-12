import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gazeCoordinates,atlasWeights,springStep} from '../dist/gaze-math.js';
assert.deepEqual(gazeCoordinates(.64,.31),{x:4,y:1});
assert.deepEqual(gazeCoordinates(.5,.31,.5,.31),{x:4,y:1});
assert.deepEqual(gazeCoordinates(0,0),{x:0,y:0});
assert.deepEqual(gazeCoordinates(1,1),{x:8,y:2});
for(const x of [0,.01,3.99,4,7.99,8])for(const y of [0,.99,1,1.99,2]){
 const {col,row,weights}=atlasWeights(x,y);
 assert.ok(col>=0&&col<8&&row>=0&&row<2);
 assert.ok(weights.every(w=>w>=0&&w<=1));assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-9);
}
const settle=dt=>{let state={position:0,velocity:0};for(let i=0;i<Math.round(.3/dt);i++)state=springStep(state.position,state.velocity,8,dt);return state;};
const a=settle(.01),b=settle(.02);assert.ok(Math.abs(a.position-b.position)<1e-9);assert.ok(Math.abs(a.position-8)<.15);
let state={position:4,velocity:0};for(let i=0;i<200;i++){state=springStep(state.position,state.velocity,i%2?8:0,.016);assert.ok(Number.isFinite(state.position)&&Number.isFinite(state.velocity));}
const tracks=JSON.parse(await readFile('dist/assets/portrait/body-head-track.json'));
for(const t of Object.values(tracks)){assert.equal(t.fps,24);assert.ok(t.frames.length>0);for(const frame of t.frames){assert.equal(frame.matrix.length,2);const [[a,b,c],[d,e,f]]=frame.matrix;assert.ok([a,b,c,d,e,f].every(Number.isFinite));assert.ok(Math.abs(a*e-b*d)>.1);}}
console.log('Passed continuous gaze corners/weights, frame-independent spring, rapid reversals and invertible video head tracks.');
