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
- 密钥生成（JWT 专用 2048 位，仅在文件不存在时生成，`wx` 标志防止覆盖）：
  ```
  node -e "const fs=require('fs'),c=require('crypto');const {publicKey:u,privateKey:r}=c.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});fs.writeFileSync('auth/jwt-private.pem',r,{flag:'wx'});fs.writeFileSync('auth/jwt-public.pem',u,{flag:'wx'})"
  ```
  生成后 JWT 旧 token 全部失效。密码密钥（`auth/*.cer`）不能用此命令覆盖，见"已知问题"。
- 开发服务器：`npm start`（运行 `nodemon ./bin/www`）。默认地址：`http://127.0.0.1:3000`。设置 `PORT` 环境变量可覆盖端口。
- `package.json` 的 dependencies 中没有列出 `nodemon`。如果 `npm start` 报 “nodemon not found”，请全局安装它，或直接运行 `node ./bin/www`。
- 未配置测试运行器、linter，也没有 `npm test`。端到端回归脚本（临时保留，未纳入 git）：
  - 全部：`node scripts/regress/run.js`（约 3 秒，30 项，不符合预期时退出码非 0）
  - 跳过上传：`node scripts/regress/run.js --no-upload`（不写任何文件）
  - 脚本自启动临时服务、自建测试数据并清理、结束时只关闭自己的子进程。账号读取 `.env.local`，需要本地 MongoDB 与 `Postman1` 账号存在。
  - 覆盖：文章权限、搜索/点赞白名单、注销级联、JWT 鉴权、上传（沙箱）、数据库一致性审计。
  - 新增或修改接口后应运行；失败时输出服务日志末尾。
- 启动前必须准备好：
  - MongoDB，地址 `mongodb://127.0.0.1:27017/db_blog`。该地址硬编码在 `plugins/db.js` 中，而不是 `config.js`。
  - 两套独立的 RSA 密钥，`auth/` 已被 gitignore，需要手动准备：
    - 密码加密密钥：`auth/public.cer`、`auth/private.cer`（512 位，`generateKeys()` 生成）。
    - JWT 签名密钥：`auth/jwt-public.pem`、`auth/jwt-private.pem`（2048 位）。缺失时 `app.js` 启动即崩溃；生成命令见下方"密钥生成"。
  - `core/util/util.js` 中的 `generateKeys()` 会**覆盖**密码密钥。它只被 `rsaControl.js` 中的 `getPublicKey()` / `getPrivateKey()` 的缺失回退路径调用，JWT 密钥的读取不走这条路径。
- `Key` 集合需要手动写入数据。`GET /keys` 返回第一条 `Key` 文档的 `content`，而代码中没有任何地方写入 `Key` 文档。

## 架构

**请求管线（`app.js`）。** 中间件按以下顺序执行：CORS、morgan、JSON 和 urlencoded 解析器、cookie-parser、`public/` 和 `uploads/` 的静态文件服务，然后是 `express-jwt`（RS256，用公钥验证，带有 `unless` 白名单）。之后是路由，最底部是统一的错误处理器，它把错误规范化为 `{ code, message }`。成功响应的格式为 `{ message, data }`。

**鉴权。**
- `routes/admin.js` 处理 `POST /admin/login` 和 `POST /admin/register`。`core/sendToken.js` 用 `auth/jwt-private.pem` 签发 RS256 JWT，`app.js` 的 `express-jwt` 用 `auth/jwt-public.pem` 验签（`core/rsaControl.js` 的 `getJwtPublicKeySync` / `getJwtPrivateKey`）。载荷为 `{ username, _id }`，有效期 3 天。JWT 密钥与密码密钥分离后，此前的 token 全部失效。
- `express-jwt` 的 `isRevoked` 钩子会在每个已鉴权请求上执行 `User.findById`。它设置 `req._id` 和 `req.isPass`，但从不拒绝请求。每个处理器必须自己检查 `req.isPass`。
- 密码由客户端用公钥做 RSA 加密（512 位，pkcs1）。`User.password` 的 setter 先用 `decrypt()` 校验传入的密文，然后存储 `encrypt(密文)`。登录时比较 `decrypt(客户端密文)` 与 `decrypt(decrypt(存储值))`。

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

## 已知问题

以下问题均通过阅读代码确认，目前尚未修复。修改相邻代码时请留意。
- 删除文章（`DELETE /api/rest/articles/:id`）时不会级联删除其下的评论，会留下孤立的 `Comment`。注销账号的流程已经会级联删除，两者规则不一致，待统一。
- 请求路径中仍有许多 `console.log` 调试输出。
- 上传接口返回的 URL 带有 `./` 前缀（`routes/upload.js` 用 `path.join` 拼接 URL，在 Windows 路径分隔符下出错），与 multer 版本无关，需改为字符串拼接。
- 密码加密使用 `encryptionScheme: 'pkcs1'`（PKCS#1 v1.5），存在 Bleichenbacher 类填充预言机风险。推荐改为 OAEP，但**需前后端同时改造**：前端加密方式、服务端 `encryptionScheme`、数据库中已存的双层密文都要迁移。当前不改，已在 `docs/api/README.md` 的"安全说明"中写明。
- 密码加密密钥仍为 **512 位**（`generateKeys()` 写死）。JWT 已改用 2048 位独立密钥；密码密钥的强度提升同样需要重新生成并迁移已存密码，未处理。
- `getPrivateKey()` / `getPublicKey()` 在文件缺失时调用 `generateKeys()`，会悄悄覆盖密码密钥。当前无启动路径触发它，但若密钥文件被删，下一次调用会换掉密钥并导致已存密码全部无法校验。
- `getPublicKeySync()`（`core/rsaControl.js`）已无调用方（`app.js` 已切到 JWT 公钥），保留待清理。
- `package-lock.json` 中的 `resolved` 地址指向镜像源（npmmirror、taobao），在其他网络环境安装可能失败。
- `package.json` 未声明 `engines`，但当前依赖要求 Node ≥ 20。
- `core/userControl.js` 是旧版 JSON 文件用户存储，没有任何地方引用，且依赖已删除的 `config.userPath`。待确认是否删除该文件。
- 创建资源（`POST /api/rest/:resource`）直接把 `req.body` 传给 `Model.create`，客户端可以写入 `hit_num`、`like_num`、`comments`、`aids` 等不应由前端控制的字段。待加 `creatable` 白名单。
- `POST /admin/register` 直接把整个 `req.body` 传给 `User.create`，客户端可以指定 `_id`、`signature` 等字段。待加白名单。
- `GET /keys` 在 `Key` 集合为空时，`result.content` 会抛错，且 handler 没有 try/catch，请求会挂起。
- `docs/api/articles/articles.md` 中点赞接口的路径和请求体（`POST /articles/likes`，请求体 `aid`）与代码（`POST /articles/likes/:id`，无请求体）不一致。

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

**有意保留，暂不升级**（由你决定）：
- `mongoose` 8.24.8 保持不动。mongoose 9 的驱动要求 MongoDB 服务端 ≥ 4.4，本地实例为 4.2.3（wire version 8），已实测被拒绝。是否升级 MongoDB 待定：mongoose 8 在 4.2 上可正常运行；但 4.2 已超出官方支持期，若部署到非本地环境，建议先升级 MongoDB 再考虑 mongoose 9。

**运行环境**：Node ≥ 20（express 5、node-rsa 2 的要求）；MongoDB 服务端 ≥ 4.2（mongoose 8 实测通过）。

本次未做 CVE 检查（`npm audit` 在当前镜像源不可用），安全性结论需在网络可用时补查。

## 当前进度与待办（2026-11）

**未提交的改动**（提交前需展示变更摘要，用户未要求提交）：
- 依赖升级与密钥拆分：`app.js`、`config.js`、`plugins/db.js`、`core/rsaControl.js`、`core/sendToken.js`、`core/util/util.js`、`routes/*.js`、`package.json`、`package-lock.json`。
- 功能：`DELETE /user` 注销级联、`PUT /user` 旧密码校验、`users` 总线写入口关闭、`PUBLIC_VIEW` 公开字段收紧、搜索正则转义。
- 文档：`README.md`、`docs/api/**`、`docs/db/README.md`。
- 未纳入 git：`CLAUDE.md`（被 `.gitignore` 忽略）、`scripts/regress/`（新目录）、`.env.local`（已被忽略）、`auth/jwt-*.pem`（已被忽略）。

**待用户决定**：
- MongoDB 是否升级（不影响当前运行：mongoose 8 在 4.2.3 上已通过回归）。
- `core/userControl.js` 是否删除（死代码；删除文件属红线操作，需用户明确要求）。
- 密码加密从 PKCS#1 v1.5 改为 OAEP，需前端配合，暂不做。

**已知不一致，待统一**：
- 单独删除文章不级联删除评论，而注销账号会级联删除。两者规则应统一（见"已知问题"第一条）。

**临时资产**：
- `scripts/regress/`：回归脚本，可临时保留，长期是否入库由用户决定。
- 数据库测试数据：`Postman1`（本地已有）、`Tester01`（回归脚本会用，缺失时自动注册）。账号密码只在 `.env.local`，不要写进代码或文档。

注册请使用 `POST /admin/register`，修改资料请使用 `PUT /user`。`POST /api/rest/users`、`PUT`/`DELETE /api/rest/users/:id` 已取消，返回 404。改密码必须提供 `oldPassword`。`users` 的公开 GET 通过 `bus.js` 中的 `PUBLIC_VIEW` 只暴露 `nikname avatar signature`。
