# 星叶守望 · 开发笔记

给后续开发（包括新的 Claude 会话）看的项目说明：代码怎么组织、各系统怎么运作、改东西时要注意什么。

---

## 1. 运行与发布

- **本地运行**：`python serve.py` → http://localhost:8765 。这个服务器禁用了缓存，改完刷新即生效。也可以直接双击 `index.html`（需联网加载 three.js）。
- **技术栈**：纯 HTML + 原生 JavaScript，**没有构建步骤、没有 ES 模块**（所有脚本是普通 `<script>`，共享全局对象 `G`，这样双击 `file://` 也能运行）。three.js 固定 **r128**（cdnjs），后处理与工具类来自 `three@0.128.0/examples/js`（jsdelivr）。
- **发布**：仓库 https://github.com/Hitanorain/starleaf-wardens （`main` 分支），GitHub Pages 直接发布仓库根目录 → https://hitanorain.github.io/starleaf-wardens/
  - 改了 JS/CSS 后，把 `index.html` 里所有 `?v=N` 加一（缓存破坏），否则别人浏览器可能还在用旧文件。
  - 推送后约 1 分钟 Pages 更新；可用 `gh api repos/Hitanorain/starleaf-wardens/pages/builds/latest` 查看状态。
  - 仓库根目录有 `.nojekyll`，不要删。

## 2. 文件结构与加载顺序

`index.html` 按以下顺序加载（顺序有依赖，别打乱）：

| 文件 | 职责 |
|---|---|
| `js/config.js` | **全部数据表**：`G.CFG` 常量、`G.TOWERS`、`G.ENEMIES`、`G.WAVES`、`G.HERO`、`G.BLESSINGS`、`G.PIECES`（地形块形状）、`G.REGIONS`（扩张区域）、`G.BIOMES`（地图配色/光照/装饰色） |
| `js/models.js` | `G.M`：所有低多边形模型工厂（塔、敌人、仙子、古树、传送门、树木/仙人掌/雪人、陨石、曳光弹），以及材质工具 `M.mat` / `M.glow` / `M.lin` |
| `js/audio.js` | `G.Audio`：WebAudio 程序合成音效，`A.play('name')` |
| `js/fx.js` | `G.FX`：粒子池、闪光、柔边光环、光带拖尾、闪电、飘字 |
| `js/terrain.js` | `G.Terrain`：地面高度图网格（含高地）、上色、水面、实例化装饰、外围森林、建造网格、扩张空位预览 |
| `js/world.js` | `G.World`：地块数据、区域/开拓、传送门定位、寻路距离场、敌人路线光点、地块模型（树/岩石/水晶） |
| `js/game.js` | `G.S` 游戏状态；`Enemy` / `Tower` / `Proj` 类；英雄 `G.Hero`；波次；玩家操作 `G.act.*`；手牌与区域扩张逻辑 |
| `js/ui.js` | `G.UI`：HUD、建造栏、手牌栏、扩张面板、塔面板、提示框、标题画面交互、鼠标键盘输入、悬停预览 |
| `js/main.js` | 渲染器、场景、灯光、后处理管线、生物群系切换、镜头、`G.newMap` / `G.beginRun` / 缩略图、主循环 |

## 3. 核心概念

### 坐标
- 世界是 **28×20 格**（`CFG.W/H`），由 **7×5 个 4×4 区域**组成（`CFG.RS/RX/RY`）。开局只开拓中央 3×3 区域（`CFG.START_REGIONS`）。
- 格坐标 `(x, y)` ↔ 世界坐标：`Wd.wx(x) = x - W/2 + 0.5`，`Wd.wz(y) = y - H/2 + 0.5`。世界的 y 轴是高度，格坐标的 y 对应世界 z。
- 地势每级高 `CFG.STEP = 0.42`，最高 3 级。`Wd.top(t)` 是地块顶面高度（塔就放在这里）。

### 地块 `tile`
`{ x, y, h, minH, vh, type, locked, fixed, tower, onPath, deco, wx, wz }`
- `type`: `grass | rock | water | tree | crystal`。只有 `grass` 且 `h===0` 且未锁定才可通行；塔只能建在 `h>=1` 的 `grass/rock` 上。
- `locked`：未开拓。`fixed`：古树 / 传送门所在格，不可改。
- `vh`：**显示高度**，升降动画时在 `h` 的旧值和新值之间插值；渲染只看 `vh`，逻辑只看 `h`。

### 寻路
- `Wd.field(ov)`：从古树出发的 Dijkstra 距离场（8 方向，斜向不能切角）。`ov` 是 `Map<tile, 假设高度>`，用于"如果这样改地形"的预览与合法性检查。
- 敌人每到一格就沿距离场下降一步（`Wd.nextStep`）；飞行单位直线飞向古树。
- 任何改地形的操作都必须保证 `Wd.reachAll(field)`（所有传送门都能到古树）。
- 改完地形调用 **`Wd.recompute()`**：重算距离场、路线、`onPath`，并触发地面重绘。

### 区域扩张与传送门
- 传送门不存坐标，而是存"方向 + 固定行/列"（`axis: w/e/n/s` + `row` 或 `col`），由 `placePortals()` 放在该方向**已开拓范围的最外缘**。所以在传送门一侧扩张，它就会后退、路线变长。
- `Wd.checkExpand()` 先试放再完整还原，返回错误或 null；`Wd.expand()` 才真正生效。

## 4. 渲染要点（改画面前必读）

- **线性颜色空间**：渲染到后处理缓冲是线性的，最终由 `main.js` 里的调色 Shader 做 ACES 色调映射 + 伽马 + 饱和度/对比度/暗角。
  - 写颜色一律用 **`M.mat(0xRRGGBB)`**（自动 sRGB→线性并缓存）、**`M.glow(color, opacity, additive, boost)`**、**`M.lin(hex, boost)`**。直接 `new THREE.Color(hex)` 会显得发白。
  - **泛光阈值是 1.0**：只有亮度超过 1 的东西才发光。想让东西发光就用 `M.glow(..., boost>1)`；UI 范围圈之类不想发光的用 boost < 1。
- **地形是一张高度图网格**（`terrain.js`，每格细分 `SUB=10`，约 7.2 万顶点），高地不是独立方块：
  - `plateau()`：每块抬高地块有个"核心矩形"，与等高邻居相接的一侧延伸到边缘 → 同高地块自然融合；核心外用平滑曲线降下来并叠加噪声 → 圆润、不规则。
  - `T.paint(rect)`：重算高度与顶点色。传 `rect`（格坐标包围盒）只重绘局部，用于升降动画。全量约 11ms，局部约 3ms。
  - 法线由高度图差分直接算（不用 `computeVertexNormals`）。
  - 每个顶点不随地形变的数据（草色噪声、扰动）在 `buildGround` 里缓存一次。
  - 鼠标拾取**不对网格做射线检测**：`ui.js` 的 `pick()` 从最高层往下逐层与水平面求交（+ 塔模型射线检测）。
- **外围**：一张 120×100 的大地面（中间挖洞被精细地面盖住）+ 实例化森林 + 装饰土丘（只有外围土丘还在用 `chunkGeo` 挤出几何体）。
- **装饰**（草丛、石子、花/仙人掌/冰晶）都是 `InstancedMesh`，可见性由 `T.updateDecor()` 按地块状态刷新。
- **生物群系**：`G.applyBiome(b)` 切换天空、雾、灯光并调用 `T.setBiome(b)` 换配色。新增地图主要是在 `G.BIOMES` 加一项 + `models.js` 的 `M.tree` 分支 + `terrain.js` 里装饰/外围森林的分支。
- **光点/飘雪**：`world.js` 的 `Wd.fireflies`；`snowfall: true` 的地图改为下落的雪花。

## 5. 特效工具（`fx.js`）
- `FX.emit(pos, count, color, speed, life, up, gravity, spread, boost)`：粒子（加色混合，靠颜色衰减淡出）。
- `FX.flash(pos, color, size, dur)`：柔边光斑 + 白热中心。
- `FX.softRing(pos, color, r0, r1, dur, y, opacity, 'ring'|'disc', boost)`：贴地柔边光环（技能、古树光辉用它，比 `FX.ring` 柔和）。
- `new FX.Ribbon(color, width, n)`：面向镜头的渐隐光带拖尾，`push(pos)` 更新，`fade()` 收尾。
- `FX.add(fn)`：每帧调用 `fn(dt)`，返回 false 时移除。注意**暂停时 `dt=0` 也会被调用**，有位移/拖尾的特效要先 `if (dt <= 0) return true;`。

## 6. 塔与弹道
- `M.tower(type, level)`：三个等级是**完全不同的造型**。动画部件登记到返回值的 `spin`（`[obj, 轴, 速度]`）和 `bob`（`[obj, 基准y, 幅度, 频率, 相位]`），`Tower.update` 统一驱动。
- 弹道外观在 `Proj.LV[kind][level]`：速度、颜色、光体长宽、光晕、拖尾、星屑、螺旋、命中光效大小。新增塔时在这里加一套。
- 数值在 `G.TOWERS[type].levels[]`，高地加成见 `G.towerStats()`。

## 7. 界面
- 当前工具是一个字符串 `UI.tool`：`raise` / `lower` / `tower:<type>` / `piece:<手牌下标>` / `region:<候选下标>` / `cast:q`。`R` 旋转修改 `UI.rot`。
- 悬停预览全部在 `UI.frame()` 里（幽灵方块、范围圈、路线长度变化提示）。
- 通用提示框：元素加 `data-tip="key"`，内容在 `tipHtml()` 里生成。
- 图标 `UI.ic(src, emoji)`：图片加载失败时显示 emoji，所以缺图不会报错。
- 标题画面：`body.on-title` 时隐藏全部游戏 HUD；3D 预览通过 `camera.setViewOffset` 下移；地图卡缩略图由 `G.makeThumbs(seed, [biome])` 实时截图。

## 8. 踩过的坑

1. **CSS 选择器误伤 body**：`body.dataset.tool` 会让 `[data-tool=raise]` 也匹配到 `<body>`。查询按钮一定要限定范围（`#build-bar [data-tool=...]`）。
2. **浏览器缓存**：本地用 `serve.py`；线上靠 `?v=N`。
3. **窗口尺寸为 0**：页面在后台打开时画布是 0×0，`drawImage` 会抛错。截图类操作要先检查尺寸并 try/catch（缩略图已处理，并在 `resize` 时补拍）。
4. **高度合并**：`plateau()` 没命中时返回 0，必须 `if (ph > 0) y = Math.max(y, ph)`，否则水塘凹陷和未开拓区的下沉会被抹平。
5. **雾**：雾的远近每帧按镜头距离设置（`main.js` 主循环），否则大地图会整体发灰。
6. **新增点光源**会让所有材质重新编译（卡顿），尽量用发光材质 + 泛光代替。
7. **`InstancedMesh.setColorAt`** 首次调用时按当时的 `count` 分配颜色缓冲：先保持 `count = max` 写完颜色，最后再设实际数量。

## 9. 测试方法

没有自动化测试框架，靠在浏览器控制台跑模拟：
- `G.newMap(seed, 'forest'|'desert'|'snow'); G.beginRun();`
- 暂停后手动推进：`G.S.paused = true; for (...) { G.update(1/30); G.FX.update(1/30); G.Terrain.update(1/30, t); }`
- 用 `G.startWave()`、`G.act.placePiece / build / upgrade / expand`、`G.chooseBlessing(G.pickBlessings()[0])` 驱动一整局，检查有无报错、波次与生命变化。
- 截图检查效果时，注意"暂停时 dt=0"会让拖尾类特效停在原地（见第 5 节）。

## 10. 常见扩展怎么做

- **新塔**：`G.TOWERS` 加数值 → `M.tower` 加三级造型 → `Tower.update` 的开火分支 → `Proj.LV` 加弹道外观 → `ART_REQUESTS.md` 加图标需求。
- **新敌人**：`G.ENEMIES` + `M.enemy` 分支 + `G.WAVES` 里安排出场。
- **新地图（生物群系）**：见第 4 节"生物群系"。
- **新扩张区域**：`G.REGIONS` 加描述 + `Wd.makeRegion` 加布局生成 + （如有特殊效果）`act.expand` / `G.waveCleared` 里处理。
- **新祝福**：`G.BLESSINGS` 加一项，`apply(s)` 修改 `s.mods` 或资源。

## 11. 尚未实现的想法

- 塔与塔之间的相邻加成（参考图里的黄色"+1"格）
- 更多塔与英雄、多局之间的永久解锁
- 背景音乐
- 塔 / 敌人 / 露娜模型更圆润
- 雪地敌人路线颜色加深
