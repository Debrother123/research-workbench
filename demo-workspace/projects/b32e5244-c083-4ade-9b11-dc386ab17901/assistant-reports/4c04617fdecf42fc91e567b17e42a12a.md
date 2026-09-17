# PerturbationBaselines2 笔记框架版结构报告

日期：2026-09-16 ｜ 项目：`b32e5244-c083-4ade-9b11-dc386ab17901` ｜ 修订：按重构版笔记框架整理

## 修正原因

第一版按“数据准备 / 简单基线 / 深度学习 / 嵌入 / 结果 / 调度”的仓库工程职责分组，源码清楚，但不服从重构版笔记的论证主线。现在改为按笔记阅读顺序组织。

## 7 个根节点

1. 问题与实验地图
2. Benchmark 1 · 未见双扰动
3. Benchmark 2 · 未见单扰动
4. 完整模型 vs 简单基线（Fig.2a）
5. 固定线性模型替换 G/P（Fig.2b/c）
6. 模型实现与运行细节
7. 证据边界、冲突与结论

## 跨章节边（12）

- 问题地图指向两套 benchmark。
- 两套 benchmark 调用同一模型实现层。
- Benchmark 2 进入 Fig.2a 完整模型比较；模型实现提供预测。
- Fig.2a 进一步进入 Fig.2b/c 固定 linear decoder 的 representation 分析。
- 四条分析主线最终收束到证据边界与结论。

跨章节边均带“推断：”或“评价协议：”，不冒充逐行 tensor flow。

## 保留与边界

- 保留 23 个 AST 候选和 23 个脚本模块；根节点从 6 个调整为 7 个。
- 不执行作者代码，不修改 `original/` 或 `working/`。
- 52 个笔记锚点按重构版笔记重新映射；根节点锚定到对应章节。

## 最终验收（2026-09-16）

- Verified — 最终项目 revision：v5；节点 53（7 根分组 + 23 脚本 + 23 AST 候选）；边 12；笔记锚点 53/53。
- Verified — 重构版笔记已重新同步：SHA `3fff803350ad3595...` → `32b693ea5d8fe026...`，使用 `frontend/sync-note-perturbation2.py`。
- Verified — 浏览器 `frontend/verify-newproj2.cjs` PASS：7 个根节点、12 条边、8 条推断边、1 条评价协议边、脚本层展开、hover 链、Additive/Linear/CPA/scGPT embedding 四类笔记跳转，零 console/page error。
- Verified — `assistant.py verify` 返回 `valid`；未修改 `original/` 或 `working/`，未执行作者代码。