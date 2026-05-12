# procurement-portal 安全重构部署手册

本次重构把所有密钥从前端 bundle 迁移至阿里云 FC (`pp-sso`)，前端只持有 `VITE_API_BASE` 与 `VITE_SSO_APPID` 两个非敏感变量。部署分四步：**吊销旧密钥 → 创建新密钥 → 部署 FC → 部署前端 → 验证**。

---

## 一、吊销旧密钥（必须先做）

以下密钥已暴露在历史 GitHub Pages bundle 中，必须全部作废：

| 项 | 位置 | 吊销方式 |
|---|---|---|
| Teable API Token | Teable 控制台 → 个人设置 → API Token | 找到旧 token(以 `teable_acc` 开头) → 删除 |
| 内部 AI Key (tal.com) | 内部 AI 平台 | 申请更换 / 吊销 `300002843:...` |
| OpenRouter Key | https://openrouter.ai/keys | 找到旧 key(以 `sk-or-` 开头) → Revoke |
| GitHub PAT | https://github.com/settings/tokens | 找到旧 `github_pat_...` → Revoke |
| 数环通 Webhook | 数环通平台 → 触发器管理 | 删除旧触发器 URL,新建同名触发器 |

---

## 二、创建新密钥

1. Teable：
   - 新建一个 API Token,作用域仅勾选本项目使用的 base。
   - **AI 月报缓存表已建好**:
     - Base: `bseR42BfdkSIDiwJjtO`
     - Table ID: `tblObmXVBwxCXhjrJUw` (名称:AI月报缓存)
     - 字段:`key` (主键/单行文本/`YYYY-MM`) / `content` (长文本) / `model` (单行文本) / `createdAt` (单行文本/ISO)
   - 直接把 `tblObmXVBwxCXhjrJUw` 填入 FC 环境变量 `TEABLE_AI_SUMMARY_TABLE_ID`,无需手动建表。
2. 内部 AI 平台:申请新 Key。
3. OpenRouter:新建 Key(兜底用)。
4. 数环通:重建 webhook,记录新 URL。
5. JWT 密钥:随机生成 32 字节字符串(`openssl rand -hex 32`),作为 `JWT_SECRET`。

---

## 三、部署阿里云 FC (`pp-sso`)

### 3.1 FC 环境变量

在 FC 控制台 → 函数配置 → 环境变量,**删除所有旧变量并重新配置**：

```
# SSO(已有,保留)
APP_ID=1877284984
APP_KEY=<SSO 申请时拿到的密钥>
ALLOW_ORIGINS=https://ths1209.github.io,http://localhost:5173

# JWT
JWT_SECRET=<openssl rand -hex 32 生成>

# Teable
TEABLE_API_BASE=https://yach-teable.zhiyinlou.com
TEABLE_TOKEN=<新申请的 token>
TEABLE_USERS_TABLE_ID=tblWmSldyOQUmZ732N7
TEABLE_PROJECTS_TABLE_ID=tblGO47wMm51IEBRFpq
TEABLE_TOOLS_TABLE_ID=tbliFaxYYjjAnT1mpOp
TEABLE_CONSULTING_TABLE_ID=tblLSX3cTpGZFgkO3VT
TEABLE_ANALYTICS_TABLE_ID=tblxBfhbi2E9aFQ3LDG
TEABLE_AI_TABLE_ID=tblRu7Q8S51aZKEJE9v
TEABLE_OKR_TABLE_ID=tblitROxcN53Os3Xnwq
TEABLE_COST_LEDGER_TABLE_ID=tbl4e5Cuu6nlNw19uqz
TEABLE_REVIEWS_TABLE_ID=<手动在 Teable 新建空白表后填入>
TEABLE_AI_SUMMARY_TABLE_ID=tblObmXVBwxCXhjrJUw

# AI
AI_API_BASE=https://ai-service.tal.com/openai-compatible/v1
AI_API_KEY=<新申请的 Key>
AI_MODEL=claude-sonnet-4.6
OPENROUTER_KEY=<新申请的 Key>
OPENROUTER_MODEL=z-ai/glm-4.5-air:free

# 数环通
SHUHUAN_WEBHOOK=<新建触发器的 URL>
```

### 3.2 打包上传

```bash
cd workers/aliyun-fc
npm install --production         # 安装 bcryptjs
zip -r pp-sso.zip \
  index.js auth.js sso.js teable.js proxyTeable.js proxyAI.js proxyNotify.js \
  node_modules package.json
```

FC 控制台 → 函数代码 → 上传 ZIP → 部署。部署完成后测试:

```bash
curl -i https://pp-sso-djagmrmclk.cn-beijing.fcapp.run/sso/health
# 期望 200 OK
```

---

## 四、部署前端(GitHub Pages)

```bash
cd d:/CODE/procurement-portal
# 确认 .env.local 只保留 VITE_API_BASE / VITE_SSO_APPID / VITE_SSO_WORKER_BASE
npm install          # 会移除 bcryptjs / tweetsodium
npm run build
```

**关键安全检查**(构建后必跑):

```bash
# 任一命中都说明密钥还在 bundle 里,必须排查
grep -rE "teable_acc|sk-or|github_pat|300002843|yach-shuhuantong" dist/
# 期望:无输出
```

把 `dist/` 推到 GitHub Pages(原本有的 `.github/workflows/deploy.yml` 工作流可继续使用)。

---

## 五、回归验证

### 5.1 功能

1. 邮箱+密码登录 → 进入 Dashboard。
2. 重新注册一个账号(`status=pending`),管理员审批后可登录。
3. SSO 扫码登录与 SSO 账密跳转均能换得 JWT。
4. 改密后用新密码重新登录。
5. AdminPanel 修改他人 status/role 成功。
6. Projects / Tools / Consulting / OKR / CostLedger / Reviews / AI 需求 的 CRUD 全部可用。
7. OKRReport 点"生成月度总结":首次调 AI,**再次生成命中 Teable 缓存**(AI 月报缓存表新增一条 `key=YYYY-MM` 记录即视为成功)。
8. Consulting AI 问答有返回。
9. Tools 页面上传/下载附件。
10. 手动触发一次紧急通知,数环通端能收到。

### 5.2 安全

| 场景 | 期望 |
|---|---|
| `grep teable_acc/sk-or/github_pat dist/` | 无命中 |
| 未登录 `curl /t/*` `/ai/*` `/notify` | 401 |
| 普通用户 JWT `GET /t/users/records` | 只返回自己 |
| 普通用户 JWT `PATCH /t/users/records/<他人id>` 带 `passwordHash` | 403(或成功但 `passwordHash` 被剔除) |
| 过期 JWT | 401 |
| `status=disabled` 用户 | 最多 30s 后被拒(进程缓存 TTL) |
| 非 `ALLOW_ORIGINS` 来源 | CORS 预检失败 |

---

## 六、GitHub Actions 定时任务

- `.github/workflows/notify.yml`(项目交付期限提醒,`scripts/check-deadlines.js`)**保留**:密钥以 GitHub Actions Secrets 方式存在,不进前端 bundle。需同步更新 Secrets 为新 Token/Webhook。
- `.github/workflows/ai-summary.yml` 与 `scripts/ai-summary.js` **已删除**:AI 月报改由前端 → 后端 `/ai/summary` 生成,写入 Teable 缓存表。

---

## 七、后续不在本次范围的工作

- git 历史改写(用户确认可无视)。
- CSP / SRI 响应头(GitHub Pages 能配置的头有限,需单独方案)。
- 前端 XSS 专项排查。
- 审计日志落库。
