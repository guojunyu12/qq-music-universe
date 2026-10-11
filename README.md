# QQ 音乐 · 让音乐发生

PC 优先的单页产品展示：杂志式字体与 12 栏网格、Three.js 黑胶与反射舞台、九方向人物视线、深度视差、配乐频谱、三色主题和 GSAP / Lenis 滚动编排。

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

人物使用九方向头部图的柔边混合与深度视差。当前为 MVP 素材。来源、字体与第三方许可见页面「素材来源」、`DESIGN-NOTES.md`、`dist/vendor/` 和 `dist/assets/fonts/licenses/`。本页为独立展示设计。
