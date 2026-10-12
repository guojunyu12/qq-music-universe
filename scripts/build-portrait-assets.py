#!/usr/bin/env python3
"""Local portrait preparation; does NOT modify the page or publish anything.
Run with .portrait-venv/bin/python scripts/build-portrait-assets.py --source PATH.
Models live in .portrait-models (see portrait/REPORT.md for sources).
All video decoding/encoding uses the explicitly requested Homebrew FFmpeg.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = '/opt/homebrew/bin/ffmpeg'
FFPROBE = '/opt/homebrew/bin/ffprobe'
W, H, FPS, TILE = 720, 1280, 24, 384
CROP = [.32, .10, .48, .34]
MODELS = ROOT / '.portrait-models'
WORK = ROOT / '.portrait-work'
OUT = ROOT / 'dist/assets/portrait'
RAW = ROOT / 'dist/assets/raw'
FACE_IDS = [33, 263, 1]
OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
WATERMARK = {'head-row2-b', 'head-row3-a'}
PERSON_CORE = None
QC_VERSION = 5


def log(message):
    print(message, flush=True)


def run(args):
    subprocess.run([str(a) for a in args], check=True)


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def rgb(path):
    return np.asarray(Image.open(path).convert('RGB').resize((W,H), Image.Resampling.LANCZOS)).copy()


def key_alpha(im):
    """Chroma key + exterior-connected cyan smoke, never global skin removal."""
    hsv = cv2.cvtColor(im, cv2.COLOR_RGB2HSV).astype(np.float32)
    h,s,v = hsv[:,:,0],hsv[:,:,1]/255,hsv[:,:,2]/255
    # OpenCV hue 0..180. Preserve dark green hair/clothing.
    chroma = np.clip((im[:,:,1].astype(float)-np.maximum(im[:,:,0],im[:,:,2]))/255,0,1)
    yy,xx=np.mgrid[:H,:W]
    desk=yy/H>=(.705-.08*xx/W)
    green = (h>34)&(h<86)&(s>.68)&(v>.35)&(chroma>.45)&~desk
    cyan = (h>=76)&(h<=105)&(s>.06)&(s<.58)&(v>.48)
    holes=np.zeros((H,W),np.uint8)
    for poly in [[[.715,.248],[.775,.286],[.735,.329],[.706,.315]],[[.65,.395],[.765,.414],[.755,.56],[.665,.54]],[[.335,.57],[.415,.585],[.426,.645],[.30,.675]]]:
        cv2.fillPoly(holes,[np.round(np.array(poly)*[W,H]).astype('int32')],1)
    if PERSON_CORE is not None:cyan &= (~PERSON_CORE | holes.astype(bool))
    cyan &= ~desk
    eligible = (green|cyan).astype('uint8')
    # Cyan inside the silhouette can be jewelry/skin highlights. Only key regions
    # connected to the known background, not all pixels of the same hue.
    n,labels,stats,_ = cv2.connectedComponentsWithStats(eligible,8)
    background = np.zeros((H,W),bool)
    for k in range(1,n):
        x,y,ww,hh,area = stats[k]
        if area>40 and (y==0 or x==0 or x+ww==W or y+hh==H or np.any(green[labels==k]) or np.any(holes[labels==k])):
            background |= labels==k
    alpha = np.where(background,0,255).astype('uint8')
    # Remove detached smoke speckles in the empty arm/waist gap; preserve hair
    # wisps next to the opaque person and all deck controls below this gap.
    n,fg_labels,fg_stats,_=cv2.connectedComponentsWithStats(alpha,8)
    protected=cv2.dilate(PERSON_CORE.astype('uint8'),np.ones((11,11),np.uint8)) if PERSON_CORE is not None else np.zeros_like(alpha)
    for k in range(1,n):
        x,y,ww,hh,area=fg_stats[k]
        if area<600 and .56*H<y<.68*H and not np.any(protected[fg_labels==k]):alpha[fg_labels==k]=0
    return cv2.GaussianBlur(alpha,(0,0),.7)


def clean_rgb(im, alpha=None):
    a = key_alpha(im) if alpha is None else alpha
    result=im.copy()
    result[a<8] = (0,255,0)
    # Despill only key boundary, not intentional green garment/interior lighting.
    edge=(a>=8)&(a<248)
    result[:,:,1][edge]=np.minimum(result[:,:,1][edge], np.maximum(result[:,:,0],result[:,:,2])[edge])
    pure_green=(im[:,:,1]>210)&(np.maximum(im[:,:,0],im[:,:,2])<30)
    result[pure_green]=(0,255,0)
    return result


def bounds(a, upper=False):
    mask=(a>128).astype('uint8')
    if upper:
        mask[int(.60*H):]=0
        mask[:int(.07*H)]=0
    n,labels,stats,_=cv2.connectedComponentsWithStats(mask,8)
    if n<2:return None
    k=1+np.argmax(stats[1:,4]);x,y,w,h,_=stats[k]
    return np.array([x,y,w,h],float)


def quality(im, reference):
    alpha=key_alpha(im)
    reasons=[]; metrics={}
    for name,upper in [('foreground',False),('upperBody',True)]:
        b=bounds(alpha,upper);base=reference[name]
        if b is None:reasons.append('missing_silhouette');continue
        delta=np.abs((b[:2]+b[2:]/2)-(base[:2]+base[2:]/2))/[W,H]
        scaling=np.abs(b[2:]/base[2:]-1)
        metrics[name]={'bbox':b.tolist(),'translationFraction':delta.tolist(),'scaleDelta':scaling.tolist()}
        if np.max(delta)>.02:reasons.append(name+'_position_over_2pct')
        if np.max(scaling)>.03:reasons.append(name+'_scale_over_3pct')
    return sorted(set(reasons)),metrics,alpha


class Face:
    def __init__(self):
        import mediapipe as mp
        self.mp=mp
        options=mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(MODELS/'face_landmarker.task'),delegate=mp.tasks.BaseOptions.Delegate.CPU),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,num_faces=1,
            min_face_detection_confidence=.4,min_face_presence_confidence=.4,
            output_facial_transformation_matrixes=True)
        self.detector=mp.tasks.vision.FaceLandmarker.create_from_options(options)

    def get(self,im):
        result=self.detector.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB,data=np.ascontiguousarray(im)))
        ox,oy,fw,fh=0,0,W,H
        if not result.face_landmarks:
            ox,oy,fw,fh=round(.28*W),round(.12*H),round(.46*W),round(.25*H)
            patch=np.ascontiguousarray(im[oy:oy+fh,ox:ox+fw])
            result=self.detector.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB,data=patch))
        if not result.face_landmarks:return None
        pts=np.array([[ox+p.x*fw,oy+p.y*fh,p.z*fw] for p in result.face_landmarks[0]])
        rot=np.asarray(result.facial_transformation_matrixes[0])[:3,:3]
        # Record full orientation; gaze anchors calibrate coordinate direction.
        yaw=math.degrees(math.atan2(-rot[2,0],math.hypot(rot[0,0],rot[1,0])))
        pitch=math.degrees(math.atan2(rot[2,1],rot[2,2]))
        iris=[]
        for indices,left,right in [([468,469,470,471,472],33,133),([473,474,475,476,477],362,263)]:
            center=pts[indices,:2].mean(0);a=pts[left,:2];b=pts[right,:2]
            iris.append({'center':(center/[W,H]).tolist(),'horizontal':float(np.dot(center-a,b-a)/max(np.dot(b-a,b-a),1))})
        return {'yaw':yaw,'pitch':pitch,'iris':iris,'points':pts}


def serial_face(face):
    if face is None:return None
    return {'yaw':face['yaw'],'pitch':face['pitch'],'iris':face['iris'],'points':face['points'].tolist()}


def restore_face(face):
    if face is None:return None
    face=dict(face);face['points']=np.array(face['points']);return face


def transform(face,base):
    # Deterministic least-squares similarity using two eye corners and nose tip.
    src=face['points'][FACE_IDS,:2];dst=base['points'][FACE_IDS,:2]
    center=src.mean(0);target=dst.mean(0)
    u,s,vt=np.linalg.svd((src-center).T@(dst-target))
    rot=vt.T@u.T
    if np.linalg.det(rot)<0:vt[-1]*=-1;rot=vt.T@u.T
    angle=math.atan2(rot[1,0],rot[0,0]);angle=np.clip(angle,-math.radians(8),math.radians(8))
    rot=np.array([[math.cos(angle),-math.sin(angle)],[math.sin(angle),math.cos(angle)]])
    scale=float(np.sum((src-center)@rot.T*(dst-target))/np.sum((src-center)**2))
    scale=float(np.clip(scale,.88,1.12))
    shift=target-scale*rot@center
    return np.column_stack((scale*rot,shift)).astype('float32')


def head_tile(im,face,base):
    aligned=cv2.warpAffine(clean_rgb(im),transform(face,base),(W,H),flags=cv2.INTER_CUBIC,borderValue=(0,255,0))
    x,y,w,h=CROP
    return cv2.resize(aligned[round(y*H):round((y+h)*H),round(x*W):round((x+w)*W)],(TILE,TILE),interpolation=cv2.INTER_LANCZOS4)


def frames(path):
    p=subprocess.Popen([FFMPEG,'-v','error','-i',str(path),'-an','-vf',f'scale={W}:{H}:flags=lanczos,fps={FPS}','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
    try:
        index=0
        while True:
            data=p.stdout.read(W*H*3)
            if not data:break
            if len(data)!=W*H*3:raise RuntimeError('Truncated frame')
            yield index,np.frombuffer(data,np.uint8).reshape(H,W,3).copy()
            index+=1
    finally:
        p.stdout.close();code=p.wait()
        if code:raise RuntimeError(f'FFmpeg decoding failed: {path} ({code})')


def longest_run(indices):
    if not indices:return []
    runs=[];current=[indices[0]]
    for i in indices[1:]:
        if i==current[-1]+1:current.append(i)
        else:runs.append(current);current=[i]
    runs.append(current)
    return max(runs,key=len)


def flow_interp(a,b,t):
    """Bidirectional OpenCV DIS warps; don't use a plain crossfade as interpolation."""
    grayA=cv2.cvtColor(a,cv2.COLOR_RGB2GRAY);grayB=cv2.cvtColor(b,cv2.COLOR_RGB2GRAY)
    dis=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    forward=dis.calc(grayA,grayB,None);backward=dis.calc(grayB,grayA,None)
    ih,iw=a.shape[:2]
    yy,xx=np.mgrid[:ih,:iw].astype('float32')
    warpedA=cv2.remap(a,xx-forward[:,:,0]*t,yy-forward[:,:,1]*t,cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
    warpedB=cv2.remap(b,xx-backward[:,:,0]*(1-t),yy-backward[:,:,1]*(1-t),cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
    return np.clip(warpedA*(1-t)+warpedB*t,0,255).astype('uint8')


def encode(path,arr,codec):
    flags=['-c:v','libx264','-crf','18','-preset','medium','-movflags','+faststart','-pix_fmt','yuv420p'] if codec=='mp4' else ['-c:v','libvpx-vp9','-crf','28','-b:v','0','-row-mt','1','-pix_fmt','yuv420p']
    proc=subprocess.Popen([FFMPEG,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-an',*flags,str(path)],stdin=subprocess.PIPE)
    try:
        for frame in arr:proc.stdin.write(np.ascontiguousarray(frame).tobytes())
    finally:proc.stdin.close()
    if proc.wait():raise RuntimeError(f'encode failed: {path}')


def copy_sources(source):
    copied=[]
    previous=json.loads((OUT/'raw-manifest.json').read_text()) if (OUT/'raw-manifest.json').exists() else []
    old_hashes={x['path']:x['sha256'] for x in previous}
    for file in sorted(source.rglob('*')):
        if file.suffix.lower() not in {'.png','.jpg','.mp4'}:continue
        dest=RAW/file.relative_to(source);dest.parent.mkdir(parents=True,exist_ok=True)
        sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
        checksum=sha(file)
        if not dest.exists() or sha(dest)!=checksum:shutil.copy2(file,dest)
        relative=str(file.relative_to(source))
        if old_hashes.get(relative)!=checksum:
            if file.suffix.lower()=='.mp4':
                for stale in [WORK/'normalized'/file.name,WORK/(file.stem+'-scan.json')]:stale.unlink(missing_ok=True)
            elif file.name=='g05-正视.png':
                for stale in WORK.glob('*-scan.json'):stale.unlink(missing_ok=True)
        assert checksum==sha(dest),f'Raw copy mismatch: {file}'
        copied.append({'path':str(file.relative_to(source)),'sha256':checksum,'bytes':file.stat().st_size})
    write_json(OUT/'raw-manifest.json',copied)


def preprocess(source):
    normalized=WORK/'normalized';normalized.mkdir(exist_ok=True)
    for file in sorted((RAW/'绿幕视频').glob('*.mp4')):
        dest=normalized/file.name
        if dest.exists():continue
        filters=f'scale={W}:{H}:flags=lanczos,fps={FPS}'
        if file.stem in WATERMARK:filters+=',drawbox=x=iw*0.70:y=0:w=iw*0.30:h=ih*0.085:color=0x00ff00:t=fill'
        run([FFMPEG,'-v','error','-y','-i',file,'-an','-vf',filters,'-c:v','libx264','-crf','16','-preset','fast','-pix_fmt','yuv420p',dest])
    return sorted(normalized.glob('*.mp4'))


def scan(videos,detector,reference,base):
    candidates=[];reports=[]
    for path in videos:
        cache=WORK/(path.stem+'-scan.json');folder=WORK/path.stem;folder.mkdir(exist_ok=True)
        cached=json.loads(cache.read_text()) if cache.exists() else None
        if cached and cached.get('qcVersion')==QC_VERSION:
            report=cached;log(f'Cached QC: {path.name}')
        else:
            log(f'Per-frame QC + landmarks: {path.name}')
            rows=[]
            original_frames=frames(RAW/'绿幕视频'/path.name) if path.stem in WATERMARK else None
            for index,im in frames(path):
                reasons,metrics,alpha=quality(im,reference)
                if path.stem in WATERMARK:
                    _,original=next(original_frames)
                    silhouette=key_alpha(original)>128
                    _,labels,stats,_=cv2.connectedComponentsWithStats(silhouette.astype('uint8'),8)
                    if len(stats)>1:
                        largest=1+int(np.argmax(stats[1:,4]))
                        if np.any(labels[:round(.085*H),round(.70*W):]==largest):reasons.append('watermark_repair_intersects_person')
                face=detector.get(im)
                if face is None:reasons.append('face_not_detected')
                row={'index':index,'time':index/FPS,'reasons':reasons,'metrics':metrics,'face':serial_face(face)}
                rows.append(row)
                if not reasons:
                    Image.fromarray(head_tile(im,face,base)).save(folder/f'{index:04d}.webp',quality=96)
                if index%48==0:log(f'  {index+1} frames checked')
            if original_frames is not None:
                for _ in original_frames:pass
            report={'qcVersion':QC_VERSION,'video':path.name,'totalFrames':len(rows),'retainedFrames':sum(not r['reasons'] for r in rows),'frames':rows}
            report['discardedFrames']=report['totalFrames']-report['retainedFrames']
            counts={}
            for row in rows:
                for reason in row['reasons']:counts[reason]=counts.get(reason,0)+1
            report['reasonCounts']=counts
            write_json(cache,report)
        reports.append(report)
        if path.stem.startswith('head'):
            for row in report['frames']:
                if not row['reasons']:
                    candidates.append({'id':f'{path.stem}:{row["index"]}','image':str(folder/f'{row["index"]:04d}.webp'),'face':restore_face(row['face']),'source':path.name,'frame':row['index']})
        log(f'  usable {report["retainedFrames"]}/{report["totalFrames"]}')
    return candidates,reports


def atlas(candidates,anchors,base):
    # yaw/pitch alone miss eye-only gaze. Use anchor-calibrated iris residual to
    # break ties while preserving measured head angles in metadata.
    def features(face):
        pts=face['points'];iris=np.mean([i['horizontal'] for i in face['iris']])
        eye=pts[[33,133,362,263],:2].mean(0);ic=pts[list(range(468,478)),:2].mean(0)
        eye_width=np.linalg.norm(pts[33,:2]-pts[263,:2])
        return np.array([face['yaw'],face['pitch'],iris,(ic[1]-eye[1])/eye_width])
    af=np.array([features(a['face']) for a in anchors])
    left=af[[0,3,6]].mean(0);right=af[[2,5,8]].mean(0)
    up=af[:3].mean(0);down=af[6:9].mean(0)
    yaw_centers=np.linspace(left[0],right[0],9);pitch_centers=np.linspace(up[1],down[1],3)
    span=np.maximum(np.ptp(af,axis=0),[1,1,.02,.005])
    targets={}
    for row in range(3):
        for col in range(9):
            k=row*3+(0 if col<=4 else 1);t=(col if col<=4 else col-4)/4
            targets[row,col]=af[k]*(1-t)+af[k+1]*t
    buckets={}; measured=[]; head_rejections=[]
    def eye_openness(face):
        p=face['points']
        return float(np.mean([np.linalg.norm(p[159,:2]-p[145,:2])/np.linalg.norm(p[33,:2]-p[133,:2]),np.linalg.norm(p[386,:2]-p[374,:2])/np.linalg.norm(p[362,:2]-p[263,:2])]))
    for candidate in candidates:
        f=features(candidate['face']); measured.append(f)
        # Assign by orientation. Eye-only anchors are evaluated separately below.
        row,col=min(targets,key=lambda key:float(np.sum(((f[:2]-targets[key][:2])/span[:2])**2)))
        target=targets[row,col]
        iris_error=float(np.max(np.abs((f[2:]-target[2:])/span[2:])))
        if eye_openness(candidate['face'])<.45*eye_openness(base):
            head_rejections.append({'source':candidate['id'],'reason':'blink_or_closed_eyes'});continue
        if iris_error>.10:
            head_rejections.append({'source':candidate['id'],'reason':'iris_disagrees_with_orientation_bin','irisError':iris_error});continue
        buckets.setdefault((row,col),[]).append(candidate)
    # Direction-labeled source anchors guarantee the endpoint/center targets and
    # iris anchoring. Never infer direction from video file names or endpoints.
    for index,a in enumerate(anchors):
        row,col=divmod(index,3);buckets.setdefault((row,col*4),[]).append(a)
    tiles={}; metadata=[]
    for row in range(3):
        for col in range(9):
            choices=buckets.get((row,col),[])
            target=targets[row,col]
            if choices:
                score=lambda a:float(np.sum(((features(a['face'])-target)/span)**2*np.array([1,1,.35,.35])))
                anchor=[a for a in choices if a['id'].startswith('g')]
                best=anchor[0] if anchor else min(choices,key=score)
                tiles[row,col]=np.asarray(Image.open(best['image']).convert('RGB'))
                metadata.append({'row':row,'column':col,'yaw':float(target[0]),'pitch':float(target[1]),'actualYaw':best['face']['yaw'],'actualPitch':best['face']['pitch'],'iris':best['face']['iris'],'source':best['id'],'interpolated':False,'distance':score(best)})
            else:metadata.append({'row':row,'column':col,'yaw':float(target[0]),'pitch':float(target[1]),'interpolated':True})
    real_tiles=dict(tiles)
    for entry in metadata:
        if not entry['interpolated']:continue
        row,col=entry['row'],entry['column'];available=[c for r,c in real_tiles if r==row]
        lo=max((c for c in available if c<col),default=min(available));hi=min((c for c in available if c>col),default=max(available))
        t=(col-lo)/max(hi-lo,1);tiles[row,col]=flow_interp(real_tiles[row,lo],real_tiles[row,hi],t)
        entry.update({'source':[f'grid:{row},{lo}',f'grid:{row},{hi}'],'weight':t,'method':'OpenCV DIS bidirectional flow'})
    canvas=Image.new('RGB',(9*TILE,3*TILE))
    for (row,col),tile in tiles.items():canvas.paste(Image.fromarray(tile),(col*TILE,row*TILE))
    canvas.save(OUT/'head-atlas.webp',quality=96,method=6)
    write_json(OUT/'head-atlas.json',{'columns':9,'rows':3,'tileSize':TILE,'textureSize':[9*TILE,3*TILE],'crop':dict(zip(['left','top','width','height'],CROP)),'cropCoordinateSystem':'top-left normalized','referenceSize':[W,H],'yawCenters':yaw_centers.tolist(),'pitchCenters':pitch_centers.tolist(),'cells':metadata,'alignment':'eye corners 33/263 and nose 1; similarity; rotation limited to 8 degrees','selection':'measured yaw/pitch bins, iris residual tie-break; optical-flow fill only empty cells'})
    write_json(OUT/'head-selection-rejections.json',head_rejections)
    return tiles,metadata


def head_mask(base):
    mask=np.zeros((H,W),np.uint8)
    oval=base['points'][OVAL,:2].copy()
    # Brow/forehead landmarks, not the hair silhouette; deliberately keep wisps out.
    cv2.fillPoly(mask,[np.round(oval).astype('int32')],255)
    mask=cv2.dilate(mask,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(17,17)))
    x,y,w,h=CROP
    mask=mask[round(y*H):round((y+h)*H),round(x*W):round((x+w)*W)]
    mask=cv2.resize(mask,(TILE,TILE))
    mask=cv2.GaussianBlur(mask,(0,0),24/3)
    Image.fromarray(mask).save(OUT/'head-mask.png')


def body_loop(report,base):
    name=Path(report['video']).stem
    run_indices=longest_run([r['index'] for r in report['frames'] if not r['reasons']])
    if len(run_indices)<2*round(.3*FPS)+2:
        for suffix in ['mp4','webm','-first.png','-last.png']:
            path=OUT/(f'{name}.{suffix}' if not suffix.startswith('-') else name+suffix)
            path.unlink(missing_ok=True)
        report['bodyOutput']={'status':'blocked','reason':'No continuous qualified interval long enough for 0.3-second overlap','longestRun':run_indices}
        return None
    start,end=run_indices[0],run_indices[-1]
    extracted=[];tracks=[]
    for index,im in frames(WORK/'normalized'/report['video']):
        if start<=index<=end:
            extracted.append(clean_rgb(im))
            face=restore_face(report['frames'][index]['face']);m=transform(face,base)
            # forward base-to-current transform for runtime head positioning
            inv=cv2.invertAffineTransform(m)
            tracks.append({'sourceFrame':index,'matrix':inv.tolist(),'faceCenter':(face['points'][FACE_IDS,:2].mean(0)/[W,H]).tolist()})
    n=round(.3*FPS);n=min(n,(len(extracted)-2)//2)
    # Middle followed by tail->head blend: at the wrap boundary frame n-1 -> n.
    loop=extracted[n:-n];looptracks=tracks[n:-n]
    for j in range(n):
        t=(j+1)/(n+1)
        loop.append(flow_interp(extracted[-n+j],extracted[j],t))
        a=np.array(tracks[-n+j]['matrix']);b=np.array(tracks[j]['matrix'])
        looptracks.append({'sourceFrames':[tracks[-n+j]['sourceFrame'],tracks[j]['sourceFrame']],'weight':t,'matrix':(a*(1-t)+b*t).tolist(),'faceCenter':(np.array(tracks[-n+j]['faceCenter'])*(1-t)+np.array(tracks[j]['faceCenter'])*t).tolist()})
    log(f'Encoding {name}: source frames {start}..{end}, loop {len(loop)/FPS:.2f}s')
    for codec in ['mp4','webm']:encode(OUT/f'{name}.{codec}',loop,codec)
    Image.fromarray(loop[0]).save(OUT/f'{name}-first.png');Image.fromarray(loop[-1]).save(OUT/f'{name}-last.png')
    # Report seam discontinuity compared with typical neighboring-frame difference.
    seam=float(np.mean(np.abs(loop[0].astype(float)-loop[-1].astype(float))))
    normal=float(np.median([np.mean(np.abs(loop[i].astype(float)-loop[i-1].astype(float))) for i in range(1,len(loop))]))
    report['bodyOutput']={'status':'prepared','sourceStartFrame':start,'sourceEndFrame':end,'fps':FPS,'frames':len(loop),'duration':len(loop)/FPS,'crossfadeFrames':n,'loopBlend':'motion-compensated bidirectional DIS flow','seamMeanPixelDelta':seam,'medianAdjacentDelta':normal,'seamRatio':seam/max(normal,.01)}
    return {'fps':FPS,'frames':looptracks,'duration':len(loop)/FPS,'coordinateSystem':'720x1280 top-left pixels','transform':'2x3 reference-to-current; apply to atlas and head mask together','crossfadeFrames':n}


def regions(im):
    import torch
    from rembg import remove,new_session
    from segment_anything import sam_model_registry,SamPredictor
    os.environ['U2NET_HOME']=str(MODELS)
    log('rembg person alpha + SAM prompted region masks')
    session=new_session('u2netp',providers=['CPUExecutionProvider'])
    alpha=np.asarray(remove(Image.fromarray(im),session=session).getchannel('A'))
    # rembg may include the DJ desk; chroma key complements rather than replaces it.
    alpha=np.minimum(alpha,key_alpha(im));Image.fromarray(alpha).save(OUT/'person-alpha.png')
    Image.fromarray(np.dstack((clean_rgb(im,alpha),alpha))).save(OUT/'portrait-static.webp',lossless=True)
    torch.set_num_threads(4)
    sam=sam_model_registry['vit_b'](checkpoint=str(MODELS/'sam_vit_b.pth'))
    device='mps' if torch.backends.mps.is_available() else 'cpu'
    sam.to(device=device);predictor=SamPredictor(sam);predictor.set_image(im)
    # Point/box prompts are normalized to the reference, not hard pixel paint masks.
    configs={
      'hair':{'box':[.23,.12,.75,.56],'points':[[.37,.30],[.64,.35],[.57,.47],[.52,.28],[.30,.47]],'labels':[1,1,1,0,1],'tipAxis':[.27,.58]},
      'skirt':{'box':[.38,.53,.91,.83],'points':[[.54,.62],[.69,.72],[.51,.77],[.60,.87]],'labels':[1,1,1,0],'tipAxis':[.57,.83]},
      'necklace':{'box':[.43,.305,.65,.36],'points':[[.515,.334],[.575,.332],[.54,.36]],'labels':[1,1,0],'tipAxis':None}}
    metadata={}
    for name,c in configs.items():
        points=np.array(c['points'])*[W,H];box=np.array(c['box'])*[W,H,W,H]
        if name=='hair':
            mask=np.zeros((H,W),np.float32);scores=[]
            for hair_box,hair_points in [([.22,.15,.51,.56],[[.34,.32],[.37,.43],[.38,.52]]),([.55,.13,.76,.56],[[.65,.35],[.66,.45],[.65,.51]])]:
                hp=np.array(hair_points+[[.52,.28],[.46,.44],[.55,.50],[.70,.31]])*[W,H]
                hm,hs,_=predictor.predict(point_coords=hp,point_labels=np.array([1,1,1,0,0,0,0]),box=np.array(hair_box)*[W,H,W,H],multimask_output=True)
                chosen=hm[int(np.argmax(hs))].astype('float32')
                roi_part=np.zeros((H,W),np.float32);bx1,by1,bx2,by2=np.round(np.array(hair_box)*[W,H,W,H]).astype(int);roi_part[by1:by2,bx1:bx2]=1
                mask=np.maximum(mask,chosen*roi_part);scores.append(float(np.max(hs)))
            # Semantic prompt ROI keeps clothes/skin out when SAM chooses a whole
            # person. Hair is dark; the two tip bands exclude the chest center.
            hsv=cv2.cvtColor(im,cv2.COLOR_RGB2HSV)
            mask*=((hsv[:,:,2]<130)&(im[:,:,0]<100)).astype('float32')
            # Exclude the torso center: only the two hanging hair strips receive
            # wind deformation, never the dark lace bodice of the same color.
            semantic=np.zeros((H,W),np.uint8)
            polygons=[[[.23,.20],[.47,.18],[.44,.31],[.39,.39],[.41,.47],[.36,.55],[.24,.48]],[[.59,.18],[.72,.19],[.72,.47],[.67,.54],[.59,.55],[.57,.45],[.64,.36]]]
            for poly in polygons:cv2.fillPoly(semantic,[np.round(np.array(poly)*[W,H]).astype('int32')],1)
            mask*=semantic
        else:
            masks,scores,_=predictor.predict(point_coords=points,point_labels=np.array(c['labels']),box=box,multimask_output=True)
            mask=masks[int(np.argmax(scores))].astype('float32')
        roi=np.zeros_like(mask);x1,y1,x2,y2=np.round(box).astype(int);roi[y1:y2,x1:x2]=1
        mask*=roi*(alpha/255)
        if c['tipAxis']:
            begin,end=c['tipAxis'];yy=np.arange(H)[:,None]/H
            mask*=np.clip((yy-begin)/(end-begin),0,1)
        # 16px feather width, expressed as ~3 sigma of Gaussian.
        mask=cv2.GaussianBlur(mask,(0,0),16/3)
        Image.fromarray(np.uint8(np.clip(mask*255,0,255))).save(OUT/f'{name}-mask.png')
        metadata[name]={'samScore':float(np.max(scores)),'prompt':c,'nonzeroPixels':int(np.sum(mask>.05)),'featherPixels':16}
    write_json(OUT/'region-masks.json',metadata)
    preview=Image.new('RGB',(W*3,H))
    for i,name in enumerate(['hair','skirt','necklace']):
        a=np.asarray(Image.open(OUT/f'{name}-mask.png'))/255
        shown=np.uint8(np.clip(im*.4+np.array([255,100,80])*a[:,:,None]*.6,0,255))
        preview.paste(Image.fromarray(shown),(i*W,0))
    preview.resize((1080,640)).save(OUT/'mask-overlay-preview.png')
    del predictor,sam


def depth(im):
    old=Image.open(ROOT/'dist/assets/portrait-depth.png')
    # Green reference can have a different crop despite same aspect; infer a new
    # aligned map, leave the currently used depth file untouched until approval.
    from transformers import AutoImageProcessor,AutoModelForDepthEstimation
    import torch
    model_id='depth-anything/Depth-Anything-V2-Small-hf'
    local=MODELS/'depth-anything-v2-small'
    log('Depth Anything V2 Small: generating aligned reference depth')
    processor=AutoImageProcessor.from_pretrained(str(local));model=AutoModelForDepthEstimation.from_pretrained(str(local))
    inputs=processor(images=Image.fromarray(im),return_tensors='pt')
    with torch.no_grad():pred=model(**inputs).predicted_depth
    pred=torch.nn.functional.interpolate(pred.unsqueeze(1),size=(H,W),mode='bicubic',align_corners=False)[0,0].numpy()
    lo,hi=np.percentile(pred,[1,99]);assert hi>lo
    result=np.uint8(np.clip((pred-lo)/(hi-lo),0,1)*255)
    old=np.asarray(old.convert('L').resize((W,H)))
    correlation=float(np.corrcoef(old.ravel(),result.ravel())[0,1])
    reused=correlation>=.95
    Image.fromarray(result).save(OUT/'depth-v2-comparison.png')
    Image.fromarray(old if reused else result).save(OUT/'portrait-depth.png')
    return {'model':model_id,'output':'portrait/portrait-depth.png','existingFileUnchanged':True,'oldNewCorrelation':correlation,'reusedExistingDepth':reused,'reason':'old/new depth correlation >= 0.95; reuse existing depth' if reused else 'composition comparison failed; generated aligned V2 Small depth'}


def contact(tiles):
    tw,th=210,250;canvas=Image.new('RGB',(9*tw,5*th),(19,27,23));draw=ImageDraw.Draw(canvas)
    try:font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',14)
    except OSError:font=ImageFont.load_default()
    entries=[]
    for row in range(3):
        for col in range(9):entries.append((Image.fromarray(tiles[row,col]),f'HEAD {row+1}:{col+1}'))
    for f,label in [('head-blink.webp','BLINK'),('head-mask.png','HEAD MASK'),('hair-mask.png','HAIR'),('skirt-mask.png','SKIRT'),('necklace-mask.png','NECKLACE'),('person-alpha.png','PERSON ALPHA'),('portrait-depth.png','DEPTH')]:
        if (OUT/f).exists():entries.append((Image.open(OUT/f),label))
    for body in ['body-calm','body-peak']:
        for endpoint in ['first','last']:
            file=OUT/f'{body}-{endpoint}.png'
            if file.exists():entries.append((Image.open(file),f'{body.upper()} {endpoint.upper()}'))
    for k,(im,label) in enumerate(entries):
        x=(k%9)*tw;y=(k//9)*th;im=im.convert('RGB');im.thumbnail((tw-12,th-32))
        canvas.paste(im,(x+(tw-im.width)//2,y+8));draw.text((x+8,y+th-21),label,font=font,fill=(242,239,232))
    canvas.save(OUT/'contact-sheet.png')


def ensure_models():
    MODELS.mkdir(exist_ok=True)
    models={
      'face_landmarker.task':'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
      'sam_vit_b.pth':'https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth',
      'u2netp.onnx':'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
      'depth-anything-v2-small/config.json':'https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf/resolve/main/config.json',
      'depth-anything-v2-small/preprocessor_config.json':'https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf/resolve/main/preprocessor_config.json',
      'depth-anything-v2-small/model.safetensors':'https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf/resolve/main/model.safetensors'}
    for name,url in models.items():
        dest=MODELS/name
        if dest.exists():continue
        dest.parent.mkdir(parents=True,exist_ok=True)
        temporary=dest.with_suffix(dest.suffix+'.download')
        run(['curl','-fL','--retry','2',url,'-o',temporary]);temporary.replace(dest)


def validate_outputs():
    atlas_data=json.loads((OUT/'head-atlas.json').read_text())
    assert Image.open(OUT/'head-atlas.webp').size==(TILE*9,TILE*3)
    assert len(atlas_data['cells'])==27
    for name in ['head-blink.webp','head-mask.png']:assert Image.open(OUT/name).size==(TILE,TILE)
    for name in ['hair-mask.png','skirt-mask.png','necklace-mask.png','portrait-depth.png']:assert Image.open(OUT/name).size==(W,H)
    tracks=json.loads((OUT/'body-head-track.json').read_text())
    for name,track in tracks.items():
        for suffix,expected in [('mp4','h264'),('webm','vp9')]:
            data=json.loads(subprocess.check_output([FFPROBE,'-v','error','-count_frames','-show_streams','-of','json',str(OUT/f'{name}.{suffix}')]))
            assert len(data['streams'])==1,'Unexpected audio track'
            stream=data['streams'][0]
            assert stream['codec_name']==expected and stream['width']==W and stream['height']==H
            assert stream['r_frame_rate']=='24/1'
            assert int(stream['nb_read_frames'])==len(track['frames'])
    qc=json.loads((OUT/'qc-report.json').read_text())
    for video in qc['videos']:
        assert video['retainedFrames']+video['discardedFrames']==video['totalFrames']
        body=video.get('bodyOutput',{})
        if body.get('status')=='prepared':
            assert all(not video['frames'][i]['reasons'] for i in range(body['sourceStartFrame'],body['sourceEndFrame']+1))
    log('Verified atlas/mask dimensions, codecs, 24fps, no audio, frame-track counts, QC accounting')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Validate existing output without processing')
    parser.add_argument('--source',type=Path,default=Path('/Users/guo/Doubao/chats/2026-10-11/new-chat/女DJ鼠标跟随视线九宫格'))
    parser.add_argument('--skip-regions',action='store_true',help='QC/atlas-only diagnostic run; report incomplete')
    parser.add_argument('--skip-depth',action='store_true',help='Diagnostic only; report incomplete')
    args=parser.parse_args()
    if args.check:
        validate_outputs();return
    for folder in [OUT,RAW,WORK]:folder.mkdir(parents=True,exist_ok=True)
    assert Path(FFMPEG).exists() and args.source.is_dir()
    ensure_models()
    assert longest_run([0,1,4,5,6,9])==[4,5,6]
    copy_sources(args.source);log('Raw copies SHA-256 verified; originals untouched')
    base_im=rgb(RAW/'绿幕图/g05-正视.png')
    # Protect opaque person interiors from cyan-smoke keying; green stays keyed.
    from rembg import remove,new_session
    os.environ['U2NET_HOME']=str(MODELS)
    person=remove(Image.fromarray(base_im),session=new_session('u2netp',providers=['CPUExecutionProvider']))
    rembg_alpha=np.asarray(person.getchannel('A'))
    Image.fromarray(rembg_alpha).save(OUT/'rembg-alpha.png')
    global PERSON_CORE
    PERSON_CORE=cv2.erode((rembg_alpha>248).astype('uint8'),np.ones((7,7),np.uint8)).astype(bool)
    a=key_alpha(base_im)
    reference={k:bounds(a,k=='upperBody') for k in ['foreground','upperBody']}
    assert all(v is not None for v in reference.values())
    detector=Face();base=detector.get(base_im);assert base is not None,'Reference face not found'
    anchors=[]
    for file in sorted((RAW/'绿幕图').glob('g*.png')):
        if '闭眼' in file.name:continue
        im=rgb(file);face=detector.get(im);assert face is not None,file
        tile=head_tile(im,face,base);dest=WORK/(file.stem+'.webp');Image.fromarray(tile).save(dest,quality=98)
        anchors.append({'id':file.name,'image':str(dest),'face':face})
    write_json(OUT/'anchors.json',[{'source':a['id'],'face':serial_face(a['face'])} for a in anchors])
    blink=rgb(RAW/'绿幕图/g05-闭眼.png');bf=detector.get(blink);assert bf is not None,'Blink face not found'
    Image.fromarray(head_tile(blink,bf,base)).save(OUT/'head-blink.webp',quality=98)
    head_mask(base)
    videos=preprocess(args.source);candidates,reports=scan(videos,detector,reference,base)
    tiles,cells=atlas(candidates,anchors,base)
    tracks={}
    for report in reports:
        if report['video'].startswith('body'):
            result=body_loop(report,base)
            if result:tracks[Path(report['video']).stem]=result
    write_json(OUT/'body-head-track.json',tracks)
    if not args.skip_regions:regions(base_im)
    depth_info=None if args.skip_depth else depth(base_im)
    contact(tiles)
    # Keep full landmarks in ignored local scan caches; ship only the requested
    # frame QC/pose/iris report, not a 50MB diagnostic point dump.
    public_reports=[{**r,'frames':[{**f,'face':({k:v for k,v in f['face'].items() if k!='points'} if f['face'] else None)} for f in r['frames']]} for r in reports]
    write_json(OUT/'qc-report.json',{'reference':{k:v.tolist() for k,v in reference.items()},'thresholds':{'position':.02,'scale':.03},'videos':public_reports,'depth':depth_info,'awaitingUserApproval':True,'complete':not args.skip_regions and not args.skip_depth and len(tracks)==2})
    lines=['# 人物素材处理报告','', '仅本地素材处理；页面、在线站点、GitHub 均未更新。','', '| 视频 | 总帧 | 可用帧 | 丢弃帧 | 丢弃原因（可重叠） |','|---|---:|---:|---:|---|']
    reason_names={'upperBody_scale_over_3pct':'上半身缩放超 3%','upperBody_position_over_2pct':'上半身位移超 2%','foreground_scale_over_3pct':'完整前景缩放超 3%','foreground_position_over_2pct':'完整前景位移超 2%','face_not_detected':'未检测到脸','watermark_repair_intersects_person':'水印修补区域碰到人物','missing_silhouette':'未检测到前景'}
    for r in reports:lines.append(f'| {r["video"]} | {r["totalFrames"]} | {r["retainedFrames"]} | {r["discardedFrames"]} | '+', '.join(f'{reason_names.get(k,k)}: {v}' for k,v in r['reasonCounts'].items())+' |')
    lines+=['','## 处理方法','- 所有视频通过 /opt/homebrew/bin/ffmpeg 去音轨、720×1280、24fps。','- 2% 位移、3% 缩放：同时检查完整前景和上半身包围盒，额外丢弃未检测到脸的帧。','- 逐帧 MediaPipe Face Landmarker，实际 yaw/pitch + 虹膜残差归类，不采用文件名或首尾方向。','- 眼角、鼻尖相似变换对齐，旋转上限 8°；原裁切比例，384px × 27 格。',f'- 实帧格 {sum(not c["interpolated"] for c in cells)}；OpenCV DIS 双向光流补齐格 {sum(c["interpolated"] for c in cells)}。','- 头部遮罩基于脸部轮廓和额头关键点，避开发丝，24px 羽化。','- 青色烟雾仅清理与背景连通区域，保护皮肤、项链和衣物。','- 原文件 SHA-256 对照见 raw-manifest.json。','', '## 身体循环']
    for r in reports:
        if 'bodyOutput' in r:lines.append(f'- {r["video"]}: `{json.dumps(r["bodyOutput"],ensure_ascii=False)}`')
    lines+=['','## 区域与深度','- rembg u2netp 人物 alpha + SAM ViT-B 带点和框的发梢/裙摆/项链分割。','- 发梢和裙摆沿向下的末端方向增加权重，16px 羽化；项链保持高光权重。',f'- 深度处理：`{json.dumps(depth_info,ensure_ascii=False)}`','', '## 需要人工确认','- contact-sheet.png：脸部一致性、闭眼帧、区域遮罩、循环首尾。','- 严格阈值可能导致可用身体区间短或为空；空区间不会用坏帧拼凑。','- 光流插值无法保证遮挡处无伪影，图集仍需视觉确认。','- 包围盒不证明每个手指姿势相同，最终身体视频需播放检查。','- 无 AI 自动质量保证或无缝承诺；seamRatio 是首尾像素差相对普通相邻帧的测量。','', '## 模型与工具来源','- https://developers.google.com/mediapipe/solutions/vision/face_landmarker/python','- https://github.com/danielgatis/rembg','- https://github.com/facebookresearch/segment-anything','- https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf','- https://docs.opencv.org/4.x/de/d4f/classcv_1_1DISOpticalFlow.html','', '## 重跑', '```sh', 'python3 -m venv .portrait-venv', '.portrait-venv/bin/pip install -r scripts/portrait-requirements.txt', '.portrait-venv/bin/python scripts/build-portrait-assets.py', '.portrait-venv/bin/python scripts/build-portrait-assets.py --check', '```', '', '首次运行会用 curl 下载官方模型到 .portrait-models/；缓存与虚拟环境不会提交。', '角度格中心采用 9 张锚点的测量值分段插值；补格不使用闭眼帧；虹膜与目标不一致的帧另见 head-selection-rejections.json。']
    (OUT/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    if not args.skip_regions and not args.skip_depth:validate_outputs()
    log('DONE: '+str(OUT))


if __name__=='__main__':main()
