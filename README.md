# Cloudflare Mailbox API

基于 Cloudflare Worker 构建的完整信箱系统，提供 RESTful API，支持邮件收发、用户管理、附件存储、标签分类、搜索等完整邮箱功能。

## 技术栈

- **运行时**: Cloudflare Worker
- **框架**: Hono
- **语言**: TypeScript
- **数据库**: Cloudflare D1 (SQLite)
- **存储**: Cloudflare R2 (附件)
- **缓存**: Cloudflare KV
- **邮件发送**: Resend API
- **邮件接收**: Cloudflare Email Routing
- **人机验证**: Cloudflare Turnstile
- **认证**: JWT

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Cloudflare

确保你的 Cloudflare 账户已启用以下服务：

- Workers
- D1 Database
- R2 Storage
- KV Namespace
- Turnstile

### 3. 创建 D1 数据库

```bash
wrangler d1 create mailbox-db
```

将返回的 `database_id` 填入 `wrangler.toml`。

### 4. 配置环境变量

创建 `.dev.vars` 文件：

```env
RESEND_API_KEY=your_resend_api_key
TURNSTILE_SECRET_KEY=your_turnstile_secret_key
JWT_SECRET=your_secure_jwt_secret_min_32_chars
MAIL_DOMAIN=yourdomain.com
```

### 5. 设置 KV Namespace

```bash
wrangler kv:namespace create CACHE
```

将返回的 `id` 填入 `wrangler.toml`。

### 6. 本地开发

```bash
npm run dev
```

API 将在 `http://localhost:8787` 运行。

### 7. 数据库迁移

```bash
npm run db:migrate
```

### 8. 部署

```bash
npm run deploy
```

## API 文档

### 认证

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/auth/register | 用户注册 |
| POST | /api/auth/login | 用户登录 |

### 用户

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/user | 获取当前用户信息 |
| PATCH | /api/user/password | 修改密码 |

### 邮箱地址

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/mailboxes | 获取所有邮箱地址 |
| POST | /api/mailboxes | 创建邮箱地址 |
| DELETE | /api/mailboxes/:id | 删除邮箱地址 |

### 邮件

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/mail | 获取邮件列表 |
| GET | /api/mail/:id | 获取邮件详情 |
| POST | /api/mail/send | 发送邮件 |
| PATCH | /api/mail/:id/read | 标记已读/未读 |
| PATCH | /api/mail/:id/star | 切换星标 |
| PATCH | /api/mail/:id/folder | 移动到文件夹 |
| DELETE | /api/mail/:id | 删除邮件 |
| GET | /api/mail/search | 搜索邮件 |
| POST | /api/mail/batch | 批量操作 |

### 标签

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/labels | 获取所有标签 |
| POST | /api/labels | 创建标签 |
| PATCH | /api/labels/:id | 更新标签 |
| DELETE | /api/labels/:id | 删除标签 |

### 文件夹

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/folders | 获取所有文件夹 |
| POST | /api/folders | 创建文件夹 |
| PATCH | /api/folders/:id | 更新文件夹 |
| DELETE | /api/folders/:id | 删除文件夹 |

### 附件

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/attachments | 上传附件 |
| GET | /api/attachments/:id | 下载附件 |
| DELETE | /api/attachments/:id | 删除附件 |

## API 请求示例

### 注册

```bash
curl -X POST http://localhost:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -H "X-Turnstile-Token: your_turnstile_token" \
  -d '{
    "email": "user@example.com",
    "username": "user",
    "password": "password123"
  }'
```

### 登录

```bash
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Turnstile-Token: your_turnstile_token" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

### 发送邮件

```bash
curl -X POST http://localhost:8787/api/mail/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -H "X-Turnstile-Token: your_turnstile_token" \
  -d '{
    "to": "recipient@example.com",
    "subject": "Hello",
    "body": "This is a test email"
  }'
```

### 获取邮件列表

```bash
curl -X GET "http://localhost:8787/api/mail?page=1&limit=20&folder=inbox" \
  -H "Authorization: Bearer your_jwt_token"
```

## 环境变量说明

| 变量 | 描述 | 必需 |
|------|------|------|
| `RESEND_API_KEY` | Resend API 密钥，用于发送邮件 | 是 |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile 密钥 | 是 |
| `JWT_SECRET` | JWT 签名密钥（至少 32 字符） | 是 |
| `MAIL_DOMAIN` | 邮件域名 | 是 |
| `MAIL_DOMAIN` | 邮件域名 | 是 |

## 部署方式

### 方式一：通过 GitHub Actions 自动部署（推荐）

1. **Fork 本仓库到你的 GitHub 账户**

2. **创建 Cloudflare API Token**

   前往 [Cloudflare Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens)，创建一个 Token，权限如下：
   - Account → D1 → Edit
   - Account → Workers R2 Storage → Edit
   - Account → Workers KV Storage → Edit
   - Account → Workers Scripts → Edit
   - Zone → Workers Routes → Edit

3. **在 GitHub 仓库中配置 Secrets**

   进入仓库 Settings → Secrets and variables → Actions，添加以下 Secrets：

   | Secret 名称 | 描述 |
   |-------------|------|
   | `CF_API_TOKEN` | Cloudflare API Token |
   | `CF_ACCOUNT_ID` | Cloudflare 账户 ID（在 Dashboard 右下角可找到） |
   | `RESEND_API_KEY` | Resend API 密钥 |
   | `TURNSTILE_SECRET_KEY` | Turnstile 密钥 |
   | `JWT_SECRET` | JWT 签名密钥（至少 32 位随机字符串） |

4. **在 GitHub 仓库中配置 Variables**

   进入仓库 Settings → Secrets and variables → Actions → Variables，添加：

   | Variable 名称 | 描述 |
   |---------------|------|
   | `MAIL_DOMAIN` | 你的邮件域名，如 `yourdomain.com` |
   | `TURNSTILE_SITE_KEY` | Turnstile Site Key |

5. **修改 wrangler.toml 中的资源 ID**

   在 `wrangler.toml` 中填入你自己的：
   - D1 数据库 ID
   - R2 Bucket 名称
   - KV Namespace ID

6. **推送代码到 main 分支**

   推送到 `main` 分支后，GitHub Actions 会自动触发部署。你也可以在 Actions 页面手动触发。

### 方式二：手动部署

```bash
# 登录 Cloudflare
npx wrangler login

# 创建 D1 数据库
npx wrangler d1 create mailbox-db

# 创建 KV Namespace
npx wrangler kv:namespace create CACHE

# 创建 R2 Bucket
npx wrangler r2 bucket create mailbox-attachments

# 设置 Secrets
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put JWT_SECRET

# 执行数据库迁移
npm run db:migrate:remote

# 部署
npm run deploy
```

### 方式三：Cloudflare Workers Git 集成

1. 前往 [Cloudflare Dashboard → Workers](https://dash.cloudflare.com/?to=/:account/workers)
2. 点击 "Create application" → "Create Worker"
3. 在 Worker 设置中找到 "Git integration"
4. 连接你的 GitHub 仓库
5. 配置构建命令和输出目录：
   - Build command: `npm run build`
   - Build output directory: `dist`

## 邮件接收配置

1. 在 Cloudflare Dashboard 启用 Email Routing
2. 创建邮件路由规则，将邮件转发到 `/email/routing` 端点
3. 配置你的 DNS MX 记录指向 Cloudflare

## License

MIT
