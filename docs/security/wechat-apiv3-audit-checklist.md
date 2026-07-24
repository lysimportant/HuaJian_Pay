# 微信支付 APIv3 Native — 安全与协议审计清单

> 状态：准备稿（核心实现提交后由 BackendReviewer-Grok 对照代码勾选）  
> 任务：`019f9629-daa8`  
> 依赖：`019f9629-934c` 微信 APIv3 Native 通道核心  
> 范围：Authorization 签名、平台回调验签、AES-256-GCM、字段校验、重放/幂等、秘密治理

## 1. 审计目标

| 级别 | 定义 | 处理 |
| --- | --- | --- |
| P0 | 可伪造支付成功、金额/商户错绑、密钥泄露、跳过验签 | 立即修复并 push |
| P1 | 重放窗口过大、幂等缺口、raw body 破坏、配置回显风险 | 本任务内修复 |
| P2 | 日志噪声、错误信息过详、可观测性不足 | 记录，非阻塞 |

对照对象（实现后）：

- 适配器：`apps/server/src/channels/wechat*.ts`（或等价路径）
- 回调路由：独立 route 文件（期望不污染 `admin.ts` / `alipay` 路径）
- 配置读写：Admin GET/PUT 微信通道配置
- 下单接入：统一订单 → Native `code_url`
- 测试：确定性 fixture / 单元测试

## 2. 出站请求（Native 下单）

### 2.1 Authorization 签名串

- [ ] 签名串严格为五段：`HTTP_METHOD\nURL_PATH?query\nTIMESTAMP\nNONCE_STR\nBODY\n`（末尾含换行）
- [ ] `URL_PATH` 为 path + querystring，**不含** scheme/host
- [ ] `BODY` 与实际上送 JSON **字节级一致**（无重排后重签不一致）
- [ ] `TIMESTAMP` 为秒级 Unix；`NONCE_STR` 足够熵且每次请求唯一
- [ ] 使用商户私钥 **SHA256-RSA2048**；`Authorization: WECHATPAY2-SHA256-RSA2048 ...`
- [ ] Header 含 `mchid`、`serial_no`（商户证书序列号）、`nonce_str`、`timestamp`、`signature`
- [ ] 证书序列号与当前商户私钥匹配；轮换时不混用旧序列号

### 2.2 Native 下单业务字段

- [ ] `appid`、`mchid` 来自配置且非空
- [ ] `out_trade_no` = 平台 `trade_no`（或明确映射且可逆查询）
- [ ] `amount.total` 为**分**整数；与订单 `amountCents` 一致
- [ ] `amount.currency` = `CNY`（若支持多币种须白名单）
- [ ] `notify_url` 为 HTTPS 公网回调（生产）；本地 mock 除外
- [ ] `description` 长度/字符集符合微信限制；无未转义控制字符
- [ ] 成功响应解析 `code_url`；失败不落「已支付」

### 2.3 错误与重试

- [ ] 微信 4xx/5xx 不标记订单 paid
- [ ] 幂等下单：重复 `out_trade_no` 行为明确（复用/冲突）
- [ ] 超时/网络错误可重试且不产生双支付状态

## 3. 入站回调（支付结果通知）

### 3.1 原始 Body 与 Headers

- [ ] 验签使用 **raw body 字节**，禁止先 `JSON.parse` 再 `JSON.stringify` 后验签
- [ ] 读取 `Wechatpay-Timestamp`、`Wechatpay-Nonce`、`Wechatpay-Signature`、`Wechatpay-Serial`
- [ ] 任一 header 缺失 → **拒绝**（非 200 业务成功语义；建议 401/400，且不更新订单）

### 3.2 平台签名验证

- [ ] 验签串：`TIMESTAMP\nNONCE\nBODY\n`
- [ ] 使用 **微信支付平台证书/公钥**（按 `Wechatpay-Serial` 选择），非商户私钥
- [ ] 算法 RSA-SHA256；验签失败一律拒绝
- [ ] 平台证书过期/未知 serial → 拒绝并告警，不静默跳过

### 3.3 时间窗 / 重放

- [ ] `|now - Wechatpay-Timestamp|` 在允许窗口内（建议 ≤ 5 分钟，可配置上限）
- [ ] 窗口外请求拒绝
- [ ] 同一通知重复投递：已 paid 则幂等返回成功应答（微信要求的成功语义），不重复副作用

### 3.4 AES-256-GCM 解密

- [ ] 使用 APIv3 Key（32 字节）解密 `resource`
- [ ] `associated_data`、`nonce`、`ciphertext` 按协议处理；tag 长度正确
- [ ] 解密失败 → 拒绝，不写 paid
- [ ] 明文 JSON 解析失败 → 拒绝

### 3.5 业务字段校验（解密后）

| 字段 | 要求 | 级别 |
| --- | --- | --- |
| `mchid` | 等于本平台配置商户号 | P0 |
| `appid` | 等于本平台配置 appid | P0 |
| `out_trade_no` | 能定位本平台订单 | P0 |
| `amount.total` | 等于订单 `amountCents` | P0 |
| `amount.currency` | 期望 `CNY`（或订单币种） | P0 |
| `trade_state` | 仅 `SUCCESS` 触发 paid | P0 |
| `transaction_id` | 写入 `channelTradeNo`（可空策略明确） | P1 |
| 其他 state | `USERPAYING`/`NOTPAY`/失败态不 paid | P0 |

- [ ] 金额不匹配：拒绝并记录；**不得** mark paid
- [ ] 商户/appid 不匹配：拒绝
- [ ] 订单不存在：拒绝（防探测可统一错误文案）

### 3.6 应答语义

- [ ] 验签/解密/校验失败：返回失败 JSON（如 `code`/`message`），HTTP 非成功或按微信文档约定
- [ ] 处理成功：返回微信要求的成功应答，避免无限重试
- [ ] 不在应答中回显 APIv3 key / 私钥 / 平台证书

## 4. 幂等与状态机

- [ ] 支付成功路径复用统一 `markOrderPaid`（或等价），金额二次校验
- [ ] 已 paid 重复通知：`alreadyPaid` 路径，不重置 `notify_status` 为可破坏态
- [ ] 并发双通知：DB/事务或条件更新避免双写异常
- [ ] 不破坏支付宝 / mock 通道行为

## 5. 配置与秘密治理

### 5.1 配置项（期望）

- `mch_id` / `app_id`
- `api_v3_key`
- 商户私钥 PEM
- 商户证书序列号
- 微信平台证书/公钥（或自动下载后的信任锚）

### 5.2 Admin API

- [ ] GET **永不**回显：`api_v3_key`、商户私钥、完整平台私钥材料
- [ ] GET 仅 `configured` / 脱敏 hint / 序列号等非秘密
- [ ] PUT：空字符串/省略 = **保留原秘密**；有值 = 替换
- [ ] 更新非秘密字段不会擦除密钥
- [ ] 日志/错误栈不打印 PEM、APIv3 key、Authorization 全文

### 5.3 运行时

- [ ] 密钥仅内存/安全存储；不进前端 bundle
- [ ] `.env.example` 占位符，无真实凭据
- [ ] 回调 URL 不把秘密放 query

## 6. 与现有栈对齐

| 现有能力 | 微信侧期望 |
| --- | --- |
| `markOrderPaid` 金额校验 | 回调 `amount.total` 对齐 |
| 商户异步 `notify` worker | paid 后触发，不在微信回调内同步阻塞过久 |
| public order 最小字段 | 不因微信增加密钥/payload 泄露 |
| CHANNEL_MODE=mock | 微信真实通道可关；mock 回归不红 |
| Alipay adapter 隔离 | 独立文件，失败互不影响 |

## 7. 日志与可观测

- [ ] 记录：`trade_no` / `out_trade_no`、serial、验签结果、trade_state（无密钥）
- [ ] 禁止记录：完整 Authorization、私钥、APIv3 key、解密前 ciphertext 可选择性截断
- [ ] P0 失败可计数（验签失败、金额 mismatch）

## 8. 审计执行步骤（核心合入后）

1. `git pull` 定位微信相关 commit 与文件清单  
2. 静态阅读：签名、回调、解密、配置脱敏  
3. 运行 server typecheck/build  
4. 若有 fixture 单测则执行；否则按 [fixture 方案](./wechat-apiv3-fixture-plan.md) 补最小确定性测试  
5. 勾选本清单；P0/P1 直接修  
6. 中文 commit + push；向 Lead 报告 SHA 与残留 P2  

## 9. 完成定义（DoD）

- [ ] 清单 P0/P1 全部通过或已修复  
- [ ] 至少一组确定性签名/验签/解密/拒收 fixture 落地  
- [ ] 无秘密进仓库  
- [ ] alipay/mock 路径无回归（typecheck/build；有则 e2e）  
- [ ] 中文 commit 已 push  

---

*本文档可在实现细节落地后增补「文件路径映射」与「实测结果」附录，不替代代码审计本身。*
