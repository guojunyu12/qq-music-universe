#!/usr/bin/env python3
"""Extend prepared portrait loops with DIS flow; raw originals stay untouched.
Usage: .portrait-venv/bin/python scripts/retime-portrait-loops.py --extra 2
A local baseline makes repeating the command idempotent.
"""
import argparse,importlib.util,json,math,shutil
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('portrait_assets',ROOT/'scripts/build-portrait-assets.py')
assets=importlib.util.module_from_spec(spec);spec.loader.exec_module(assets)
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--extra',type=float,default=2);args=parser.parse_args()
assert args.extra>=0
out=ROOT/'dist/assets/portrait';baseline=ROOT/'.portrait-work/retime-baseline';baseline.mkdir(parents=True,exist_ok=True)
for name in ['body-calm','body-peak']:
 dest=baseline/f'{name}.mp4'
 if not dest.exists():shutil.copy2(out/f'{name}.mp4',dest)
if not (baseline/'body-head-track.json').exists():shutil.copy2(out/'body-head-track.json',baseline/'body-head-track.json')
tracks=json.loads((baseline/'body-head-track.json').read_text());new_tracks={};summary={}
yy,xx=np.mgrid[:assets.H,:assets.W].astype('float32')
for name,track in tracks.items():
 originals=[im for _,im in assets.frames(baseline/f'{name}.mp4')]
 assert len(originals)==len(track['frames'])
 count=round((len(originals)/assets.FPS+args.extra)*assets.FPS)
 print(f'{name}: {len(originals)} -> {count} frames ({count/assets.FPS:.3f}s)',flush=True)
 generated=[];trajectory=[];cached_index=-1;forward=backward=None
 dis=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
 for j in range(count):
  position=j*len(originals)/count;i=int(math.floor(position));n=(i+1)%len(originals);t=position-i
  a,b=originals[i],originals[n]
  if t<1e-8:frame=a.copy()
  else:
   if cached_index!=i:
    ga=cv2.cvtColor(a,cv2.COLOR_RGB2GRAY);gb=cv2.cvtColor(b,cv2.COLOR_RGB2GRAY)
    forward=dis.calc(ga,gb,None);backward=dis.calc(gb,ga,None);cached_index=i
   wa=cv2.remap(a,xx-forward[:,:,0]*t,yy-forward[:,:,1]*t,cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
   wb=cv2.remap(b,xx-backward[:,:,0]*(1-t),yy-backward[:,:,1]*(1-t),cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
   frame=np.uint8(np.clip(wa*(1-t)+wb*t,0,255))
  generated.append(frame)
  source_a,source_b=track['frames'][i],track['frames'][n]
  trajectory.append({'retimedFromFrames':[i,n],'weight':t,'matrix':(np.asarray(source_a['matrix'])*(1-t)+np.asarray(source_b['matrix'])*t).tolist(),'faceCenter':(np.asarray(source_a['faceCenter'])*(1-t)+np.asarray(source_b['faceCenter'])*t).tolist()})
 for codec in ['mp4','webm']:assets.encode(out/f'{name}.{codec}',generated,codec)
 Image.fromarray(generated[0]).save(out/f'{name}-first.png');Image.fromarray(generated[-1]).save(out/f'{name}-last.png')
 new_tracks[name]={**track,'frames':trajectory,'duration':count/assets.FPS,'crossfadeFrames':round(track['crossfadeFrames']*count/len(originals)),'retiming':{'originalDuration':len(originals)/assets.FPS,'extraSeconds':args.extra,'method':'DIS bidirectional optical flow, 24fps'}}
 seam=float(np.mean(np.abs(generated[0].astype(float)-generated[-1].astype(float))))
 adjacent=float(np.median([np.mean(np.abs(generated[i].astype(float)-generated[i-1].astype(float))) for i in range(1,len(generated))]))
 summary[name]={'frames':count,'duration':count/assets.FPS,'originalDuration':len(originals)/assets.FPS,'extraSeconds':args.extra,'crossfadeFrames':new_tracks[name]['crossfadeFrames'],'seamMeanPixelDelta':seam,'medianAdjacentDelta':adjacent,'seamRatio':seam/max(adjacent,.01)}
 del generated,originals
assets.write_json(out/'body-head-track.json',new_tracks);assets.write_json(out/'retiming-report.json',summary)
q=json.loads((out/'qc-report.json').read_text())
for report in q['videos']:
 name=Path(report['video']).stem
 if name in summary:report['bodyOutput'].update(summary[name]);report['bodyOutput']['loopBlend']='motion-compensated DIS flow with duration extension'
assets.write_json(out/'qc-report.json',q)
p=out/'REPORT.md';s=p.read_text();marker='\n## 循环时长调整\n'
s=s.split(marker)[0]+marker+'\n按用户要求，两段身体循环在原有基础上增加 2 秒，使用双向 DIS 光流补帧保持 24fps；不是新增拍摄动作。头部位置轨迹同步重采样，原始物料保持不变。\n\n'
for name,data in summary.items():s+=f'- {name}: {data["originalDuration"]:.3f} → {data["duration"]:.3f} 秒，{data["frames"]} 帧。\n'
p.write_text(s)
assets.validate_outputs()
