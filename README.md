# QQ 音乐 · 让音乐发生

PC 优先的单页产品展示：杂志式字体与 12 栏网格、Three.js 黑胶与反射舞台、视频人物、连续视线与自动眨眼、深度视差、配乐频谱、三色主题和 GSAP / Lenis 滚动编排。

## 预览与检查

```sh
npm run preview
npm run check
```

打开 http://127.0.0.1:4173/ 。应用为完整静态页面；运行与检查不需要安装 npm 依赖。修改滚动库时才需要 `npm install` 和 `npm run vendor:motion`。

## GitHub Pages

`main` 分支保存完整源码；`gh-pages` 分支根目录保存 `dist/` 的全部文件，GitHub Pages 发布来源为 `gh-pages / (root)`。`.nojekyll` 保证资源按原样发布。

更新网站后，在本地项目执行：

```sh
npm run check
git add .
git commit -m "Update landing page"
git push origin main
git subtree push --prefix=dist origin gh-pages
```

上述命令更新完整源码，再将 `dist/` 推送到发布分支；GitHub 自动部署新版本。需要已配置 GitHub 的 Git 推送权限。

所有字体、人物图、深度图、官方宣传图和音乐均在仓库内，使用相对路径，支持 GitHub Pages 的仓库子路径。手机与减少动态模式关闭固定画面和 scrub；手机关闭反射与体积光。

人物使用静音绿幕身体视频、9×3 头部图集双线性混合、自动眨眼与深度视差；发梢、裙摆、项链和舞台联动实时频谱。图集/视频/WebGL 不可用时保留分层降级。头部裁切边界采用无 mipmap 的线性采样及透明羽化，章节目录和侧栏已去除括号编号。

当前是 MVP 素材，身体循环时长受合格帧限制。处理与验证记录见 `PORTRAIT-IMPLEMENTATION.md`、`dist/assets/portrait/REPORT.md`。字体与第三方许可见 `dist/vendor/` 和 `dist/assets/fonts/licenses/`。本页为独立展示设计。
