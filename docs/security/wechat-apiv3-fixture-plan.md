# 微信支付 APIv3 — 确定性 Fixture 与测试方案

> 状态：准备稿（不绑定真实商户凭据）  
> 任务：`019f9629-daa8`（审计）联动 `019f962a-4bb7`（E2E 扩展）  
> 原则：固定 RSA 密钥对 + 固定 APIv3 key + 固定报文；CI 可重复；仓库无生产秘密

## 1. 目标

在无真实微信商户号的情况下验证：

1. 出站 **Authorization** 签名串与 RSA-SHA256 签名正确  
2. 入站 **平台签名** 校验（通过/失败）  
3. **AES-256-GCM** 解密 resource  
4. **mchid/appid/out_trade_no/amount/currency/trade_state** 校验拒绝路径  
5. **重放时间窗** 与 **重复通知幂等**  
6. 与 mock/alipay 回归不互相踩踏  

审计任务至少落地 **单元/fixture 级**；全链路 HTTP E2E 由 E2EFixer 主责，本方案给出接口与向量约定。

## 2. Fixture 目录约定（建议）

```text
apps/server/test/fixtures/wechat-apiv3/
  README.md                 # 生成方式与轮换说明
  merchant_private_key.pem  # 测试专用 RSA2048（可提交）
  merchant_public_key.pem
  merchant_serial.txt       # 伪序列号字符串
  platform_private_key.pem  # 模拟「微信平台」侧，仅测试验签
  platform_public_key.pem
  platform_serial.txt
  api_v3_key.txt            # 恰好 32 字节测试 key（非生产）
  vectors/
    authorization_native_order.json
    notify_success_encrypted.json
    notify_bad_signature.json
    notify_amount_mismatch.json
    notify_replay_old_timestamp.json
```

**提交策略：**

- 仅提交测试密钥与派生向量，文件头注释 `TEST ONLY`  
- 禁止真实商户证书/APIv3 key  
- `.gitignore` 不误伤 fixtures（显式 allow 测试 pem）

## 3. 密钥与向量生成（一次生成、可复现）

推荐在 `scripts/gen-wechat-apiv3-fixtures.mjs`（可选，实现阶段）中：

1. 生成两对 RSA2048（merchant / platform）  
2. 固定 `api_v3_key = 32 * 'A'` 或 `0123456789abcdef0123456789abcdef`  
3. 对固定 body 计算：  
   - 商户签名 → Authorization 期望值  
   - 平台私钥签回调 → `Wechatpay-Signature`  
   - 用 APIv3 key AES-GCM 加密 resource 明文  

输出 JSON 向量包含：

```json
{
  "method": "POST",
  "url_path": "/v3/pay/transactions/native",
  "timestamp": "1554208460",
  "nonce_str": "fixed-nonce-001",
  "body": "{\"appid\":\"wx_test\",\"mchid\":\"1900000000\",...}",
  "message": "POST\n/v3/pay/transactions/native\n...\n",
  "signature_base64": "..."
}
```

回调向量：

```json
{
  "headers": {
    "Wechatpay-Timestamp": "1554208460",
    "Wechatpay-Nonce": "fixed-nonce-cb-001",
    "Wechatpay-Serial": "<platform_serial>",
    "Wechatpay-Signature": "<base64>"
  },
  "raw_body": "{...encrypted resource...}",
  "plaintext_resource": {
    "mchid": "1900000000",
    "appid": "wx_test",
    "out_trade_no": "HJTEST001",
    "trade_state": "SUCCESS",
    "amount": { "total": 100, "currency": "CNY" },
    "transaction_id": "420000TEST"
  },
  "expect": "accept"
}
```

## 4. 单元测试矩阵（审计优先）

| ID | 用例 | 期望 | 优先级 |
| --- | --- | --- | --- |
| U1 | 构造 Native 签名串与 fixture 一致 | 字节级相等 | P0 |
| U2 | 商户 RSA 签名可被 merchant 公钥验过 | pass | P0 |
| U3 | 合法回调 raw body + 平台签名 | 验签 pass，解密后字段完整 | P0 |
| U4 | 篡改 body 一字 | 验签 fail | P0 |
| U5 | 错误 serial / 错误平台公钥 | 验签 fail | P0 |
| U6 | AES-GCM 错误 key / 错 nonce | 解密 fail | P0 |
| U7 | amount.total ≠ 订单分 | 业务拒绝，不 paid | P0 |
| U8 | mchid/appid 不匹配 | 业务拒绝 | P0 |
| U9 | trade_state ≠ SUCCESS | 不 paid | P0 |
| U10 | timestamp 超出窗口 | 拒绝 | P1 |
| U11 | 同一成功通知两次 | 第二次幂等成功，无双 notify 风暴 | P1 |
| U12 | JSON 重排后再验签 | 必须 fail（证明用了 raw body） | P1 |

**放置建议：**

- `apps/server/src/channels/wechat-apiv3*.test.ts` 或 `apps/server/test/wechat-apiv3.spec.ts`  
- 使用 Node 内置 `node:test` / `vitest`（与仓库现有选择对齐；当前无则优先 `node:test` 以免新依赖）

## 5. HTTP / 半集成（可选，审计能做则做）

在 `CHANNEL_MODE` 支持 wechat fixture 驱动或注入 fake transport 时：

1. 配置写入测试 DB：测试 mch/appid/key/证书  
2. 创建 pending 订单，`amountCents=100`，`trade_no=HJTEST001`  
3. POST 回调路径 + fixture headers/raw_body  
4. 断言：订单 paid、`channelTradeNo`、商户 notify 可观测（mock）  
5. 再 POST 同 body → 仍 成功应答且状态稳定  

**不要**在审计阶段强改 Coder 未稳定的 admin 密钥页面；回调 route 与 crypto helper 可测即可。

## 6. E2E 扩展边界（交给 E2EFixer）

`scripts/mock-e2e.mjs` 或旁路 `scripts/wechat-apiv3-e2e.mjs`：

- 敏感字段正则扩展：`api_v3_key|mch_private_key|platform_cert|wechatpay`  
- Admin GET 微信配置不回显秘密  
- 公共支付页 `type=wxpay`：`code_url` 二维码与 pending→paid（可用 fixture 回调推进）  
- 保持现有 alipay/mock 全绿  

审计侧提供 **稳定回调路径名** 与 **向量文件路径** 写入本 README，避免 E2E 猜接口。

## 7. 实现阶段禁止事项

- 不把生产 PEM/APIv3 key 写入仓库或测试日志  
- 不在 fixture 中用弱到可在线爆破的「示例」同时冒充生产默认值  
- 不跳过验签的 `NODE_ENV=test` 后门进生产路径（若有 test bypass，必须 `CHANNEL_MODE`/显式 flag 双保险）  
- 不修改 Coder 正在编辑的业务文件仅「为了提前接线」；fixture 与纯函数 crypto 可先独立

## 8. 审计落地最小集（DoD for 019f9629-daa8）

核心代码合入后，本任务至少交付：

1. 勾选 [审计清单](./wechat-apiv3-audit-checklist.md) 并修复 P0/P1  
2. U1–U9 中能映射到代码的用例（缺实现则标阻塞）  
3. 中文 commit + push；报告：  
   - 变更文件  
   - SHA  
   - 仍开放的 P2 / 依赖 E2E 项  

## 9. 与支付宝测试的对照

| 支付宝现有 | 微信 fixture |
| --- | --- |
| 表单签名 MD5/RSA | APIv3 RSA + Authorization 头 |
| 异步 notify 表单 | JSON + 平台头 + AEAD resource |
| mock 一键支付 | 注入已加密回调向量 |

保持通道隔离：微信失败不得影响 `channels/alipay.ts` 路径。

---

*核心 PR 合并后，将本节「建议路径」替换为真实路径，并附 `pnpm` 测试命令一行。*
