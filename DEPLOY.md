# QQ 音乐 · 让音乐发生

PC 优先的单页音乐空间，包含杂志式版式、人物深度视差和九方向视线、GSAP / ScrollTrigger / Lenis 编排、黑胶与反射舞台、配乐频谱、三色主题和官方界面预览。设计改动与文件清单见 DESIGN-NOTES.md。

## 本地预览

```sh
npm run preview
```

打开 http://127.0.0.1:4173/ 。ES 模块需要 HTTP 服务，不能直接通过 file:// 打开。

## 服务器部署

上传 dist/ 内全部文件到网站根目录，或解压服务器 ZIP。没有后端、数据库或二级页面；运行时不需要 Node.js、Python 或外部 CDN。字体、人物、深度图、官方界面、音频与依赖均在本地。

```nginx
server {
    listen 80;
    server_name your-domain.example;
    root /var/www/qq-music-universe;
    index index.html;
    location / { try_files $uri $uri/ =404; }
}
```

启用 mime.types，以正确提供 ES 模块、WOFF2、图片和 MP3；配置域名和 HTTPS。更新时上传整个 dist，保留带中文名的九张视线素材；也可修改 gaze-math.js 中的文件名配置。

## 音乐与降级

加载完成后选择「进入（有声）」或「静音进入」。声音开关始终可暂停/恢复，主动暂停后普通点击不会恢复音乐；切到后台暂停。频谱读取实际音频，暂停后光点停止响应。

小于 768px 或开启减少动态效果时使用普通滚动与淡入，无固定首屏和 scrub。移动端关闭反射与体积光。WebGL 不可用时保留静态人物、产品内容与提示。

## 检查与打包

```sh
npm run check
npm run package
```

修改中文文案后可运行 python3 scripts/fetch-fonts.py 下载新的字体子集，再将生成的 @font-face 合并到 style.css；部署本身无需运行下载脚本。

## 替换人物

人物仍是图片与深度图，九张素材只用于头部区域。替换最终人物时，同时准备相同姿势、相同尺寸/构图的九方向图片，以及匹配的深度图；调整 portrait.js 的头部裁切和柔边遮罩区域。不要只换原图而保留旧深度。

离线深度工具：python scripts/prepare-portrait.py reference.png depth-anything-v2-small.onnx 。仅此步骤需要 pillow、numpy、onnxruntime。Small 模型来源为 Hugging Face 的 Depth Anything V2 Small / ONNX Community，采用 Apache 2.0。网页使用本项目自己的 GLSL 视差实现，并非 DepthFlow 运行时。

## 素材与许可

人物和九方向图由用户提供，当前为 MVP 参考物料。QQ Music 标识来自 QQ 音乐官网，六张官方产品宣传图来自腾讯 App Store 页面。配乐 The Future Bass — Good_B_Music / Zakhar Valaha 来自 Pixabay，按 Pixabay Content License 使用。本页为独立产品展示设计。

Three.js / Reflector 和 Lenis 使用 MIT；GSAP 使用 Standard License。Noto Serif SC、Noto Sans SC、Instrument Serif、Inter 使用 SIL Open Font License。相关许可证在 dist/vendor/ 与 dist/assets/fonts/licenses/。
