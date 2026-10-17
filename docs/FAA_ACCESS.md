# FAA 拒绝访问：原因、当前处理和正式接入

2026-10-17 云端采集的入口检查收到 **HTTP 403 / Access Denied**，尚未开始扫描全部 FIR。这说明此次失败发生在来源访问阶段，不能归因于多边形解析，也没有证据表明某些通告确实不存在。仅凭 403 无法确认 FAA 具体使用了哪条访问规则：是否涉及出口地址、请求行为、访问政策或系统迁移，需要 FAA 确认。

FAA 正在推进 NOTAM Management Service（NMS）。官方页面提供 API 访问申请入口，FAQ 明确要求向 **7-AWA-NAIMES@faa.gov** 申请新的 NMS API。官方页面所写的迁移计划不等于本项目已经获得新接口权限，也不能据此认定旧网站已经停止服务。[FAA NMS 官方说明](https://www.faa.gov/about/initiatives/notam) · [官方 FAQ：NMS API 访问](https://www.faa.gov/about/initiatives/notam/faqs)

## 程序现在如何处理

- 区分拒绝访问（403）、限流（429）、临时服务故障和数据不完整，保留非敏感错误编号，便于向 FAA 排查。
- 识别错误地以 HTTP 200 返回的拒绝访问页面，避免当成正常数据继续扫描。
- 明确拒绝访问或限流时停止入口检查；每小时的完整重试最多追加两次。尊重 `Retry-After` 指示的更长等待时间。
- 在线自动采集的 FAA 请求降低到两个并发任务，并至少间隔一秒启动请求，以减少正常访问时的负载。降低请求频率不能解除访问授权限制。
- 失败时保留此前完整数据及其真实时间。既不会发布半份“全球数据”，也不会减少图形坐标、精度或通告条数。

**当前仍需要解决：取得可用于云端自动采集的正式访问权限。** 本次代码更新改善了错误处理和重试机制；在正式接入完成并通过真实全量验收前，不能宣称 FAA 403 已解决。

## 如何申请

1. 打开上述 FAA NMS 官方页面，在 **Get API Access and Documentation** 下核对联系地址，申请只读 NOTAM 分发 API 和当前接口文档。
2. 说明这是一个非商业航天爱好者地图，每 24 小时读取一次全球当前及未来有效 NOTAM，需要原文、起止时间和完整分页，用于区域绘图和历史回放。说明计划运行在 GitHub Actions，数据会公开展示；请 FAA 确认允许的访问方式、国际数据覆盖、频率、保存及再展示规则。
3. 要求确认免费接入方式、是否需要申请人资料，以及认证方法、生产接口地址、分页规则和限额。接到要求后提供自己的真实资料；GitHub 个人 Token 不能作为 FAA 凭据。
4. 获得 FAA 发放的凭据与文档后，将凭据放入 GitHub 仓库的 **Settings → Secrets and variables → Actions**。接入代码需要依照获批接口文档完成，并验证完整性与现有图形一致后才能启用。不要把密钥放到公开代码、网页或聊天中。

FAA 也提供 SWIM 数据申请渠道；官方 FAQ 当前说明数据不收费，接入开发由使用方负责。SWIM 的持续消息订阅和每日全量读取是不同接入方式，需确认适合的服务及全球覆盖，不能直接假定兼容本项目。[获取 SWIM 访问](https://www.faa.gov/air_traffic/technology/swim/products/get_connected) · [SWIM 费用及访问 FAQ](https://www.faa.gov/air_traffic/technology/swim/questions_answers)
