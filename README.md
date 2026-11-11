# Blog Server

基于 **Node.js + Express + MongoDB** 的前后端分离博客后端，提供注册登录、**jwt-Token验证**、**JWT 鉴权**、**RSA加密**传输、**前端后端数据校验**、文章 / 专栏 / 评论的通用资源接口、文件上传、文章搜索与点赞等功能。

> 详细接口说明见 [API 文档](./docs/api/README.md)，数据库字段见 [数据库设计](./docs/db/README.md)。

---

## 📚 文档

| 文档 | 说明 |
| --- | --- |
| [API 接口文档](./docs/api/README.md) | 全部 HTTP 接口、请求 / 响应、鉴权规则、资源权限矩阵 |
| [数据库设计文档](./docs/db/README.md) | 5 个 MongoDB 集合的字段、约束与关联关系 |

---

## 🛠️ 技术栈

| 分类 | 技术 / 库 |
| --- | --- |
| 运行时 | Node.js |
| Web 框架 | Express 4 |
| 数据库 | MongoDB + Mongoose 5 |
| 鉴权 | JSON Web Token（`jsonwebtoken`、`express-jwt`）、RSA 非对称加密（`node-rsa`） |
| 请求处理 | `cors`、`cookie-parser`、`qs` |
| 日志 | `morgan`、`debug` |
| 文件上传 | `multer` |
| 错误处理 | `http-assert`、`http-errors` |
| 命名转换 | `inflection`（复数 → 单数 Pascal 命名，用于动态加载 Model） |
| 校验模块 | `validate`['账号格式','密码格式','长度','必填','返回语'] |
| 客户端示例依赖 | `jquery`、`axios` |
| 开发工具 | `nodemon`（`npm start` 热更新） |

---

## 📂 目录结构

```text
blog-server/
├── auth/            # RSA 密钥文件（运行时生成）
├── bin/             # 启动入口 (www)
├── core/            # 核心逻辑（工具函数、RSA 控制）
├── docs/
│   ├── api/         # API 接口详细说明
│   └── db/          # 数据库字段详细说明
├── middleware/      # 中间件（resource：根据 URL 动态加载 Model）
├── models/          # Mongoose 数据模型（User/Article/Column/Comment/Key）
├── plugins/         # 插件（数据库连接、POP_* 映射表等）
├── public/          # 公共静态资源
├── routes/          # 路由控制器（bus/admin/user/upload/search/likes...）
├── uploads/         # 上传文件静态目录
├── app.js           # Express 应用入口
├── config.js        # 全局配置
├── package.json
└── ...
```

## ⚙️ 配置说明（`config.js`）

| 字段 | 说明 |
| --- | --- |
| `host` / `port` | 服务监听地址与端口（默认 `127.0.0.1:3000`） |
| `keyPath` | RSA 密钥目录 |
| `pubKeyPath` / `priKeyPath` | 公钥 / 私钥文件路径 |
| `uploadPath` / `uploadURL` | 上传文件存储目录与对外访问前缀 |
| `maxFileSize` | 单文件最大字节数（默认 102400，约 100KB） |

## 📂 核心数据模型
项目包含 5 个核心数据集合（详见 [数据库设计文档](./docs/db/README.md)）：
1. `User`: 用户表（支持昵称、头像、签名，密码基于 RSA 加密传输）
2. `Column`: 专栏/分类表
3. `Article`: 文章表
4. `Comment`: 评论表
5. `Key`: 系统公钥/私钥存储表

> 数据库连接配置见 `plugins/db`。

---

## 🔐 鉴权一览

- 登录成功后返回 **JWT**，后续请求需在请求头携带：
  `Authorization: Bearer <token>`
- **免鉴权**：`GET /api/rest/*`、`POST /admin/login`、`POST /admin/register`、`GET /keys`、`GET /articles/search`、`POST /articles/likes`
- **需鉴权**：其余所有接口
- 密码通过 **RSA 非对称加密**传输（前端用公钥加密，服务端用私钥解密）

详见 [API 文档 - 鉴权章节](./docs/api/README.md#鉴权)。

---

## 📜 NPM Scripts

| 命令 | 说明 |
| --- | --- |
| `npm start` | `nodemon ./bin/www`，开发模式启动 |

---

## 🚀 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 确保本地 MongoDB 已启动（默认 127.0.0.1:27017）

# 3. 启动服务（nodemon 热更新）
npm start
```

默认服务地址：`http://127.0.0.1:3000`

---

## 接口一览
- 登录 login POST
- 注册 register POST
- 公钥获取 getPublicKey GET
- 上传文件 upload POST
- 鉴权 
    访客 无登录 无鉴权
      GET 
        articles
        comments
        keys
        cloumns
        search 
      POST 
        comments
        admin/regiseter

    用户 登录 鉴权
      GET
        articles 
        comments
        cloumns
        keys
        search
      POST
        articles 
        comments
        cloumns 
        upload 
    
      JWT 需要验证token的api
        POST 
          articles
          cloumns
          upload
        PUT
          articles
          cloumns
          userInfo
        DELETE
          articles
          cloumns
          userInfo

---

## 测试_id（现本地数据库已有可测试）
columns 5fdb555c0b8ae033f874e728
users 5fd8bc3eaac2672638f9d8dc
articles 5fdca8c6b5c4b9066085fcec