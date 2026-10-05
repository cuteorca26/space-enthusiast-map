# 航天爱好者地图（@CuteORCA）

二维世界地图、三维地球、航空通告、海上航警、发射预告、卫星轨道和弹道演示。

这份副本已经适配在线托管，同时保留本地启动方式。原始使用说明见 [LOCAL_GUIDE.md](LOCAL_GUIDE.md)。

**在线地图：[GitHub 在线入口](https://cuteorca26.github.io/space-enthusiast-map/) · [直接打开完整地图](https://space-enthusiast-map.onrender.com/)**

## 实际在线验收（2026-10-05）

已在 Bill's workspace 的 Render Free 新加坡实例上进行真实联网刷新，并从 GitHub Pages 入口检查地图画面。以下是本轮实际结果，不能据此保证外部数据源以后始终可用。

| 功能或数据源 | 本轮结果 |
| --- | --- |
| 地图与卫星轨道显示 | 二维地图、三维地球、云图叠加和代表卫星轨道均正常显示 |
| 卫星目录 | 保存 31,361 个在轨对象，其中 16,431 个在役卫星；SATCAT 资料 70,882 条。ACTIVE 接口返回 403，其他公开来源已补齐轨道 |
| NOAA 卫星云图 | 48 个小时节点；北京时间 2026-10-05 09:00 的真实云图生成成功 |
| HYDROPAC | 136 条当前或未来通告，43 条可绘制边界；NGA 返回 503，备用公开文本来源成功 |
| NAVAREA | 七个海区、254 条来源通告，派生 272 条区域记录，其中 79 条可绘制；备用来源成功 |
| 发射预告 | 400 次计划发射、25 个发射场，完整刷新成功 |
| 后台轨迹计算 | 十秒轨迹传播成功，NRLMSISE-00 大气模型正常运行 |
| FAA 全球 NOTAM | 329 个区域中有 7 个返回 403；重试后仍不完整，本轮验收未通过，未发布部分数据 |
| 中国海事局航警 | 16 个海事局、180 天完整回溯，扫描 6,766 个详情页；保存 500 条当前或未来航警，其中 103 条可绘制边界；来源错误和覆盖缺失均为零，首次扫描约 26 分钟 |

通告正文无法可靠解析成边界时，保留文本记录并说明原因，不把参考点或不完整坐标粗略画成区域。FAA 刷新期间，已保存的海上通告与服务健康检查仍可读取；网页能够继续显示地球、云图和卫星轨道。13 项自动测试和 Linux 容器构建检查均已通过。

## 在线运行方式

**GitHub 保存代码和发布访问入口；Render 运行 Node.js 后台和完整地图。**

GitHub Pages 不运行 Node.js 后台。把 `frontend/index.html` 直接上传到 Pages 会导致 `/api/` 数据刷新、云图、历史查询和后台计算无法使用，因此本项目让 Pages 嵌入完整在线应用，并提供直接全屏访问链接。

### 1. 发布代码

将本目录发布到 GitHub 的 `space-enthusiast-map` 仓库，默认分支为 `main`。不提交 `node_modules`、Windows 内置运行环境、日志、个人缓存或账号密码。

### 2. 免费部署完整应用

可使用 [本项目的 Render 部署入口](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fcuteorca26%2Fspace-enthusiast-map)，登录后检查实例为 **Free** 再部署。

1. 登录 [Render](https://dashboard.render.com/)。
2. 选择 **New → Blueprint**，关联这个 GitHub 仓库。
3. Render 会读取仓库中的 `render.yaml`，创建名为 `space-enthusiast-map` 的 Docker Web Service。
4. 确认实例为 **Free**，不选择收费数据库、持久磁盘或付费实例。
5. 部署完成后，打开 Render 提供的 `https://…onrender.com` 地址。
6. 初次运行没有数据缓存，在“数据更新”中手动刷新需要的数据源。

Docker 镜像包含 Linux Chromium，供 FAA 的浏览器模式使用，以及卫星目录下载需要的 curl；FAA 自动恢复在 Linux 使用逐个 FIR 的完整分页查询。中国海事局的 HTTP、HTTPS 详情链接和跳转均使用对应协议读取，临时连接中断或超时最多尝试三次。云图文件使用 Node.js 下载，解码在临时工作线程中串行执行，完成后释放 HDF5 内存，不依赖 Windows PowerShell。发射预告每页读取 100 条，以减少公开数据源的请求次数。Node.js 版本固定为 24 系列，依赖版本由锁文件固定。

### 3. 启用 GitHub 在线访问入口

1. GitHub 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。
2. **Settings → Secrets and variables → Actions → Variables** 新增仓库变量 `APP_URL`，值为上一步得到的完整 HTTPS 应用网址。
3. 在 **Actions → Publish online map entry** 手动运行工作流。
4. 工作流成功后，Pages 的公开地址会显示完整在线地图。

`APP_URL` 没有配置时，入口会如实显示“在线地图正在准备中”，不会把静态页面冒充完整应用。

## 免费方案与本地使用的差异

- Render 免费服务闲置约 15 分钟后休眠，再次访问通常需要约一分钟启动。
- 免费实例只有 512 MB 内存和有限 CPU，首次全量数据刷新、FAA 浏览器访问及云图处理可能较慢，重负载仍可能超过资源限制。未完成真实在线验收前，不能承诺所有重型功能与本地电脑性能相同。
- 在线版按顺序处理重型刷新；切换数据源时释放上一数据源的工作内存，再从服务器临时磁盘读取完整缓存。FAA 和中国航警的首次扫描也在后台执行，页面显示进度并自动读取完成结果；原版完整回溯范围保持不变。已经保存的数据与健康检查在刷新期间仍可读取。其他重型计算可能排队。本地启动保持原有并行方式。内存充足的自有服务器可以设置 `MEMORY_BUDGET_MODE=0`。
- 服务重启、休眠或重新部署会清除服务端临时缓存与刷新历史。若要求这些历史长期保存，需要另外配置持久存储。
- 在线“保存区域”使用浏览器 IndexedDB，个人区域不会写入公共服务器，也不受服务器休眠清理影响。更换浏览器或清理网站数据后，需要重新保存；跨设备不自动同步。
- 同一个在线服务的公共数据源缓存和刷新历史由访客共享。个人坐标、轨迹等仍沿用原应用的浏览器保存方式。
- 数据源可能对云服务 IP 限流或拒绝访问；FAA、CelesTrak、海事和云图的真实联网刷新需要在部署后逐项验收。
- 卫星历史查询仍需要使用者自己的 Space-Track 账号。凭据只用于查询；不要提交到 GitHub 或放入 `APP_URL`。
- 使用免费实例，不添加付费升级。本项目不会通过持续请求绕过平台休眠限制。

当前服务通过公开仓库网址连接。后续更新代码后，请在 [Render 服务页](https://dashboard.render.com/web/srv-db1dm4c9v7es73f34jkg) 选择 **Manual Deploy → Deploy latest commit**。如需自动更新，先在 Render 连接自己的 GitHub 仓库账号；公开仓库网址连接本身不支持自动部署（[官方说明](https://render.com/docs/deploys)）。GitHub Pages 入口仍会自动发布。

官方说明：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)、[Render 免费限制](https://render.com/docs/free)。

## 本地运行

安装 Node.js 24 后：

```sh
npm ci
npm start
```

浏览器打开 `http://127.0.0.1:8765/`。如保留原发布包中的 `runtime` 和 `node_modules`，原 Windows 启停文件也可继续使用。此 GitHub 版本不包含 90 MB 的 Windows Node.js 可执行文件。

## 在自己的服务器运行

```sh
docker build -t space-enthusiast-map .
docker run -d --name space-map -p 10000:10000 -v space-map-data:/app/data space-enthusiast-map
```

通过 HTTPS 反向代理公开服务。挂载的数据目录可保留服务端缓存；`DATA_DIR` 可指定其他持久目录。`HOST` 默认 `127.0.0.1`，Docker/Render 配置为 `0.0.0.0`；端口通过 `PORT` 或 `--port=` 配置。健康检查是 `/api/health`。

## 检查

```sh
npm test
npm run build:pages
```

测试覆盖云端启动、地图依赖和后台接口、HTTPS 同源写入、禁止公开源代码/私人数据目录、浏览器区域保存与恢复、云图下载失败保留已有文件、云图导航读取与解码、Linux FAA 恢复的完整分页检查、免费实例数据源排队与健康检查响应、中国航警文本保留与网页内存释放，以及 HTTP/HTTPS 链接、跨协议跳转和连接中断后的重试。GitHub Actions 还会构建 Docker 镜像并检查 Linux 容器启动。

保留原作者署名。项目许可未在原发布包中明确提供，此副本不自行添加开源许可证。
