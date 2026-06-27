# Cloudflare Worker 信箱 API - 产品需求文档

## Overview
- **Summary**: 基于 Cloudflare Worker 构建的完整信箱系统，提供 RESTful API，支持邮件收发、用户管理、附件存储、标签分类、搜索等完整邮箱功能。使用 Resend 代理发件，Cloudflare Email Routing 收件，D1 存储邮件数据，R2 存储附件，KV 做索引缓存，JWT 认证 + Turnstile 人机验证。
- **Purpose**: 为用户提供一个可自行部署、完全可控的轻量级邮箱服务，支持通过 API 集成到其他应用中。
- **Target Users**: 需要自建邮箱服务、希望通过 API 集成邮件功能的开发者和小型团队。

## Goals
- 提供完整的邮箱功能：收件、发件、标签、文件夹、搜索、批量操作
- 支持多用户系统，每个用户有独立的邮箱空间
- 使用 JWT 认证保护 API，结合 Turnstile 防止滥用
- 邮件数据存储在 D1，附件存储在 R2，KV 用于缓存和索引
- 通过 Resend API 发送邮件，通过 Cloudflare Email Routing 接收邮件
- 所有功能通过 RESTful API 暴露，方便外部系统集成
- 一键部署到 Cloudflare Worker

## Non-Goals (Out of Scope)
- Web 前端界面（仅提供 API，前端由用户自行实现）
- 邮件客户端协议支持（IMAP/POP3/SMTP）
- 复杂的邮件过滤规则引擎
- 邮件群组、邮件列表功能
- 日历、联系人等邮箱周边功能
- 自建 SMTP 服务器

## Background & Context
- Cloudflare Worker 提供无服务器执行环境，按量付费，全球边缘节点
- Cloudflare D1 提供 SQL 数据库服务，适合存储结构化邮件数据
- Cloudflare R2 提供对象存储，适合存储附件，无出口流量费用
- Cloudflare KV 提供键值存储，适合缓存和索引
- Cloudflare Email Routing 提供邮件接收和转发服务
- Resend 提供现代化的邮件发送 API，配置简单
- Turnstile 提供免费的人机验证服务，替代 reCAPTCHA

## Functional Requirements
- **FR-1**: 用户注册与登录系统，支持 JWT 认证
- **FR-2**: 用户邮箱地址分配与管理
- **FR-3**: 邮件发送（通过 Resend API 代理）
- **FR-4**: 邮件接收（通过 Cloudflare Email Routing）
- **FR-5**: 邮件列表查询（支持分页、排序、过滤）
- **FR-6**: 邮件详情查看（含正文、附件信息）
- **FR-7**: 邮件状态管理（已读/未读、星标）
- **FR-8**: 邮件标签/文件夹管理
- **FR-9**: 邮件搜索功能
- **FR-10**: 批量操作（批量删除、批量标记已读、批量移动）
- **FR-11**: 附件上传与下载
- **FR-12**: Turnstile 人机验证保护（注册、登录、发件）
- **FR-13**: 用户信息管理与密码修改

## Non-Functional Requirements
- **NFR-1**: API 响应时间 < 500ms（非搜索类请求）
- **NFR-2**: 支持单用户 10000+ 邮件存储
- **NFR-3**: 附件支持最大 25MB（单文件）
- **NFR-4**: JWT Token 有效期 7 天
- **NFR-5**: 支持 CORS，方便前端集成
- **NFR-6**: 完善的错误处理和错误信息
- **NFR-7**: 代码结构清晰，易于维护和扩展

## Constraints
- **Technical**: 
  - 运行在 Cloudflare Worker 上
  - 使用 TypeScript 开发
  - 使用 Hono 作为 Web 框架
  - D1 (SQLite) 作为主数据库
  - R2 存储附件
  - KV 用于缓存和索引
  - Resend API 发送邮件
  - Cloudflare Email Routing 接收邮件
  - Turnstile 人机验证
- **Business**: 
  - 所有依赖使用免费层即可运行
  - 部署流程简单，配置环境变量即可
- **Dependencies**: 
  - Resend API Key
  - Cloudflare 账户（启用 Worker、D1、R2、KV、Email Routing、Turnstile）

## Assumptions
- 用户已有 Cloudflare 账户并配置了域名
- 用户已有 Resend 账户和 API Key
- 域名的 DNS 已托管在 Cloudflare
- Email Routing 已在 Cloudflare 中启用
- 单用户可拥有多个邮箱地址

## Acceptance Criteria

### AC-1: 用户注册
- **Given**: 用户提供邮箱、用户名、密码，且通过 Turnstile 验证
- **When**: 调用 POST /api/auth/register
- **Then**: 创建用户账户，返回 JWT Token
- **Verification**: `programmatic`

### AC-2: 用户登录
- **Given**: 已注册用户提供邮箱和密码，且通过 Turnstile 验证
- **When**: 调用 POST /api/auth/login
- **Then**: 返回 JWT Token 和用户信息
- **Verification**: `programmatic`

### AC-3: 发送邮件
- **Given**: 用户已登录，提供收件人、主题、正文（可选附件），且通过 Turnstile 验证
- **When**: 调用 POST /api/mail/send
- **Then**: 通过 Resend 发送邮件，保存到发件箱，返回邮件 ID
- **Verification**: `programmatic`

### AC-4: 接收邮件
- **Given**: 向用户邮箱地址发送一封邮件
- **When**: Cloudflare Email Routing 触发 Worker
- **Then**: 解析邮件内容，保存到收件箱，附件存入 R2
- **Verification**: `programmatic`

### AC-5: 邮件列表
- **Given**: 用户已登录，指定文件夹/标签
- **When**: 调用 GET /api/mail
- **Then**: 返回分页的邮件列表，支持排序和过滤
- **Verification**: `programmatic`

### AC-6: 邮件详情
- **Given**: 用户已登录，拥有指定邮件
- **When**: 调用 GET /api/mail/:id
- **Then**: 返回邮件完整详情，含正文和附件列表
- **Verification`: `programmatic`

### AC-7: 邮件状态管理
- **Given**: 用户已登录，拥有指定邮件
- **When**: 调用 PATCH /api/mail/:id 修改已读/星标状态
- **Then**: 邮件状态更新成功
- **Verification**: `programmatic`

### AC-8: 标签/文件夹管理
- **Given**: 用户已登录
- **When**: 调用标签/文件夹的 CRUD API
- **Then**: 可以创建、查询、修改、删除标签/文件夹
- **Verification**: `programmatic`

### AC-9: 邮件搜索
- **Given**: 用户已登录，提供搜索关键词
- **When**: 调用 GET /api/mail/search
- **Then**: 返回匹配的邮件列表
- **Verification**: `programmatic`

### AC-10: 批量操作
- **Given**: 用户已登录，提供邮件 ID 列表
- **When**: 调用 POST /api/mail/batch
- **Then**: 批量执行删除/标记已读/移动等操作
- **Verification**: `programmatic`

### AC-11: 附件上传下载
- **Given**: 用户已登录
- **When**: 上传附件或下载指定附件
- **Then**: 附件存入 R2 / 从 R2 返回文件内容
- **Verification**: `programmatic`

### AC-12: Turnstile 验证
- **Given**: 关键接口（注册、登录、发件）
- **When**: 请求未携带有效 Turnstile Token
- **Then**: 返回 403 错误，拒绝请求
- **Verification**: `programmatic`

### AC-13: 项目结构与可部署性
- **Given**: 项目代码
- **When**: 配置好 wrangler.toml 和环境变量
- **Then**: 可通过 wrangler deploy 一键部署
- **Verification**: `human-judgment`

## Open Questions
- [ ] 邮箱地址是自动分配（如 username@domain.com）还是用户自定义？
- [ ] 是否需要邮件草稿功能？
- [ ] 是否需要邮件转发/自动回复功能？
- [ ] 是否需要支持 HTML 邮件的安全过滤？
