# 部署与维护说明

本页面向站点维护者。普通访客看[使用说明](../README.md)即可；在自己的电脑上启动，请看[本地运行说明](../LOCAL_GUIDE.md)。

## 当前站点怎样运行

| 部分 | 做什么 |
| --- | --- |
| GitHub 仓库 | 保存程序源码和说明 |
| GitHub Pages | 提供在线入口，嵌入完整地图，并提供直接访问链接 |
| Render Web Service | 运行完整地图和 Node.js 后台，处理数据查询、云图与计算 |
| GitHub Release：`public-map-data` | 保存公开数据的长期备份，供服务器重启后恢复 |

**完整应用必须有后台。** GitHub Pages 不能运行 Node.js，把 `frontend/index.html` 直接放到 Pages，无法得到与本站相同的完整功能。[GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)

当前站点：[完整地图](https://space-enthusiast-map.onrender.com/) · [GitHub Pages 入口](https://cuteorca26.github.io/space-enthusiast-map/)。

## 在 Render 部署自己的免费实例

1. 把本仓库 Fork 到自己的 GitHub 账号。
2. 登录 [Render](https://dashboard.render.com/)，选择 **New → Blueprint**，关联自己的仓库。也可以从[本仓库部署入口](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fcuteorca26%2Fspace-enthusiast-map)进入，再核对实际关联的仓库。
3. Render 读取 `render.yaml` 后，检查 Web Service 的实例方案是 **Free**。
4. **把 `PUBLIC_DATA_REPOSITORY` 改成自己的 `账号/仓库名`。** 文件中的默认值是当前站点的仓库，Fork 后不能直接沿用它作为自己的备份目标。
5. 按下一节设置管理员口令摘要和备份令牌，不要添加付费数据库或持久磁盘。
6. 部署成功后，打开 Render 提供的 HTTPS 地址，确认地图可以显示。
7. 用管理员口令登录，逐项刷新需要的来源；等长期保存成功后，再确认备份存在。

项目使用 Docker，包含 Node.js 24、Linux Chromium 和 curl。`render.yaml` 已配置端口、健康检查及免费实例的内存和并发设置。免费实例上的重型刷新会排队；首次全量扫描可能很久。

## 管理员口令与备份令牌

这两项用途不同，不要混用：

| 配置 | 用途 | 放在哪里 |
| --- | --- | --- |
| 管理员口令 | 在地图页面登录，允许刷新公共数据和删除共享刷新历史 | 由维护者自己妥善保管；页面登录时输入 |
| `ADMIN_SECRET_SHA256` | 让后台验证管理员口令 | Render 的 Environment，保存口令的 SHA-256 摘要 |
| `GITHUB_DATA_TOKEN` | 让后台向指定 GitHub 仓库上传公开备份 | Render 的 Environment，作为服务器密钥保存 |
| `PUBLIC_DATA_REPOSITORY` | 指定备份所在的公开仓库 | Render 的 Environment，格式为 `账号/仓库名` |

不要把管理员口令、Token 或包含它们的配置文件提交到 GitHub，也不要填入公开网址。

### 设置管理员口令

在有 Node.js 的电脑上运行下面的命令，可以生成随机口令和对应摘要：

```sh
node -e "const c=require('node:crypto');const s=c.randomBytes(32).toString('base64url');console.log('管理员口令：'+s);console.log('ADMIN_SECRET_SHA256='+c.createHash('sha256').update(s).digest('hex'));"
```

自己保存“管理员口令”，把摘要填入 Render 的 `ADMIN_SECRET_SHA256`。保存设置并部署后，用原始口令在地图的“数据更新”中登录。

对外运行时，未配置口令会默认锁住公共刷新和共享历史删除；不是省略配置就允许所有人操作。登录有效期为 8 小时，服务器重启也会使会话失效。

### 设置 GitHub 备份 Token

在 GitHub 的 **Settings → Developer settings → Personal access tokens → Fine-grained tokens** 创建令牌：

1. 名称可以用 `space-map-public-data`，方便以后辨认。
2. 设置自己方便续期的到期时间，并记下日期；到期后需要换新令牌。
3. Repository access 选择 **Only select repositories**，只选备份使用的仓库。
4. Repository permissions 中，**Contents → Read and write**。Metadata 的读取权限通常自动附带；不需要额外给 Actions、Workflows 或账号管理权限。
5. 生成后，把令牌填入 Render 的 `GITHUB_DATA_TOKEN`，保存并部署。令牌不需要出现在使用说明、源码或页面里。

如果仓库属于组织，还可能需要组织审批，以 GitHub 的提示为准。[GitHub Token 官方说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

## 公共数据怎样长期保存

服务器本地文件用于运行时读取。配置 GitHub 备份后，公共数据刷新或共享历史删除，会更新标签为 **`public-map-data`** 的 Release 中的压缩备份。

- 只收集明确允许发布的公共数据文件，包括公共来源缓存和对应刷新历史。
- 不包含个人保存区域、账号密码、Space-Track 历史查询缓存、日志或环境变量。
- 先完成新备份上传，再清理旧备份；上传失败时保留已有完整备份。
- 启动时下载备份并校验内容，再恢复本地缓存。大备份需要额外等待时间。
- 页面会显示长期保存状态。**刷新成功与备份成功是两个结果，必须分别检查。**

备份可在 [当前站点的公共数据 Release](https://github.com/cuteorca26/space-enthusiast-map/releases/tag/public-map-data) 查看。Fork 的站点应查看自己的仓库。**这些备份任何人都能下载，只适合公开数据。**

程序对备份规模设有限制：压缩备份超过 1,900 MiB、原始数据总量超过 8 GiB 或文件数超过 3,000 时，会停止生成或上传，并保留上一次完整备份。GitHub 的单个 Release 附件上限为 2 GiB。[GitHub Releases 官方说明](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)

本方案提供长期保存，仍需要维护者续期令牌、检查保存结果并遵守平台规则。长期备份也不等于无限容量或无限历史。

### 长期备份异常

| 提示或现象 | 先检查什么 |
| --- | --- |
| 令牌失效、401 或 403 | Token 是否到期、被撤销，或尚未获得组织审批 |
| 无法写入仓库 | Token 是否选对仓库，Contents 是否为 Read and write，备份目标是否写对 |
| 上传中断、限流或网络错误 | 等接口恢复后重试，查看页面保存状态和 Render 日志 |
| 超过备份大小或数量限制 | 检查共享历史的规模；由管理员确认后删除不需要的历史，或另行规划存储 |
| 重启后数据较旧 | 核对最近一次长期保存成功的时间；未成功备份的新数据不会因重启自动补回来 |

令牌到期后，读取已有公开备份会回退到公开访问，因此已有备份通常仍可恢复；新备份写入仍需有效令牌。换好令牌后，应再次检查长期保存状态。不要只因为服务器当前能显示新数据，就认定它已经保存到 GitHub。

## 免费方案有什么限制

当前方案使用 Render Free 实例，不添加收费数据库、磁盘或其他付费资源。它能免费运行，但资源有限：

- 没有访问约 15 分钟后会休眠，再次打开通常需要约一分钟唤醒。
- 免费实例的 CPU 和 512 MB 内存有限。大量卫星、云图处理、全量抓取和多人后台计算，可能导致等待、排队或内存压力。
- 免费实例的本地文件会在休眠、重启或重新部署后丢失，因此依赖成功写入的 GitHub 备份恢复。
- 工作区每月共享 750 小时的免费实例运行额度。其他免费服务也会占用额度，耗尽后可能暂停服务。
- 流量、构建等还有各自的额度。超额后的收费或停用行为与账号的付款设置、消费限制有关，应在 Dashboard 中核对，不能把“Free 实例”理解成账号所有用量都无限免费。
- 外部数据源可能限流、拒绝云服务器访问或更改接口；没有刷新成功时，本站仍只能显示之前保存的数据。

维护者应以 [Render 免费方案的当前规则](https://render.com/docs/free)为准。不需要用持续访问来阻止休眠。免费 Render PostgreSQL 有到期限制，不能替代本项目需要的长期保存方案。

## 设置 GitHub 在线入口

1. 在自己的仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。
2. 在 **Settings → Secrets and variables → Actions → Variables** 新增 `APP_URL`，填入完整应用的 **HTTPS 地址**。
3. 在 **Actions → Publish online map entry** 手动运行工作流。
4. 工作流成功后，打开自己的 Pages 网址，检查嵌入地图和直接访问链接。

`APP_URL` 只是公开的访问地址，不应携带账号密码、Token、查询参数或片段。未配置时，入口会显示“在线地图正在准备中”。

## 更新已上线的站点

当前站点通过公开仓库网址连接 Render。需要更新程序时：

1. 把代码提交并推送到 GitHub。
2. 确认 GitHub Actions 检查通过。
3. 打开 [当前 Render 服务页](https://dashboard.render.com/web/srv-db1dm4c9v7es73f34jkg)，选择 **Manual Deploy → Deploy latest commit**。
4. 等部署完成，检查地图、管理员登录和公共数据恢复状态。

只改 README 或使用说明，无需重启地图后台。GitHub Pages 入口会按工作流发布。

通过公开仓库网址创建的服务不支持自动部署；需要自动部署时，在 Render 关联自己的 GitHub 账号及仓库，再配置相应选项。[Render 部署官方说明](https://render.com/docs/deploys)

## 部署到自己的服务器

项目也可以用 Docker 运行。先按[配置示例](../.env.example)准备自己的 `.env`，设置管理员摘要；需要 GitHub 备份时，再设置目标仓库和 Token。

```sh
docker build -t space-enthusiast-map .
docker run -d --name space-map --env-file .env -p 10000:10000 -v space-map-data:/app/data space-enthusiast-map
```

用 HTTPS 反向代理提供公开访问。示例中的命名卷会保留 `data`，但服务器磁盘本身仍需要备份。不要将私人数据、环境文件或日志放进公开仓库。

| 配置 | 说明 |
| --- | --- |
| `HOST` | 本地默认 `127.0.0.1`；Docker / Render 使用 `0.0.0.0` |
| `PORT` | 本地默认 `8765`；Docker / Render 配置为 `10000` |
| `DATA_DIR` | 服务端数据目录；Docker 示例为 `/app/data` |
| `MEMORY_BUDGET_MODE` | 免费实例使用 `1`；内存充足的自有服务器可设 `0` |
| `/api/health` | 服务健康检查地址 |

`npm start` 不会自动读取 `.env`，请由启动环境传入变量；Docker 示例用 `--env-file` 明确加载。

修改程序后可运行 `npm test`。检查 Pages 构建时，配置 `APP_URL` 并运行 `npm run build:pages`。GitHub Actions 还会构建 Docker 镜像并检查 Linux 容器启动。
