# API 接口文档 总览与约定



## 通用约定

### 基础信息
- Base URL: `http://127.0.0.1:3000`

### 响应格式

```json
{
  "code": 200,
  "message": "ok",
  "data": {}
}
```

- 成功时通常 `code` 为 `200`，`data` 为业务数据。
- 错误时 `code` 为 HTTP 状态码，`message` 为错误文本。

### 错误状态码

| 状态码 | 含义 |
| --- | --- |
| 400 | 请求参数错误 / 无权修改 / 修改失败 |
| 401 | 未登录、Token 无效或过期 |
| 403 | 无权访问 |
| 404 | 资源不存在 |
| 422 | 参数校验失败（必填 / 重复 / 格式错误 / 文件过大） |
| 500 | 服务器内部错误 |

### 鉴权

- 登录成功后获得 **JWT**，放在请求头：
  ```
  Authorization: Bearer <token>
  ```
- Token 使用 **RS256** 算法，服务端用 `auth/public.cer` 公钥验证。
- 中间件会校验用户是否存在，存在则挂载 `req._id`、`req.isPass = true`。

### 免鉴权白名单

| 方法 | 路径 |
| GET | `/api/rest/*`（所有资源 GET） |
| POST | `/admin/login` |
| POST | `/admin/register` |
| GET | `/keys` |
| GET | `/articles/search` |
| POST | `/articles/likes` |

> 其余所有接口均需携带有效 Token。


## 接口分类导航
- [认证管理 (admin)](./admin/login.md)
- [通用资源总线 (resource)](./resource/README.md)
- [文章扩展 (articles)](./articles/search.md)
- [文件上传 (upload)](./upload/file.md)
- [其他接口 (other)](./other/index.md)






















---

## 1. 认证

### 1.1 登录

`POST /admin/login`

**请求体**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `username` | string | 是 | 用户名 |
| `password` | string | 是 | RSA 加密后的密码 |

**响应**

```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "<jwt>",
    "userInfo": { "_id": "...", "username": "...", "nikname": "...", "avatar": "..." }
  }
}
```

### 1.2 注册

`POST /admin/register`

**请求体**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `username` | string | 是 | 用户名（唯一） |
| `password` | string | 是 | RSA 加密后的密码 |
| `email` | string | 否 | 邮箱（唯一） |
| `nikname` | string | 否 | 昵称 |
| `avatar` | string | 否 | 头像 URL |

**响应**

```json
{ "code": 200, "message": "注册成功" }
```

> 用户名 / 邮箱重复会返回 `422`，提示 `xxx不能重复`。

### 1.3 获取公钥

`GET /keys`

返回当前 RSA 公钥，前端用于加密密码。

```json
{ "code": 200, "message": "ok", "data": { "publicKey": "-----BEGIN PUBLIC KEY-----..." } }
```

### 1.4 登录状态校验

`GET /index`（需 Token）

**响应**

- 已登录：`{ "code": 200, "message": "ok" }`
- 未登录：`{ "code": 401, "message": "请先登录" }`

---

## 2. 通用资源总线（`/api/rest/:resource`）

> 通过 URL 参数 `:resource` 动态映射到对应 Mongoose Model：
> `articles → Article`、`columns → Column`、`comments → Comment`、`users → User`
> 仅当 `models/<PascalName>.js` 存在时有效，否则 `404`。

### 2.1 资源列表

`GET /api/rest/:resource`　**免鉴权**

**Query 参数**

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `page` | 1 | 页码 |
| `size` | 100 | 每页数量 |
| `dis` | 8 | 分页器显示页码数 |
| `query` | `{}` | 查询条件（qs 对象） |
| `query[q]` | — | 关键字，对 `title` / `content` 做正则搜索 |
| `options` | `{}` | Mongoose 查询选项，如 `options[sort]`、`options[limit]`、`options[select]` |
| `populate` | `{}` | 关联填充（若 Model 在 `POPULATE_MAP` 中会被覆盖） |

**示例**

```
GET /api/rest/articles?page=1&size=10&query[q]=vue&options[sort]=-date
GET /api/rest/articles?query[column]=<columnId>
GET /api/rest/columns
GET /api/rest/comments
```

**响应**

```json
{
  "code": 200,
  "message": "ok",
  "data": {
    "count": 100,
    "list": [ ... ],
    "page": 1,
    "size": 10,
    "pages": 10
  }
}
```

### 2.2 资源详情

`GET /api/rest/:resource/:id`　**免鉴权**

**特殊行为**：访问 `Article` 详情时 `hit_num` 自动 +1。

```json
{ "code": 200, "message": "查询成功", "data": { ... } }
```

### 2.3 创建资源

`POST /api/rest/:resource`　**需鉴权**

**各资源特殊规则**

| 资源 | 自动注入 | 必填 / 联动 |
| --- | --- | --- |
| `articles` | `author = req._id` | `column` 必填；创建后向对应 `Column.aids` push 文章 ID |
| `comments` | `uid = req._id` | `aid` 必填；创建后向对应 `Article.comments` push 评论 ID，并 `comment_num + 1` |
| `columns` | `uid = req._id` | 无 |
| `users` | 无 | 走 Model 默认校验 |

**示例：创建文章**

```http
POST /api/rest/articles
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Vue3 实践",
  "cover": "https://xxx/cover.png",
  "content": "正文...",
  "column": "<columnId>"
}
```

**响应**

```json
{ "code": 200, "message": "提交成功", "data": { "id": "<newId>" } }
```

### 2.4 更新资源

`PUT /api/rest/:resource/:id`　**需鉴权**

**规则**

- 仅 `POP_PUT_MAP` 中配置的 Model 可更新，否则返回 `400 无权修改`。
- 仅允许修改 `revisable` 白名单字段。
- 必须是资源所有者（`authField` 与 `req._id` 一致）。
- 每次更新自动写入 `date` 字段。

**各资源白名单**

| 资源 | 可改字段 | 归属字段 |
| --- | --- | --- |
| `articles` | `title`、`cover`、`content` | `author` |
| `columns` | `name` | `uid` |
| `comments` | `content` | `uid` |
| `users` | `password`、`email`、`nikname` | `_id` |

**响应**

```json
{ "code": 200, "message": "修改成功" }
```

**错误**

| 场景 | 状态码 | message |
| --- | --- | --- |
| Model 未配置 | 400 | 无权修改 |
| 资源不存在 | 404 | 资源不存在 |
| 非作者 | 400 | 无权修改 |
| 无可改字段 | 400 | 修改失败 |

### 2.5 删除资源

`DELETE /api/rest/:resource/:id`　**需鉴权**

> ⚠️ 当前 bus 的删除逻辑未做作者校验，任意登录用户可删除任意资源。

**响应**

```json
{ "code": 200, "errMsg": "ok" }
```

---

## 3. 文件上传

`POST /upload`　**需鉴权**

**Content-Type**：`multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | File | 是 | 上传文件，受 `config.maxFileSize` 限制 |
| `uid` | string | 视场景 | 当分类为 `user`（头像）时必填 |
| `classIfy` | string | 否 | 文件分类，如 `user` / `article` |

**响应**

```json
{ "code": 200, "message": "ok", "data": { "url": "http://127.0.0.1:3000/<filename>" } }
```

**错误**

- 文件超过限制：`422`，`文件大小不得超过 102400 bytes`

> 上传成功后文件位于 `uploads/` 目录，通过 `http://127.0.0.1:3000/<filename>` 直接访问。

---

## 4. 文章扩展

### 4.1 文章搜索

`GET /articles/search`　**免鉴权**

**Query 参数**

| 参数 | 说明 |
| --- | --- |
| `q` / `keyword` | 搜索关键字（具体字段以实现为准） |
| `page` / `size` | 分页 |

**响应**：与资源列表结构一致。

### 4.2 文章点赞

`POST /articles/likes`　**免鉴权**

**请求体**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `aid` | string | 文章 ID |
| `uid` | string | 用户 ID（若接口按登录态取 `req._id` 则无需传） |

**响应**

```json
{ "code": 200, "message": "ok" }
```

> 文章 `like_num` 相应 +1。

---

## 5. 用户模块（`/user/*`）

> 由 `routes/user.js` 提供，当前仓库未展开。按项目约定通常包含：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/user/info` | 获取当前登录用户信息 |
| PUT | `/user/info` | 更新用户信息（等同 `PUT /api/rest/users/:id`） |
| DELETE | `/user/info` | 注销 / 删除账号 |

> 以实际实现为准，本文档待补充。