# pp-sso Cloudflare Worker

采购门户 SSO 中转服务，持有 APP_KEY 秘钥并缓存 ticket。

## 一、部署步骤（Cloudflare 面板）

### 1. 创建 KV Namespace
- 面板左侧 → **Workers & Pages → KV** → Create a namespace
- 名称：`pp-sso-kv`（随意）
- 创建后记下 ID

### 2. 创建 Worker
- **Workers & Pages → Create → Create Worker**
- 名称：`pp-sso`（URL 会是 `pp-sso.<你的子域>.workers.dev`）
- 初始化后进入 **Edit code**，将 `pp-sso.js` 全部内容粘贴进去 → Save & Deploy

### 3. 绑定变量与 KV
Worker 页面 → **Settings → Variables**：

**Environment Variables**（明文）
| 变量名 | 值 |
|---|---|
| `ALLOW_ORIGINS` | `https://ths1209.github.io,http://localhost:5173` |

**Secrets**（加密）
| 变量名 | 值 |
|---|---|
| `APP_ID` | 向 100tal SSO 申请的 appid |
| `APP_KEY` | 向 100tal SSO 申请的 appkey |

**KV Namespace Bindings**
| Variable name | KV namespace |
|---|---|
| `SSO_KV` | 选第 1 步创建的 `pp-sso-kv` |

### 4. 验证
访问 `https://pp-sso.<你的子域>.workers.dev/sso/health`，应返回：
```json
{ "ok": true, "time": "..." }
```

## 二、接口说明

### `GET /sso/qr-verify?code=XXX`
扫码 code 换用户信息。自动处理 ticket 缓存和过期重试。

**返回**（透传 sso 的响应结构）：
```json
{
  "errcode": 0,
  "errmsg": "success",
  "data": {
    "account_id": "efcc5a96-...",
    "account": "gedongdong",
    "name": "葛东东",
    "workcode": "111028",
    "email": "gedongdong@tal.com",
    "yachid": "Yach111028"
  }
}
```

### `GET /sso/health`
健康检查。

## 三、前端配置

`procurement-portal/.env.local` 添加：
```
VITE_SSO_APPID=你申请的appid
VITE_SSO_WORKER_BASE=https://pp-sso.<你的子域>.workers.dev
```

## 四、运维

- **ticket 缓存 TTL**：`TICKET_TTL` = 6600s（1h50min），比官方 2h 少 10min 余量
- **强制刷新 ticket**：Worker 内 `verifyQrCode` 遇到 ticket 过期错误会自动清 KV 重试一次
- **手动清缓存**：KV 面板删除 `ticket:v1` 这个 key
- **查日志**：Worker → Logs → Begin log stream
