# SEO 与页面元数据策略（支付系统安全向）

> 产品定位：易支付风格 **支付中台**，不是内容站。  
> 原则：**可运营、不可被搜出订单与后台。**

## 1. 索引策略总览

| 资源 | 是否索引 | 机制 |
| --- | --- | --- |
| 管理后台 SPA（`apps/admin`） | **禁止** | `index.html`：`noindex,nofollow,noarchive,nosnippet`；描述仅说明「需登录」 |
| 公开收银台 `/pay/:tradeNo`、`/pay/:tradeNo/result` | **禁止** | HTML meta robots + 响应头 `X-Robots-Tag` + `Cache-Control: no-store` |
| 经典下单 HTML（`submit.php` 等返回页） | **禁止** | 同上 `X-Robots-Tag` |
| 公开订单状态 JSON | **禁止** | `X-Robots-Tag` + `no-store`；响应字段已做最小暴露 |
| 通道回调 `/channels/*` | **禁止** | `robots.txt` Disallow；无 HTML 落地 |
| Admin API `/admin/api/*` | **禁止** | robots Disallow；需鉴权 |
| `/robots.txt` | 可抓取规则文件本身 | 明确 Disallow 敏感前缀；**不提供 sitemap** |
| 站点根 `/` | 不作为营销页收录 | `X-Robots-Tag: noindex`；仅 JSON 服务发现 |

**明确不做：**

- 不为订单、商户、支付页生成 `sitemap.xml`
- 不在 title/description 中拼接 `trade_no`、金额、商户名、密钥
- 不为了 SEO 把后台路由做成可公开爬取的 SSR 列表

## 2. 已实现位置

| 文件 | 作用 |
| --- | --- |
| `apps/admin/index.html` | 后台全局 meta / OG 保守文案 |
| `apps/server/src/pay/pay-page.ts` | 收银台 head：robots / description / referrer / theme-color |
| `apps/server/src/routes/pay.ts` | HTML 响应 `X-Robots-Tag` |
| `apps/server/src/routes/public-order.ts` | 状态 API `X-Robots-Tag` |
| `apps/server/src/routes/seo.ts` | `GET /robots.txt` |
| `apps/server/src/app.ts` | 注册 seo 路由；根路径 noindex |

## 3. robots.txt 策略说明

当前 `User-agent: *` 禁止：

- `/pay/` — 含交易号的收银台
- `/admin`、`/admin/` — 管理端（若同域反代）
- `/api/` — 全部 API
- `/channels/` — 支付回调
- 经典入口 `submit.php` / `mapi.php` / `api.php`

若未来增加**真正的公开产品介绍页**（无交易数据），可单独允许该路径，并单独配置 canonical；**仍禁止**把支付与后台放进 sitemap。

## 4. 验证清单

```bash
# 构建
pnpm --filter @huajian/server typecheck
pnpm --filter @huajian/server build
pnpm --filter @huajian/admin build

# 运行后
curl -sS http://127.0.0.1:8080/robots.txt
# 期望：Disallow /pay/ /admin /api/ /channels/ …

curl -sSI http://127.0.0.1:8080/pay/demo-trade-no | findstr /I "X-Robots-Tag Cache-Control"
# 期望：X-Robots-Tag: noindex…

# 查看支付页 HTML head（需真实 trade_no）
# 期望：meta name="robots" content="noindex, nofollow, noarchive, nosnippet"

# Admin 产物
# apps/admin/dist/index.html 应含 noindex
```

## 5. 与 UI 协作边界

- 收银台 **视觉/状态机** 由 UI 任务维护；SEO 仅约束 `<head>` 元数据与响应头。
- 后台页面组件无需逐页改 title（SPA 默认已 noindex）；若后续加 `document.title` 动态，**禁止**写入订单号到可被分享预览的公开 meta。

## 6. 合规提示

搜索引擎指令不能替代鉴权：`robots` / `noindex` 只降低被收录概率。订单与后台仍必须依赖登录、签名与最小字段 API。
