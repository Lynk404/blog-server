# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 行为准则

来源：[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)，用于减少 LLM 常见的编码错误。与本项目的专属说明合并使用。

**取舍：** 这些准则偏向谨慎而非速度。对于简单任务，自行判断即可。

### 1. 先想清楚再动手

**不要假设，不要隐藏困惑，把取舍说清楚。**

动手前：
- 明确列出假设。拿不准时就问。
- 存在多种理解时全部列出，不要悄悄选一个。
- 如果有更简单的做法，直接说出来。必要时提出反对意见。
- 有不清楚的地方就停下来，指出困惑所在，然后提问。

### 2. 简单优先

**用最少的代码解决问题，不做任何猜测性的功能。**

- 不添加需求之外的功能。
- 不为只用一次的代码引入抽象。
- 不加入未被要求的“灵活性”或“可配置性”。
- 不为不可能发生的场景写错误处理。
- 如果 200 行能压到 50 行，就重写。

自问：“资深工程师会不会觉得这太复杂？”如果会，就简化。

### 3. 外科手术式修改

**只碰必须碰的部分，只清理自己制造的烂摊子。**

修改已有代码时：
- 不“顺手优化”相邻的代码、注释或格式。
- 不重构没有坏的东西。
- 即使你会用另一种写法，也要匹配现有风格。
- 发现无关的死代码，提出来即可，不要删除。

如果你的改动产生了孤儿代码：
- 删除**你的改动**导致不再使用的 import、变量或函数。
- 除非被要求，不要删除原本就存在的死代码。

检验标准：每一行改动都能直接追溯到用户的请求。

### 4. 目标驱动执行

**定义成功标准，验证通过前持续迭代。**

把任务转化为可验证的目标：
- “添加校验” → “先为非法输入写测试，再让它们通过”
- “修复 bug” → “先写一个能复现它的测试，再让它通过”
- “重构 X” → “重构前后测试都要通过”

对于多步骤任务，先给出简短计划：
```
1. [步骤] → 验证：[检查项]
2. [步骤] → 验证：[检查项]
3. [步骤] → 验证：[检查项]
```

明确的成功标准让你能够独立迭代。模糊的标准（“让它能用”）则需要不断澄清。

---

**如果这些准则生效，你会看到：** 不必要的改动变少，因过度复杂而重写的情况变少，澄清性问题在实现之前提出，而不是在犯错之后。

## 命令

- 安装依赖：`npm install`
- 开发服务器：`npm start`（运行 `nodemon ./bin/www`）。默认地址：`http://127.0.0.1:3000`。设置 `PORT` 环境变量可覆盖端口。
- `package.json` 的 dependencies 中没有列出 `nodemon`。如果 `npm start` 报 “nodemon not found”，请全局安装它，或直接运行 `node ./bin/www`。
- 端到端回归（未配置测试运行器/linter，也没有 `npm test`）：
  - 全部：`node scripts/regress/run.js`（约 3 秒，30 项，不符合预期时退出码非 0）
  - 跳过上传：`node scripts/regress/run.js --no-upload`（不写任何文件）
  - 脚本自启动临时服务、自建测试数据并清理、结束时只关闭自己的子进程。账号读取 `.env.local`，需要本地 MongoDB 与 `Postman1` 账号存在。
  - 覆盖：文章权限、搜索/点赞白名单、注销级联、JWT 鉴权、上传（沙箱）、数据库一致性审计。
  - 新增或修改接口后应运行；失败时输出服务日志末尾。
- 启动前必须准备好：
  - MongoDB，地址 `mongodb://127.0.0.1:27017/db_blog`。该地址硬编码在 `plugins/db.js`，不在 `config.js`。
  - 两套独立的 RSA 密钥，`auth/` 已被 gitignore，需要手动准备：
    - 密码加密密钥 `auth/public.cer`、`auth/private.cer`，**2048 位**。
    - JWT 签名密钥 `auth/jwt-public.pem`、`auth/jwt-private.pem`，2048 位。缺失时 `app.js` 启动即崩溃。
    - 两套密钥都**只读**：文件缺失时 `core/rsaControl.js` 直接抛错，不会自动生成或覆盖。
- JWT 密钥生成（仅在文件不存在时生成，`wx` 标志防止覆盖）：
  ```
  node -e "const fs=require('fs'),c=require('crypto');const {publicKey:u,privateKey:r}=c.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});fs.writeFileSync('auth/jwt-private.pem',r,{flag:'wx'});fs.writeFileSync('auth/jwt-public.pem',u,{flag:'wx'})"
  ```
  生成后 JWT 旧 token 全部失效。
- 密码密钥生成（**新环境才需要**，会覆盖已有密钥并导致存量密码全部无法校验）：
  ```
  node -e "const fs=require('fs'),c=require('crypto');const {publicKey:u,privateKey:r}=c.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});fs.writeFileSync('auth/private.cer',r,{flag:'wx'});fs.writeFileSync('auth/public.cer',u,{flag:'wx'})"
  ```
  生成后必须跑 `node scripts/sync-key.js` 同步 `Key` 集合，否则前端拿到的公钥不匹配。
- 密码密钥轮换用 `node scripts/migrate-keys-2048.js`（支持 `--dry` 预演）：备份 → 生成新密钥 → 重加密存量用户 → 同步 `Key` 集合。**换密钥必须同时更新 `Key` 集合**，否则前端拿到的公钥与服务端私钥不匹配。
- 填充方式迁移用 `node scripts/migrate-oaep.js`（支持 `--dry` 预演）：旧填充解两层 → 新填充双层加密 → 写回。切换到旧填充的数据库备份后必须跑一次，否则存量用户无法登录。
- 公钥同步：`node scripts/sync-key.js`，把 `auth/public.cer` 写入 `Key` 集合（清空后插入一条）。`GET /keys` 返回第一条 `Key` 文档的 `content`，代码中没有任何地方写入它，集合为空时返回 404。换密钥后忘了跑会导致前端公钥不匹配、所有登录失败。

## 架构

**请求管线（`app.js`）。** 中间件按以下顺序执行：CORS、morgan、JSON 和 urlencoded 解析器、cookie-parser、`public/` 和 `uploads/` 的静态文件服务，然后是 `express-jwt`（RS256，用公钥验证，带有 `unless` 白名单）。之后是路由，最底部是统一的错误处理器，它把错误规范化为 `{ code, message }`。成功响应的格式为 `{ message, data }`。

**鉴权。**
- `routes/admin.js` 处理 `POST /admin/login` 和 `POST /admin/register`。`core/sendToken.js` 用 `auth/jwt-private.pem` 签发 RS256 JWT，`app.js` 的 `express-jwt` 用 `auth/jwt-public.pem` 验签（`core/rsaControl.js` 的 `getJwtPublicKeySync` / `getJwtPrivateKey`）。载荷为 `{ username, _id }`，有效期 3 天。JWT 密钥与密码密钥分离后，此前的 token 全部失效。
- `express-jwt` 的 `isRevoked` 钩子会在每个已鉴权请求上执行 `User.findById`。它设置 `req._id` 和 `req.isPass`，但从不拒绝请求。每个处理器必须自己检查 `req.isPass`。
- 密码由客户端用公钥做 RSA 加密（2048 位，**OAEP 填充，SHA-1**）。`User.password` 的 setter 先用 `decrypt()` 校验传入的密文，然后存储 `encrypt(密文)`。登录时比较 `decrypt(客户端密文)` 与 `decrypt(decrypt(存储值))`。**两层解密都要传 `'utf8'`**，第一层漏掉会抛 `Error during decryption`。
- 填充方式由常量 `ENCRYPTION_SCHEME = 'pkcs1_oaep'`（`core/util/util.js`）统一定义，改填充只改这一处。**前端必须用 `RSA-OAEP` + `SHA-1`**，`SHA-256` 会导致解密失败。

**通用资源 API（`/api/rest/:resource`）。** 这是应用的核心。
1. `middleware/resource.js` 通过 `inflection.classify` 把 URL 段转换为模型名（`articles` → `Article`），然后 require `models/<Name>.js`。文件不存在时返回 404。
2. `routes/bus.js` 以通用方式实现 CRUD 处理器。每个模型的特定行为来自 `plugins/` 中的配置映射：
   - `RESOURCE_POST_MAP`：创建时从 `req._id` 注入所有者（`Article.author`、`Column.uid`、`Comment.uid`）。
   - `POP_POST_MAP`：创建后把新 id 推入父文档。Comment 推入 `Article.comments` 并使 `comment_num` 加 1；Article 推入 `Column.aids`。
   - `POP_PUT_MAP`：定义 `revisable` 字段白名单和 `authField` 所有权检查。只有在此处列出的模型才能被更新。
   - `POPULATE_MAP`：列表和详情 GET 的关联数据填充。
   - `POP_GET_MAP`：详情 GET 的副作用。读取 Article 会使 `hit_num` 加 1。
   - `QUE_MAP` 和 `ADMIN_CLASSIFY` 是小型查找表。`ADMIN_CLASSIFY` 目前为空。
3. `/api/rest` 下的 GET 请求是公开的。其他方法都需要 token。例外情况列在 `app.js` 的 `unless` 白名单中。

**其他端点。** 每个都位于 `routes/` 下各自的路由文件中。
- `/user`：获取、修改（`PUT`，需旧密码）和注销（`DELETE`，需当前密码）当前用户，使用 `req._id`。注销的级联规则较重，会删除他人在本人专栏中的文章和他人在本人文章下的评论，详见 `docs/api/other/other.md`。
- `/keys`：返回 `Key` 集合中的公钥。
- `/upload/:classify`：`multer` 存储到 `uploads/{user|article}/`。`article` 分类返回 `{ errno, data }`，即富文本编辑器所需的格式。
- `/articles/search`：对 `title` 和 `content` 做正则搜索。
- `/articles/likes/:id`：`POST`，无需鉴权，使 `like_num` 加 1。

**模型（`models/`）。** Mongoose 8，共五个集合：`User`、`Article`、`Column`、`Comment` 和 `Key`。日期由 `core/util/util.js` 中的 `formatDate` 格式化。`Article.content` 的 setter 会执行 `decodeURIComponent`，并把 `"` 替换为 `'`。

**配置。** `config.js` 设置监听地址、端口、密钥路径、上传路径和 URL，以及最大上传大小（100 KB）。`uploadURL` 硬编码为 `http://127.0.0.1:3000/`。

## 已知问题与待办

按影响程度排序。这里同时是问题清单和待办清单，修掉一项就删一条。

### 高 —— 安全

**1. 前端必须改 OAEP，否则登录全部失败**

服务端已于 2026-11 从 PKCS#1 v1.5 切换到 OAEP（`ENCRYPTION_SCHEME = 'pkcs1_oaep'`，摘要 SHA-1），存量密文已用 `scripts/migrate-oaep.js` 重加密。

**前端尚未同步改造。** 在它发版之前，旧客户端提交的 pkcs1 密文会被服务端拒绝，登录和注册全部失败。前端改法（WebCrypto 与 node-rsa 两种写法）已写在 `docs/api/README.md` 的"安全说明（密码传输）"，关键是 `hash: 'SHA-1'`，用 `SHA-256` 同样会失败。

> 本地开发用回归脚本验证，脚本已同步改为 OAEP；只有真实前端还停在旧填充。

### 中 —— 部署

**2. `GET /keys` 依赖手工维护的 `Key` 集合**

代码中没有任何地方写入 `Key` 文档，`GET /keys` 完全依赖它。集合为空时返回 404（不会挂起）。这是现有设计，不是缺陷，但部署和换密钥时**必须**手工同步，否则前端拿到的公钥与服务端私钥不匹配，所有登录失败。维护方法见 `docs/api/other/other.md`。

### 待决定

**MongoDB 是否升级到 ≥ 4.4。** mongoose 9 的驱动要求服务端 ≥ 4.4，本地实例是 4.2.3（wire version 8），实测会被拒绝。当前 mongoose 8 在 4.2 上运行正常，不影响开发；但 4.2 已超出官方支持期，若要部署到非本地环境，建议先升 MongoDB 再考虑 mongoose 9。**当前决定：不升。**

### 暂缓（用户要求，非技术阻塞）

**3. `package-lock.json` 的 `resolved` 指向镜像源**（npmmirror、taobao，共 140 处）。官方源实测可连通，但用户反馈网络不稳定，重写 lockfile 后日常 `npm install` 可能反而变慢或失败。**保持现状。**

**4. `npm audit` 未跑过。** 同理暂缓。

---

## 当前状态（2026-11）

工作区干净，改动已提交。回归 `node scripts/regress/run.js` **30/30 通过**。

修复这些问题时遵循的流程，后续可复用：**先给方案 → 用户确认 → 按批次实施 → 每批跑回归 → 同步 `docs/`**。

关键实现细节（容易踩的坑）：

- **双层 RSA 解密每层都要传 `'utf8'`。** `decrypt(decrypt(stored, 'utf8'), 'utf8')`。第一层漏掉会抛 `Error during decryption`，且报错信息不指向原因。
- **创建接口走白名单。** `plugins/RESOURCE_POST_MAP.js` 的 `creatable` 决定哪些字段能进来；不在该映射表里的模型，POST 直接 404。新增可创建资源时必须在这里登记。
- **删除文章会级联删除其下评论**，与注销账号规则一致。回归脚本的数据库审计会检查孤立评论。
- **两套密钥都是只读的。** `auth/` 被 gitignore，文件缺失时服务启动即失败，不会自动生成。JWT 密钥手写生成命令见"命令"一节；密码密钥轮换用 `scripts/migrate-keys-2048.js`。

测试数据：`Postman1`（本地已有）、`Tester01`（回归脚本用，缺失自动注册）。账号密码只在 `.env.local`，不要写进代码或文档。

注册请使用 `POST /admin/register`，修改资料请使用 `PUT /user`。`POST /api/rest/users`、`PUT`/`DELETE /api/rest/users/:id` 已取消，返回 404。改密码必须提供 `oldPassword`。`users` 的公开 GET 通过 `PUBLIC_VIEW` 只暴露 `nikname avatar signature`。

## 依赖升级计划

升级流程：每个包单独升级 → 对照文档/迁移指南改代码 → 端到端回归（登录、注册、资源 CRUD、删除权限、注销级联、搜索/点赞白名单、上传）→ 同步文档。

**已完成**（均已通过回归）：
- `express` 4.16.4 → 5.3.0：`res.send(status, body)` 全部改为 `res.status(status).send(body)`；`app.set('query parser', 'extended')` 保持 qs 嵌套解析；解析器后统一把 `req.body` 设为 `{}`（Express 5 无请求体时为 `undefined`）。
- `express-jwt` 6.0.0 → 8.5.1：改用命名导出 `expressjwt`；`isRevoked` 改为 `(req, token)` 签名，返回 `false`（从不拒绝），只挂载 `req.isPass`。
- `node-rsa` 1.1.1 → 2.0.0：CJS 导出需取 `.default`（`core/util/util.js`）。加密仍用 `pkcs1`，与已存库的密文兼容。
- `mongoose` 5.11.5 → 8.24.8（driver 6.20.0）：`plugins/db.js` 去掉已废弃的 `useNewUrlParser`、`useUnifiedTopology`；`user.js` 的 `.count()` 改为 `countDocuments()`。
- `multer` 1.4.2 → 2.5.0：修复 CVE-2022-24434（1.4.4 仍受影响）。上传 API 与 `LIMIT_FILE_SIZE` 错误码保持不变。
- `inflection` 1.12.0 → 3.0.2：`classify` 对全部资源名的输出前后一致。
- `debug` 2.6.9 → 4.4.3、`http-errors` 1.6.3 → 2.0.1、`morgan` 1.9.1 → 1.12.1。
- 小版本：`cookie-parser` 1.4.7、`cors` 2.8.6、`http-assert` 1.5.0、`qs` 6.17.1。
- `jsonwebtoken` 8.5.1 → 9.0.3：JWT 改用独立的 2048 位密钥对（`auth/jwt-*.pem`），密码密钥未动。此前签发的 token 全部失效。验证见回归脚本的"JWT 鉴权"用例。

**运行环境**：Node ≥ 20（express 5、node-rsa 2 的要求）；MongoDB 服务端 ≥ 4.2（mongoose 8 实测通过）。
