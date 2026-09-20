# 城事通 · 政府端

Vue 3 + TypeScript + Vite 实现的城市问题协同工作台。

## 启动

推荐 Node.js 24.15+（项目依赖的 npm-run-all2 要求）。

```sh
npm install
npm run dev -- --host 127.0.0.1
```

浏览器打开终端给出的地址（默认 http://127.0.0.1:5173）。

```sh
npm run build
npm run preview
```

## 功能

- 从 `Government_Be` 实时加载问题列表和问题详情。
- 百度地图（JS API WebGL 版）实时底图：按问题状态着色的点标记、悬停放大、选中高亮、缩放、视野重置和点位名称开关。
- 未配置密钥或脚本加载失败时，自动回退到内置的南京城区 SVG 示意地图，页面不会报错。
- 地图与问题列表共用搜索和筛选条件；统计卡片可以快速筛选状态。
- 详情抽屉、现场图片预览、责任人分配及进度更新。
- 使用问题单 `version` 做并发更新，避免覆盖其他管理员刚保存的内容。
- 问题管理独立列表视图、责任分配待办视图、当前筛选结果 CSV 导出。
- 窄屏下地图和列表上下排列。

地图底图为百度地图真实底图，问题数据、图片和处置结果均来自后端。当前版本尚未实现登录鉴权。

## 后端地址配置

仓库中的 `.env` 同时保留本地和服务器两套地址，修改 `VITE_API_MODE` 即可切换：

```dotenv
VITE_API_MODE=local
VITE_LOCAL_API_BASE_URL=http://localhost:8080/
VITE_SERVER_API_BASE_URL=https://api.example.gov.cn/
```

可选值为 `local` 或 `server`。修改后需要重启 `npm run dev`，生产环境则需重新构建。个人配置可写入不会提交的 `.env.local`。后端需把当前前端来源加入 `CORS_ALLOWED_ORIGINS`。

## 地图接入（百度地图）

地图由 `src/components/IssueMap.vue` 渲染，对外接口保持不变：输入 `issues`、`selected`，输出 `select` 事件。

### 配置密钥

1. 在 [百度地图开放平台](https://lbsyun.baidu.com/) 控制台创建应用，应用类型选择**浏览器端**，在 Referer 白名单中填写本地调试地址和上线域名。
2. 复制 `.env.example` 为 `.env.local`，填入密钥：

   ```
   VITE_BAIDU_MAP_AK=你的密钥
   ```

   `.env.local` 已被 `.gitignore` 的 `*.local` 规则忽略，不会提交。
3. 重启 `npm run dev`。密钥由 `index.html` 中的 `%VITE_BAIDU_MAP_AK%` 在构建时注入 SDK 脚本地址，源码里不出现密钥。

`.env` 中把 `VITE_BAIDU_MAP_AK` 留空即为未配置状态，此时地图回退为内置示意图，其余功能不受影响。

> 前端密钥一定会出现在浏览器和构建产物中，无法真正保密。日常依赖 Referer 白名单防护，商用或高价值场景请改为后端代理签名。

### 坐标系

百度底图使用 **BD-09**，而国内上报数据通常是 GCJ-02（高德、腾讯等）或 WGS-84（GPS 原始）。直接叠加会产生约 900 米的系统性偏移，所以 `src/utils/coord.ts` 会先做转换再上图。

- 数据坐标系由 `SOURCE_COORD_SYSTEM` 决定，当前为 `"gcj02"`。接入真实后端时请改为后端实际返回的坐标系（`"gcj02"` / `"wgs84"` / `"bd09"`）。
- `"bd09"` 表示后端已返回百度坐标，此时不做任何转换。
- 地图初始视野由 `IssueMap.vue` 里的 `INITIAL_CENTER` 决定，当前是南京中心城区。

### 其他

- SDK 通过 `index.html` 的 `<script>` 标签加载（官方接口内部使用 `document.write`，动态注入会破坏页面，不要改成运行时插入）。
- 类型声明在 `src/types/bmapgl.d.ts`，只覆盖当前用到的接口，新增能力时请对照官方文档补充。
- 底图版权标识由百度地图自身渲染，自定义浮层（图例）已抬高避让，请勿遮挡。

## 后端对接

数据模型位于 `src/data/issues.ts`，HTTP 调用集中在 `src/api/issues.ts`。当前已接入：

- `GET /api/v1/issues`：加载问题列表；
- `GET /api/v1/issues/{id}`：打开详情时获取最新数据；
- `PATCH /api/v1/issues/{id}`：保存责任人与进度。

`Issue` 字段映射如下：

| 字段 | 含义 |
| --- | --- |
| id | 问题单唯一编号 |
| title | 展示标题；后端无标题时可从描述截取 |
| submitter | 提交人 |
| submittedAt | 提交时间 |
| longitude / latitude | 经度 / 纬度，数字 |
| images | 图片 URL 数组 |
| type | 问题类型 |
| description | 问题详细描述 |
| assignee | 责任人，未分配为空字符串 |
| progress | 待分配 / 待处理 / 处理中 / 已完成 |
| address | 展示地址，可由后端提供或逆地理编码生成 |
| version | 乐观锁版本，更新时原样传回后端 |

后端返回的 `/media/...` 相对图片地址会自动补成当前 API 主机的完整地址，因此前后端分域部署时图片仍可正常显示。真实系统建议进一步使用责任人 ID，并由后端提供人员列表和权限控制。

地图已接入百度地图真实底图，替换时保持 `src/components/IssueMap.vue` 的 `issues`、`selected` 输入及 `select` 事件接口即可，后端接入后无需改动该组件。接入前确认后端经纬度坐标系与 `SOURCE_COORD_SYSTEM` 一致（见上文「坐标系」）。

## 验证记录

- `pnpm run build`：Vue 类型检查和 Vite 生产构建通过。
- 后端 `IssueControllerTest` 覆盖建单、列表、详情和更新契约，确保本页面使用的字段与状态值一致。
- 页面保留加载失败、手动重试、保存失败和并发版本冲突的反馈入口。
