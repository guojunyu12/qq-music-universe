import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { chapterPosition, smoothStep, damp } from '../dist/scene-math.js';
assert.equal(chapterPosition(-20,[0,100,200]),0);
assert.equal(chapterPosition(50,[0,100,200]),.5);
assert.equal(chapterPosition(100,[0,100,200]),1);
assert.equal(chapterPosition(999,[0,100,200]),2);
assert.equal(smoothStep(-1),0);assert.equal(smoothStep(2),1);
assert.ok(damp(0,1,5,.016)>0&&damp(0,1,5,.016)<1);
const oneSecond=damp(0,1,5,1),half=damp(damp(0,1,5,.5),1,5,.5);
assert.ok(Math.abs(oneSecond-half)<1e-12,'camera smoothing must be frame-rate independent');
for(const file of ['app.js','scene-math.js','portrait.js','type-stage.js','scroll-motion.js','stage-design.js','theme.js','loading.js','gaze-math.js'])assert.equal(spawnSync(process.execPath,['--check',`dist/${file}`]).status,0);
const html=await readFile('dist/index.html','utf8');
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(/^(https?:|data:)/.test(match[1]))continue;
  await access(`dist/${match[1].split('?')[0]}`);
}
for(let i=1;i<=6;i++)await access(`dist/assets/official-${i}.webp`);
assert.ok((await readFile('dist/assets/future-bass.mp3')).length>100000);
for (const asset of ['portrait-mvp.jpg','portrait-depth.png']) await access(`dist/assets/${asset}`);
assert.ok(!html.includes('几何预览角色'), 'old placeholder must not appear in page copy');
console.log('Passed: camera interpolation, frame-independent smoothing, JS syntax, local assets, audio and portrait/depth assets.');

const {gazeIndex,gazeFiles}=await import('../dist/gaze-math.js');
assert.equal(gazeIndex(.64,.31),4);assert.equal(gazeIndex(0,0),0);assert.equal(gazeIndex(1,0),2);assert.equal(gazeIndex(0,1),6);assert.equal(gazeIndex(1,1),8);assert.equal(gazeIndex(.64,0),1);assert.equal(gazeIndex(.64,1),7);
for(const file of gazeFiles)await access(`dist/assets/gaze/${file}`);
const css=await readFile('dist/style.css','utf8');for(const url of css.matchAll(/url\((assets\/[^)]+)\)/g))await access(`dist/${url[1]}`);
console.log('Passed: gaze direction mapping, nine source images, local fonts and design modules.');
