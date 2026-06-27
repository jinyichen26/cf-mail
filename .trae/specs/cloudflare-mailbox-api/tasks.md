# Cloudflare Worker 信箱 API - 实施计划

## [ ] Task 1: 项目初始化与基础结构搭建
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 初始化 Cloudflare Worker TypeScript 项目
  - 配置 Hono 框架
  - 配置 wrangler.toml（D1、R2、KV 绑定）
  - 配置 TypeScript 和项目结构
  - 实现基础的 CORS 和错误处理中间件
- **Acceptance Criteria Addressed**: [AC-13]
- **Test Requirements**:
  - `programmatic` TR-1.1: 项目可以通过 `wrangler dev` 本地启动
  - `programmatic` TR-1.2: 基础健康检查接口 GET /health 返回 200
  - `human-judgement` TR-1.3: 项目结构清晰，分层合理（routes, services, models, middleware, utils）
- **Notes**: 使用 Hono 框架，项目结构遵循最佳实践

## [ ] Task 2: D1 数据库 Schema 设计与迁移
- **Priority**: high
- **Depends On**: [Task 1]
- **Description**: 
  - 设计数据库表结构：users, mailboxes, emails, attachments, labels, email_labels, folders
  - 编写 SQL 迁移脚本
  - 实现数据库初始化逻辑
  - 设计索引优化查询性能
- **Acceptance Criteria Addressed**: [AC-13]
- **Test Requirements**:
  - `programmatic` TR-2.1: 数据库迁移脚本可成功执行
  - `programmatic` TR-2.2: 所有表和索引正确创建
  - `human-judgement` TR-2.3: Schema 设计合理，支持未来扩展
- **Notes**: 使用 D1 的迁移功能，外键关联考虑性能

## [ ] Task 3: JWT 认证与用户系统
- **Priority**: high
- **Depends On**: [Task 2]
- **Description**: 
  - 实现 JWT Token 生成与验证中间件
  - 实现用户注册接口 POST /api/auth/register
  - 实现用户登录接口 POST /api/auth/login
  - 实现密码哈希（使用 bcrypt 或类似算法的 Worker 兼容版本）
  - 实现用户信息获取接口 GET /api/user
  - 实现密码修改接口 PATCH /api/user/password
- **Acceptance Criteria Addressed**: [AC-1, AC-2]
- **Test Requirements**:
  - `programmatic` TR-3.1: 注册接口可创建新用户，返回 JWT
  - `programmatic` TR-3.2: 登录接口验证密码，返回 JWT
  - `programmatic` TR-3.3: 无效 Token 请求受保护接口返回 401
  - `programmatic` TR-3.4: 密码哈希存储，不存储明文
- **Notes**: JWT 有效期 7 天，密码哈希使用 Worker 兼容的库

## [ ] Task 4: Turnstile 人机验证集成
- **Priority**: high
- **Depends On**: [Task 3]
- **Description**: 
  - 实现 Turnstile 验证中间件
  - 保护注册接口
  - 保护登录接口
  - 保护发件接口
  - 配置 Turnstile 密钥环境变量
- **Acceptance Criteria Addressed**: [AC-12]
- **Test Requirements**:
  - `programmatic` TR-4.1: 无 Turnstile Token 的注册请求返回 403
  - `programmatic` TR-4.2: 无 Turnstile Token 的登录请求返回 403
  - `programmatic` TR-4.3: 无效 Turnstile Token 返回 403
- **Notes**: Turnstile 验证失败返回明确的错误信息

## [ ] Task 5: 邮箱地址管理
- **Priority**: high
- **Depends On**: [Task 2]
- **Description**: 
  - 实现用户邮箱地址的创建和管理
  - 邮箱地址格式：username@domain.com（自动分配）
  - 实现邮箱地址列表接口 GET /api/mailboxes
  - 实现创建邮箱地址接口 POST /api/mailboxes
  - 实现删除邮箱地址接口 DELETE /api/mailboxes/:id
  - 设置默认邮箱地址
- **Acceptance Criteria Addressed**: [FR-2]
- **Test Requirements**:
  - `programmatic` TR-5.1: 用户可以创建新的邮箱地址
  - `programmatic` TR-5.2: 可以列出用户的所有邮箱地址
  - `programmatic` TR-5.3: 可以删除邮箱地址
  - `programmatic` TR-5.4: 同用户邮箱地址唯一
- **Notes**: 邮箱地址域名从环境变量读取

## [ ] Task 6: 邮件发送（Resend 集成）
- **Priority**: high
- **Depends On**: [Task 4, Task 5]
- **Description**: 
  - 集成 Resend API
  - 实现发件接口 POST /api/mail/send
  - 支持纯文本和 HTML 邮件
  - 支持附件发送
  - 发送成功后保存到发件箱
  - 支持指定发件邮箱地址
- **Acceptance Criteria Addressed**: [AC-3]
- **Test Requirements**:
  - `programmatic` TR-6.1: 发件接口调用 Resend API 成功发送
  - `programmatic` TR-6.2: 发送的邮件保存到发件箱
  - `programmatic` TR-6.3: 支持附件发送
  - `programmatic` TR-6.4: 未认证请求返回 401
- **Notes**: Resend API Key 从环境变量读取

## [ ] Task 7: 邮件接收（Email Routing 集成）
- **Priority**: high
- **Depends On**: [Task 2, Task 5]
- **Description**: 
  - 实现 Email Routing 邮件接收处理
  - 解析邮件 MIME 内容（主题、发件人、正文、附件）
  - 匹配收件人邮箱地址，保存到对应用户的收件箱
  - 附件保存到 R2 存储
  - 邮件正文和元数据保存到 D1
  - 实现 /email/routing 端点处理 Email Routing Webhook
- **Acceptance Criteria Addressed**: [AC-4]
- **Test Requirements**:
  - `programmatic` TR-7.1: 接收到的邮件正确解析并存储
  - `programmatic` TR-7.2: 附件正确保存到 R2
  - `programmatic` TR-7.3: 未知收件人邮件被拒绝或忽略
  - `programmatic` TR-7.4: 邮件正确关联到用户
- **Notes**: 使用 Postal-mime 或类似库解析邮件

## [ ] Task 8: 邮件列表与详情
- **Priority**: high
- **Depends On**: [Task 2]
- **Description**: 
  - 实现邮件列表接口 GET /api/mail
  - 支持分页（page, limit）
  - 支持按文件夹过滤
  - 支持按标签过滤
  - 支持按已读/未读状态过滤
  - 支持排序（按时间升序/降序）
  - 实现邮件详情接口 GET /api/mail/:id
  - 自动标记已读
- **Acceptance Criteria Addressed**: [AC-5, AC-6]
- **Test Requirements**:
  - `programmatic` TR-8.1: 邮件列表分页正确
  - `programmatic` TR-8.2: 按文件夹过滤正确
  - `programmatic` TR-8.3: 按标签过滤正确
  - `programmatic` TR-8.4: 邮件详情返回完整信息
  - `programmatic` TR-8.5: 查看详情后邮件标记为已读
- **Notes**: 性能优化，大数量级下查询效率

## [ ] Task 9: 邮件状态管理
- **Priority**: medium
- **Depends On**: [Task 2]
- **Description**: 
  - 实现标记已读/未读 PATCH /api/mail/:id/read
  - 实现星标/取消星标 PATCH /api/mail/:id/star
  - 实现移动邮件到文件夹 PATCH /api/mail/:id/folder
  - 实现删除邮件 DELETE /api/mail/:id
- **Acceptance Criteria Addressed**: [AC-7]
- **Test Requirements**:
  - `programmatic` TR-9.1: 可以切换邮件已读状态
  - `programmatic` TR-9.2: 可以切换邮件星标状态
  - `programmatic` TR-9.3: 可以移动邮件到不同文件夹
  - `programmatic` TR-9.4: 可以删除邮件
- **Notes**: 删除使用软删除还是硬删除？软删除可恢复

## [ ] Task 10: 标签与文件夹管理
- **Priority**: medium
- **Depends On**: [Task 2]
- **Description**: 
  - 实现标签 CRUD: GET/POST/PATCH/DELETE /api/labels
  - 实现文件夹 CRUD: GET/POST/PATCH/DELETE /api/folders
  - 实现邮件添加/移除标签 POST /api/mail/:id/labels
  - 系统默认文件夹：收件箱、发件箱、草稿箱、垃圾箱
  - 系统默认标签：重要、工作、个人等
- **Acceptance Criteria Addressed**: [AC-8]
- **Test Requirements**:
  - `programmatic` TR-10.1: 可以创建/修改/删除自定义标签
  - `programmatic` TR-10.2: 可以创建/修改/删除自定义文件夹
  - `programmatic` TR-10.3: 可以为邮件添加/移除标签
  - `programmatic` TR-10.4: 默认文件夹自动创建
- **Notes**: 默认文件夹不可删除

## [ ] Task 11: 邮件搜索
- **Priority**: medium
- **Depends On**: [Task 2]
- **Description**: 
  - 实现邮件搜索接口 GET /api/mail/search
  - 支持按主题搜索
  - 支持按发件人/收件人搜索
  - 支持按正文内容搜索
  - 支持组合过滤条件
  - 支持分页
- **Acceptance Criteria Addressed**: [AC-9]
- **Test Requirements**:
  - `programmatic` TR-11.1: 按主题搜索返回正确结果
  - `programmatic` TR-11.2: 按发件人搜索返回正确结果
  - `programmatic` TR-11.3: 支持多条件组合搜索
  - `programmatic` TR-11.4: 搜索结果分页正确
- **Notes**: D1 全文搜索或 LIKE 查询

## [ ] Task 12: 批量操作
- **Priority**: medium
- **Depends On**: [Task 2, Task 9]
- **Description**: 
  - 实现批量标记已读 POST /api/mail/batch/read
  - 实现批量删除 POST /api/mail/batch/delete
  - 实现批量移动文件夹 POST /api/mail/batch/folder
  - 实现批量添加标签 POST /api/mail/batch/labels
- **Acceptance Criteria Addressed**: [AC-10]
- **Test Requirements**:
  - `programmatic` TR-12.1: 批量标记已读功能正确
  - `programmatic` TR-12.2: 批量删除功能正确
  - `programmatic` TR-12.3: 批量移动文件夹功能正确
  - `programmatic` TR-12.4: 单次批量操作有数量上限保护
- **Notes**: 限制单次批量操作数量（如 100 封）

## [ ] Task 13: 附件上传与下载
- **Priority**: high
- **Depends On**: [Task 2]
- **Description**: 
  - 实现附件上传接口 POST /api/attachments
  - 实现附件下载接口 GET /api/attachments/:id
  - 附件存储到 R2
  - 附件元数据存 D1
  - 支持大文件分片上传（可选）
  - 文件类型和大小验证
- **Acceptance Criteria Addressed**: [AC-11]
- **Test Requirements**:
  - `programmatic` TR-13.1: 可以上传附件到 R2
  - `programmatic` TR-13.2: 可以下载附件
  - `programmatic` TR-13.3: 超过大小限制的文件被拒绝
  - `programmatic` TR-13.4: 附件元数据正确保存到 D1
- **Notes**: 单文件最大 25MB

## [ ] Task 14: KV 缓存与索引优化
- **Priority**: low
- **Depends On**: [Task 8]
- **Description**: 
  - 实现邮件列表缓存
  - 实现用户信息缓存
  - 使用 KV 存储热点数据
  - 缓存失效策略
- **Acceptance Criteria Addressed**: [NFR-1]
- **Test Requirements**:
  - `programmatic` TR-14.1: 重复请求命中缓存，响应更快
  - `programmatic` TR-14.2: 数据更新时缓存正确失效
  - `human-judgement` TR-14.3: 缓存策略合理，不影响数据一致性
- **Notes**: 可选优化项，根据性能需要决定是否实现

## [ ] Task 15: 部署文档与示例
- **Priority**: medium
- **Depends On**: [Task 1]
- **Description**: 
  - 编写部署指南
  - 编写环境变量配置说明
  - 提供 API 文档（OpenAPI/Swagger）
  - 提供使用示例
- **Acceptance Criteria Addressed**: [AC-13]
- **Test Requirements**:
  - `human-judgement` TR-15.1: 部署文档清晰完整
  - `human-judgement` TR-15.2: API 文档完整准确
  - `human-judgement` TR-15.3: 按照文档可以成功部署
- **Notes**: README 中包含快速开始指南
