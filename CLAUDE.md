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
  - 全部：`node scripts/regress/run.js`（约数秒，不符合预期时退出码非 0）
  - 跳过上传：`node scripts/regress/run.js --no-upload`（不写任何文件）
  - 脚本自启动临时服务、自建测试数据并清理、结束时只关闭自己的子进程。账号读取 `.env.local`，需要本地 MongoDB 与 `Postman1` 账号存在。
  - 覆盖：文章权限、搜索/点赞白名单、注销级联、JWT 鉴权（含修改密码与注销后的旧 token 在各写入口返回 401）、用户资料（头像与改密码）、专栏级联删除、错误路径与校验、上传（沙箱）、数据库一致性审计。
  - 新增或修改接口后应运行；失败时输出服务日志末尾。
- 启动前必须准备好：
  - MongoDB，地址 `mongodb://127.0.0.1:27017/db_blog`。该地址硬编码在 `plugins/db.js`，不在 `config.js`。首次连接失败时服务打印错误并以退出码 1 结束，不会带着未连接的数据库启动。
  - 两套独立的 RSA 密钥，`auth/` 已被 gitignore，需要手动准备：
    - 密码加密密钥 `auth/public.cer`、`auth/private.cer`，**2048 位**。由 `core/util/util.js` 的 `encrypt`/`decrypt` 直接读取，没有自动生成逻辑。
    - JWT 签名密钥 `auth/jwt-public.pem`、`auth/jwt-private.pem`，2048 位。由 `core/rsaControl.js` 读取，缺失时 `app.js` 启动即崩溃。
    - **两套密钥都不会自动生成或覆盖**，文件缺失时直接抛错。生成命令见下。
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

**请求管线（`app.js`）。** 中间件按以下顺序执行：CORS、morgan、JSON 和 urlencoded 解析器、cookie-parser、`public/` 和 `uploads/` 的静态文件服务（`uploads/` 带 `nosniff`），然后是 `express-jwt`（RS256，用公钥验证，带有 `unless` 白名单）。之后是路由，最底部是统一的错误处理器，它把错误规范化为 `{ code, message }`。成功响应的格式为 `{ message, data }`。

**鉴权。**
- `routes/admin.js` 处理 `POST /admin/login` 和 `POST /admin/register`。`core/sendToken.js` 用 `auth/jwt-private.pem` 签发 RS256 JWT，`app.js` 的 `express-jwt` 用 `auth/jwt-public.pem` 验签（`core/rsaControl.js` 的 `getJwtPublicKeySync` / `getJwtPrivateKey`）。载荷为 `{ username, _id }`，有效期 3 天。JWT 密钥与密码密钥分离后，此前的 token 全部失效。
- `express-jwt` 的 `isRevoked` 钩子会在每个已鉴权请求上执行 `User.findById`。它设置 `req._id` 和 `req.isPass`，但从不拒绝请求。每个处理器必须自己检查 `req.isPass`。签发时间（`iat`，秒）早于 `User.pwdChangedAt` 的 token 同样置为 `isPass = false`，改密码时由 `PUT /user` 写入该字段。
- 未登录访问任何路径（包括不存在的路径）都返回 401，因为鉴权先于路由执行。
- **所有需要登录的写入口都必须检查 `req.isPass`**（`express-jwt` 的 `isRevoked` 对修改密码后的旧 token、已注销账号的 token 置为 `false`，但从不拒绝）。当前已覆盖：`bus.js` 的 POST、PUT、DELETE，`routes/user.js`，`routes/artLikes.js`，`routes/upload.js`（检查放在 multer 之前，避免先写盘）。新增写入口时必须同样检查，并在回归中加入旧 token 用例。
- 密码由客户端用公钥做 RSA 加密（2048 位，**OAEP 填充，SHA-1**）。`User.password` 的 setter 先用 `decrypt()` 校验传入的密文，然后存储 `encrypt(密文)`。登录时比较 `decrypt(客户端密文)` 与 `decrypt(decrypt(存储值))`。**两层解密都要传 `'utf8'`**，第一层漏掉会抛 `Error during decryption`。
- 填充方式由常量 `ENCRYPTION_SCHEME = 'pkcs1_oaep'`（`core/util/util.js`）统一定义，改填充只改这一处。**前端必须用 `RSA-OAEP` + `SHA-1`**，`SHA-256` 会导致解密失败。

**通用资源 API（`/api/rest/:resource`）。** 这是应用的核心。
1. `middleware/resource.js` 通过 `inflection.classify` 把 URL 段转换为模型名（`articles` → `Article`），然后 require `models/<Name>.js`。文件不存在时返回 404。
2. `routes/bus.js` 以通用方式实现 CRUD 处理器。每个模型的特定行为来自 `plugins/` 中的配置映射：
   - `RESOURCE_POST_MAP`：创建时从 `req._id` 注入所有者（`Article.author`、`Column.uid`、`Comment.uid`）。
   - `POP_POST_MAP`：创建前校验父文档存在（缺失 422 `xxx必填`，不存在 422 `xxx不存在`），Article 还校验专栏归属（`ownerField`，他人的专栏 403），创建后把新 id 推入父文档。Comment 推入 `Article.comments` 并使 `comment_num` 加 1；Article 推入 `Column.aids`。
   - `POP_PUT_MAP`：定义 `revisable` 字段白名单和 `authField` 所有权检查。只有在此处列出的模型才能被更新。
   - `POPULATE_MAP`：列表和详情 GET 的关联数据填充。
   - `POP_GET_MAP`：详情 GET 的副作用。读取 Article 会使 `hit_num` 加 1。
   - `ADMIN_CLASSIFY` 目前为空。`plugins/QUE_MAP.js` 只被 `routes/admin.js` 导入，未被使用（见"低优先级"待办）。字段中文名映射实际在 `app.js` 的 `QUE_MAP` 中。
3. `/api/rest` 下的 GET 请求是公开的。其他方法都需要 token。例外情况列在 `app.js` 的 `unless` 白名单中。**这是设计意图**：页面展示需要未登录用户读取文章、专栏、评论和用户公开字段，用户的写操作（发布、评论、点赞、修改、删除）都要求登录。不要为了"安全"把 GET 收回鉴权。公开列表禁止 Mongo 操作符（键名以 `$` 开头返回 400），`size` 上限 100。
4. 专栏删除和注销账号一样级联：删除专栏下的全部文章（包括他人的）及其评论。

**其他端点。** 每个都位于 `routes/` 下各自的路由文件中。
- `/user`：获取、修改（`PUT`，改密码需旧密码且会使旧 token 失效；可改 `password`/`email`/`nikname`/`avatar`）和注销（`DELETE`，需当前密码）当前用户，使用 `req._id`。注销的级联规则较重，会删除他人在本人专栏中的文章和他人在本人文章下的评论，详见 `docs/api/other/other.md`。
- `/keys`：返回 `Key` 集合中的公钥。
- `/upload/:classify`：`multer` 存储到 `uploads/{user|article}/`，只允许图片扩展名（`fileFilter`），未知分类在落盘前返回 400。头像上传（`user`）的 `uid` 必须等于当前用户，缺失返回 422、他人返回 403；multer 已落盘的文件在拒绝时由 `discardFiles` 删除。`article` 分类返回 `{ errno, data }`，即富文本编辑器所需的格式。
- `/articles/search`：`GET`，免鉴权，必须带 `query[q]`（缺失返回 400），对 `title` 和 `content` 做转义后的正则搜索。
- `/articles/likes/:id`：`POST`，需登录，使 `like_num` 加 1。

**模型（`models/`）。** Mongoose 8，共五个集合：`User`、`Article`、`Column`、`Comment` 和 `Key`。日期由 `core/util/util.js` 中的 `formatDate` 格式化。`Article.content` 的 setter 会执行 `decodeURIComponent`，并把 `"` 替换为 `'`。

**配置。** `config.js` 设置监听地址、端口、密钥路径、上传路径和 URL，以及最大上传大小（2 MB）。`uploadURL` 硬编码为 `http://127.0.0.1:3000/`。

## 已知问题与待办

按上线前的必要性排序。修掉一项就删一条。

### 上线前必须处理

**1. 前端必须改 OAEP，否则登录全部失败**

服务端已于 2026-11 从 PKCS#1 v1.5 切换到 OAEP（`ENCRYPTION_SCHEME = 'pkcs1_oaep'`，摘要 SHA-1），存量密文已用 `scripts/migrate-oaep.js` 重加密。

前端 `blog-web` 已同步改为 OAEP + SHA-1（`src/utils/encrypt.ts`）。旧客户端若仍提交 pkcs1 密文，会被服务端拒绝，登录和注册失败。前端改法（WebCrypto 与 node-rsa 两种写法）见 `docs/api/api.md` 的"安全说明（密码传输）"，关键是 `hash: 'SHA-1'`，用 `SHA-256` 同样会失败。

> 本地开发用回归脚本验证，脚本与前端均已使用 OAEP。


**2. CORS 允许任意来源并携带凭据**

`app.js` 中 `origin: true` 加 `credentials: true`，任意站点都能跨域携带凭据请求后端。前端目前仍在本地开发，暂不改动。上线前改为白名单（如环境变量 `CORS_ORIGINS`），并在回归中验证白名单内外的行为。鉴权走 `Authorization` 头而非 cookie，CSRF 风险有限，但配置本身不合理。

**3. 部署前必须改的硬编码**

以下地址写死在代码里，只在本地可用：

| 位置 | 值 | 影响 |
| --- | --- | --- |
| `config.js` → `uploadURL` | `http://127.0.0.1:3000/` | 上传接口返回的图片 URL 指向本机，部署后前端拿到的地址打不开 |
| `plugins/db.js` | `mongodb://127.0.0.1:27017/db_blog` | 数据库地址，不在 `config.js` 里 |
| `models/User.js` → 头像 `default` | `http://127.0.0.1:3000/images/avatar.png` | 新注册用户的默认头像指向本机 |
| `scripts/sync-key.js`、`scripts/migrate-keys-2048.js`、`scripts/migrate-oaep.js` | `mongodb://127.0.0.1:27017/db_blog` | 运维脚本各自写死的数据库地址，部署环境不同时需同步修改 |

### 部署与运维注意

**4. `GET /keys` 依赖手工维护的 `Key` 集合**

代码中没有任何地方写入 `Key` 文档，`GET /keys` 完全依赖它。集合为空时返回 404（不会挂起）。这是现有设计，不是缺陷，但部署和换密钥时**必须**手工同步，否则前端拿到的公钥与服务端私钥不匹配，所有登录失败。用 `node scripts/sync-key.js` 同步，细节见 `docs/api/other/other.md`。

### 暂缓（已确认）

- **登录与点赞限速。** 登录未限速，用户名可枚举（响应已统一文案，但暴力破解仍无限制）。点赞同理。实现方式待定：自己在内存里计数，或引入 `express-rate-limit`。
- **MongoDB 不升级。** mongoose 9 的驱动要求服务端 ≥ 4.4，本地是 4.2.3（wire version 8），实测被拒。mongoose 8 在 4.2 上运行正常。只有"要部署到对外环境"或"要用 mongoose 9"时才需重新评估。
- **`package-lock.json` 的镜像源保持现状。** 140 处 `resolved` 指向 npmmirror/taobao。官方源能连通，但用户所在网络不稳定，重写后日常 `npm install` 可能反而失败。同理 `npm audit` 也暂缓。

  若将来网络稳定，重写 lockfile 的做法：`npm install --package-lock-only --registry=https://registry.npmjs.org/`，然后务必 diff 确认只有 `resolved`/`integrity` 变化、依赖版本号一字未动（`package.json` 用的是 `^` 范围，重解析可能引入未测过的新版本）。

### 低优先级（待排期）

- **索引缺失。** `Comment.aid`、`Article.author`、`Article.column` 没有索引，删除级联和按作者查询会全表扫描。
- **未使用的代码。** `core/statusControl.js` 没有引用，`routes/admin.js`、`routes/search.js` 有未使用的导入，`plugins/ADMIN_CLASSIFY.js`、`plugins/DATE_FROMAT_MAP.js` 的引用情况需再确认。清理前先确认，不要顺手删。

---

## 工作约定

**改接口或数据库结构时，同步更新 `./docs/` 下对应文档**（用户的长期要求）。文档格式以现有文件为准。

修改流程：**先给方案 → 用户确认 → 按批次实施 → 每批跑回归 → 同步 `docs/`**。

**上线前检查**：完成"已知问题与待办"中"上线前必须处理"的三项（OAEP 前端改造、CORS 白名单、部署硬编码），并确认 `Key` 集合已同步。

几个容易踩的点（细节见"架构"）：

- 双层 RSA 解密每层都要传 `'utf8'`，漏掉会抛 `Error during decryption`。
- 新增可创建的资源必须在 `plugins/RESOURCE_POST_MAP.js` 登记 `creatable` 白名单，否则 POST 直接 404。
- `users` 没有总线写入口：注册用 `POST /admin/register`，改资料用 `PUT /user`（改密码必须带 `oldPassword`）。公开 GET 通过 `PUBLIC_VIEW` 只暴露 `nikname avatar signature`。
- 免鉴权接口只有 `app.js` 的 `unless` 白名单一处定义。白名单用锚定正则（如 `^/api/rest/`），不要用无锚定的正则，否则路径中含该字符串的请求也会被放行。新增免鉴权接口要同时更新白名单和 `docs/api/api.md`。
- 点赞需要登录（`POST /articles/likes/:id` 不在白名单中）。匿名读取文章、专栏、评论是设计意图，见"架构"第 3 条。

测试数据：`Postman1` 必须已存在；`Tester01` 缺失时回归脚本会自动注册。账号密码只在 `.env.local`，不要写进代码或文档。

## 依赖升级计划

升级流程：每个包单独升级 → 对照文档/迁移指南改代码 → 端到端回归（登录、注册、资源 CRUD、删除权限、注销级联、搜索/点赞白名单、上传）→ 同步文档。

**状态（2026-11-12 核对）**：下列 14 个直接依赖均已对齐到计划版本，`npm ls` 无缺失或冲突，传递依赖 `mongodb` 驱动为 6.20.0。本计划**无未完成项**。与依赖相关的暂缓事项（mongoose 9、lockfile 镜像源、`npm audit`）见"已知问题与待办"的"暂缓"一节。

**已完成**（均已通过回归）：
- `express` 4.16.4 → 5.3.0：`res.send(status, body)` 全部改为 `res.status(status).send(body)`；`app.set('query parser', 'extended')` 保持 qs 嵌套解析；解析器后统一把 `req.body` 设为 `{}`（Express 5 无请求体时为 `undefined`）。
- `express-jwt` 6.0.0 → 8.5.1：改用命名导出 `expressjwt`；`isRevoked` 改为 `(req, token)` 签名，返回 `false`（从不拒绝），只挂载 `req.isPass`。
- `node-rsa` 1.1.1 → 2.0.0：CJS 导出需取 `.default`（`core/util/util.js`）。填充方式后来又从 `pkcs1` 改为 `pkcs1_oaep`（见"已知问题与待办"第 1 条）。
- `mongoose` 5.11.5 → 8.24.8（driver 6.20.0）：`plugins/db.js` 去掉已废弃的 `useNewUrlParser`、`useUnifiedTopology`；`user.js` 的 `.count()` 改为 `countDocuments()`。
- `multer` 1.4.2 → 2.5.0：修复 CVE-2022-24434（1.4.4 仍受影响）。上传 API 与 `LIMIT_FILE_SIZE` 错误码保持不变。
- `inflection` 1.12.0 → 3.0.2：`classify` 对全部资源名的输出前后一致。
- `debug` 2.6.9 → 4.4.3、`http-errors` 1.6.3 → 2.0.1、`morgan` 1.9.1 → 1.12.1。
- 小版本：`cookie-parser` 1.4.7、`cors` 2.8.6、`http-assert` 1.5.0、`qs` 6.17.1。
- `jsonwebtoken` 8.5.1 → 9.0.3：JWT 改用独立的 2048 位密钥对（`auth/jwt-*.pem`），密码密钥未动。此前签发的 token 全部失效。验证见回归脚本的"JWT 鉴权"用例。

**运行环境**：Node ≥ 20（express 5、node-rsa 2 的要求）；MongoDB 服务端 ≥ 4.2（mongoose 8 实测通过）。
