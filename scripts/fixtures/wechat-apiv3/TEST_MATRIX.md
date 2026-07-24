# 微信支付 APIv3 回归测试矩阵（task 019f962a-4bb7）

## 状态
- 依赖：微信核心 `019f9629-934c`（in_progress）、审计 `019f9629-daa8`、UI `019f962a-2c21`
- 本阶段：仅设计 fixture + 矩阵；**不修改业务源码**
- 落盘位置：`scripts/fixtures/wechat-apiv3/*`、本矩阵文档

## 固定 Fixture
目录：`scripts/fixtures/wechat-apiv3/`

| 文件 | 用途 |
| --- | --- |
| `merchant_private_key.pem` | 商户 RSA 私钥（请求签名） |
| `merchant_public_key.pem` | 商户公钥（对照） |
| `platform_private_key.pem` | 模拟微信平台私钥（回调签名） |
| `platform_public_key.pem` | 平台公钥（验签） |
| `apiv3_key.txt` | 32 字符 APIv3 密钥（AES-256-GCM） |
| `meta.json` | mch_id / app_id / serial_no 等 |
| `generate.mjs` | 仅在缺失/损坏时重生成 |

约定字段（见 meta.json）：
- `mch_id=1900000001`
- `app_id=wx_test_appid_e2e`
- `merchant_serial_no` / `platform_serial_no` 固定 40 位十六进制风格
- `notify_path=/notify/wxpay`（以核心实现落地路径为准，可适配）

## 测试矩阵

### A. Native 请求签名（单元/脚本级）
| ID | 场景 | 期望 |
| --- | --- | --- |
| A1 | 按 APIv3 规范拼 Authorization 签名串 | 可被商户公钥验签 |
| A2 | method/path/body/timestamp/nonce 任一被改 | 验签失败 |
| A3 | serial_no 与 fixture 一致 | 通过 |

### B. 回调平台签名 + AES-GCM
| ID | 场景 | 期望 |
| --- | --- | --- |
| B1 | 用 platform_private 签 raw body | 服务端验签通过 |
| B2 | AES-256-GCM 加密 resource（apiv3_key） | 解密得到 resource 明文 |
| B3 | 篡改 ciphertext / associated_data / nonce | 解密或验签失败，订单不变 |
| B4 | 篡改 Wechatpay-Signature / timestamp | 拒绝，HTTP 非 2xx 或明确失败 |

### C. 业务校验拒绝
| ID | 场景 | 期望 |
| --- | --- | --- |
| C1 | amount.total 与订单不符 | 拒绝，状态不迁 paid |
| C2 | mchid / appid 不符 | 拒绝 |
| C3 | out_trade_no 不存在 | 拒绝 |
| C4 | currency 非 CNY（若实现校验） | 拒绝 |

### D. 幂等 / 重放
| ID | 场景 | 期望 |
| --- | --- | --- |
| D1 | 同一成功通知连续两次 | 第二次仍成功/幂等，状态保持 paid，无双记 |
| D2 | 过期 timestamp 重放窗口外 | 拒绝（若实现窗口） |
| D3 | 已 paid 后再来 SUCCESS | 幂等，不破坏 notify |

### E. 公共支付页 wxpay
| ID | 场景 | 期望 |
| --- | --- | --- |
| E1 | type=wxpay 下单 | 返回 code_url 或支付页含微信标识 |
| E2 | 公开状态 pending → paid | 与现有 public status 一致 |
| E3 | 支付页 HTML 安全转义 | 无 XSS 原文 |
| E4 | mock 或 fixture 驱动支付成功 | 状态 paid + 商户 notify（若适用） |

### F. Admin 配置不泄密
| ID | 场景 | 期望 |
| --- | --- | --- |
| F1 | 未认证 GET 微信配置 | 401 |
| F2 | 认证 GET | 不回显 apiv3_key / 私钥 / 平台证书全文；仅 has_* / 脱敏 |
| F3 | PUT 空值 | 保留原秘密（依赖实现后断言） |

### G. 回归（必须全绿）
| ID | 场景 | 期望 |
| --- | --- | --- |
| G1 | 现有 alipay/mock E2E | 全绿（admin 401、密钥不泄密、submit 转义、public pending→paid、mapi/query/notify） |
| G2 | `pnpm test:mock-e2e` 单命令自启+清理 | exit 0 |

## 实现计划（依赖 commit 到达后）
1. `git pull` 识别微信 adapter/route/notify 路径与 mock 模式开关
2. 扩展 `scripts/mock-e2e.mjs` 或新增 `scripts/wechat-apiv3-e2e.mjs`（优先扩展同一入口，避免 CI 漏跑）
3. 用 fixture 构造：签名请求头、加密 resource、篡改体
4. 跑 typecheck/build + 全量 E2E
5. 中文 commit 摘要 + push
6. 向 Lead 报告（`team_send_message` 参数 `to`）

## 不做
- 不改 apps/server、apps/admin 业务文件（依赖方负责）
- 不把真实商户密钥写入仓库
- 不宣称个人微信可自动收款

## 当前断点
- Fixture 生成器 + 矩阵已就绪
- 等待：`019f9629-934c` 核心、`019f9629-daa8` 审计、`019f962a-2c21` UI 合并
- 依赖一到立即扩展 E2E
