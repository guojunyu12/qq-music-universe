# 人物素材处理报告

仅本地素材处理；页面、在线站点、GitHub 均未更新。

| 视频 | 总帧 | 可用帧 | 丢弃帧 | 丢弃原因（可重叠） |
|---|---:|---:|---:|---|
| body-calm.mp4 | 97 | 31 | 66 | 上半身缩放超 3%: 66 |
| body-peak.mp4 | 97 | 17 | 80 | 上半身缩放超 3%: 77, 上半身位移超 2%: 34 |
| head-row1-a.mp4 | 97 | 31 | 66 | 上半身缩放超 3%: 66, 上半身位移超 2%: 35 |
| head-row1-b.mp4 | 48 | 11 | 37 | 上半身缩放超 3%: 37 |
| head-row2-a.mp4 | 97 | 11 | 86 | 上半身缩放超 3%: 86, 上半身位移超 2%: 14, 完整前景缩放超 3%: 43 |
| head-row2-b.mp4 | 121 | 0 | 121 | 上半身位移超 2%: 53, 上半身缩放超 3%: 121 |
| head-row3-a.mp4 | 121 | 1 | 120 | 上半身位移超 2%: 52, 上半身缩放超 3%: 120, 完整前景缩放超 3%: 5 |
| head-row3-b.mp4 | 97 | 29 | 68 | 上半身缩放超 3%: 68, 上半身位移超 2%: 15 |

## 处理方法
- 所有视频通过 /opt/homebrew/bin/ffmpeg 去音轨、720×1280、24fps。
- 2% 位移、3% 缩放：同时检查完整前景和上半身包围盒，额外丢弃未检测到脸的帧。
- 逐帧 MediaPipe Face Landmarker，实际 yaw/pitch + 虹膜残差归类，不采用文件名或首尾方向。
- 眼角、鼻尖相似变换对齐，旋转上限 8°；原裁切比例，384px × 27 格。
- 实帧格 10；OpenCV DIS 双向光流补齐格 17。
- 头部遮罩基于脸部轮廓和额头关键点，避开发丝，24px 羽化。
- 青色烟雾仅清理与背景连通区域，保护皮肤、项链和衣物。
- 原文件 SHA-256 对照见 raw-manifest.json。

## 身体循环
- body-calm.mp4: `{"status": "prepared", "sourceStartFrame": 0, "sourceEndFrame": 30, "fps": 24, "frames": 24, "duration": 1.0, "crossfadeFrames": 7, "loopBlend": "motion-compensated bidirectional DIS flow", "seamMeanPixelDelta": 2.1793214699074075, "medianAdjacentDelta": 1.183427734375, "seamRatio": 1.8415332061305507}`
- body-peak.mp4: `{"status": "prepared", "sourceStartFrame": 0, "sourceEndFrame": 16, "fps": 24, "frames": 10, "duration": 0.4166666666666667, "crossfadeFrames": 7, "loopBlend": "motion-compensated bidirectional DIS flow", "seamMeanPixelDelta": 2.0005855758101854, "medianAdjacentDelta": 1.8513878038194445, "seamRatio": 1.0805869908416506}`

## 区域与深度
- rembg u2netp 人物 alpha + SAM ViT-B 带点和框的发梢/裙摆/项链分割。
- 发梢和裙摆沿向下的末端方向增加权重，16px 羽化；项链保持高光权重。
- 深度处理：`{"model": "depth-anything/Depth-Anything-V2-Small-hf", "output": "portrait/portrait-depth.png", "existingFileUnchanged": true, "oldNewCorrelation": 0.9637597568095968, "reusedExistingDepth": true, "reason": "old/new depth correlation >= 0.95; reuse existing depth"}`

## 需要人工确认
- contact-sheet.png：脸部一致性、闭眼帧、区域遮罩、循环首尾。
- 严格阈值可能导致可用身体区间短或为空；空区间不会用坏帧拼凑。
- 光流插值无法保证遮挡处无伪影，图集仍需视觉确认。
- 包围盒不证明每个手指姿势相同，最终身体视频需播放检查。
- 无 AI 自动质量保证或无缝承诺；seamRatio 是首尾像素差相对普通相邻帧的测量。

## 模型与工具来源
- https://developers.google.com/mediapipe/solutions/vision/face_landmarker/python
- https://github.com/danielgatis/rembg
- https://github.com/facebookresearch/segment-anything
- https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf
- https://docs.opencv.org/4.x/de/d4f/classcv_1_1DISOpticalFlow.html

## 重跑
```sh
python3 -m venv .portrait-venv
.portrait-venv/bin/pip install -r scripts/portrait-requirements.txt
.portrait-venv/bin/python scripts/build-portrait-assets.py
.portrait-venv/bin/python scripts/build-portrait-assets.py --check
```

首次运行会用 curl 下载官方模型到 .portrait-models/；缓存与虚拟环境不会提交。
角度格中心采用 9 张锚点的测量值分段插值；补格不使用闭眼帧；虹膜与目标不一致的帧另见 head-selection-rejections.json。

## 循环时长调整

按用户要求，两段身体循环在原有基础上增加 2 秒，使用双向 DIS 光流补帧保持 24fps；不是新增拍摄动作。头部位置轨迹同步重采样，原始物料保持不变。

- body-calm: 1.000 → 3.000 秒，72 帧。
- body-peak: 0.417 → 2.417 秒，58 帧。
