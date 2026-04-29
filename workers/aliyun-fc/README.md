# 采购门户 SSO 中转 · 阿里云函数计算（FC）部署

替代原 Cloudflare Worker（`workers/pp-sso.js`）—— 因 `*.workers.dev` 在国内访问不稳定，改用阿里云 FC 托管，同域部署后走国内线路直连。

## 路由

| 路径 | 方法 | 用途 |
|------|------|------|
| `/sso/health` | GET | 健康检查 |
| `/sso/qr-verify?code=XXX` | GET | 扫码 code 换用户信息 |
| `/sso/verify?token=XXX` | GET | 账密登录 token 换用户信息 |

## 方案 A：控制台手动部署（推荐，最快）

### 1. 打包代码

把 `workers/aliyun-fc/` 下的 `index.js` 和 `package.json` 打成 **zip**（不要套外层文件夹，zip 根目录就是这两个文件）：

```bash
cd workers/aliyun-fc
# Windows PowerShell
Compress-Archive -Path index.js,package.json -DestinationPath pp-sso.zip -Force

# 或 macOS / Linux
zip pp-sso.zip index.js package.json
```

### 2. 创建函数

1. 打开 https://fcnext.console.aliyun.com/overview
2. 左侧「**函数**」→「**创建函数**」
3. 填表：
   - 函数名：`pp-sso`
   - 运行环境：**自定义运行时（Custom Runtime）** → **Node.js 18**
   - 代码上传方式：**zip 包上传** → 选刚才的 `pp-sso.zip`
   - **启动命令**：`node index.js`
   - **监听端口**：`9000`
   - 内存：512MB（够用）
   - 超时时间：30 秒
4. 点「创建」

### 3. 配置环境变量

进入函数详情 → **配置**（或「函数配置」）→ **环境变量** → 添加以下三个：

| 变量名 | 值 | 备注 |
|--------|-----|------|
| `APP_ID` | `你的100tal appid` | 与 Cloudflare 上那个 APP_ID 相同 |
| `APP_KEY` | `你的100tal appkey` | 与 Cloudflare 上那个 APP_KEY 相同 |
| `ALLOW_ORIGINS` | `https://ths1209.github.io,http://localhost:5173` | 前端源白名单，逗号分隔，不要空格 |

保存并重新部署。

### 4. 配置 HTTP 触发器

进入函数详情 → **触发器管理** → **创建触发器**：

- 触发器类型：**HTTP 触发器**
- 触发器名称：`http`
- 认证方式：**anonymous（匿名）**（CORS 由代码控制）
- 请求方法：勾选 **GET** 和 **OPTIONS**

保存后会生成一个「公网访问地址」，形如：
```
https://pp-sso-xxxxx.cn-hangzhou.fcapp.run
```
（如果阿里云默认分配的 `fcapp.run` 域名不是 HTTPS 或在国内也不稳，可以再绑一个自定义域名，见下方"自定义域名"段落）

### 5. 验证

浏览器打开 `https://<你的域名>/sso/health`，应返回：
```json
{"ok": true, "time": "2026-04-28T..."}
```

### 6. 切换前端到新地址

编辑两个地方：

**本地开发**：`d:/CODE/procurement-portal/.env.local`
```env
VITE_SSO_WORKER_BASE=https://pp-sso-xxxxx.cn-hangzhou.fcapp.run
```

**生产构建**：`.github/workflows/deploy.yml` 里 `VITE_SSO_WORKER_BASE` 一行换成同样的地址。

改完重启 dev server（本地）或 push 推送（生产）。

---

## 方案 B：Serverless Devs 一键部署（可选）

如果你熟悉命令行：

```bash
npm i -g @serverless-devs/s
s config add        # 填 AccessKeyID / Secret
cd workers/aliyun-fc
# 先编辑 s.yaml 里的 APP_ID / APP_KEY（敏感值建议改为 secret，别提交仓库）
s deploy -y
```

部署完同样会打印访问 URL。

---

## 自定义域名（推荐生产环境使用）

FC 默认的 `*.fcapp.run` 在国内线路好，但访问量大时仍建议绑个自己的域名：

1. FC 控制台 → **域名管理** → **添加自定义域名**
2. 填你的域名（如 `sso.yourdomain.com`），路由指向 `pp-sso` 函数
3. 按提示做 DNS CNAME
4. 开 HTTPS（可用免费的 Let's Encrypt 或 阿里云 SSL）
5. 前端 `VITE_SSO_WORKER_BASE` 再换成这个域名

---

## 常见坑

- **Node 版本**：必须 18+，Node 16 没有原生 `fetch`。选运行环境时确认是 **Node.js 18** 或更高。
- **Custom Runtime vs 内置 Node Runtime**：两种都行，但 Custom Runtime 直接跑 `node index.js` 最直观。内置 Node Runtime 要求导出 `handler` 函数且用 FC 自己的事件格式，不适用本项目。
- **ALLOW_ORIGINS 空格**：`https://a.com, http://b.com`（逗号后带空格）会挂，要 `https://a.com,http://b.com`。
- **冷启动**：首次调用会慢 1-2 秒（实例拉起 + get_ticket），之后都是热路径。用户感知可接受。
- **ticket 缓存**：FC 实例会在一段时间后回收，此时内存缓存丢失会再触发一次 get_ticket，属正常。
