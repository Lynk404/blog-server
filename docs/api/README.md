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
- Token 使用 **RS256** 算法，签名密钥为 **JWT 专用 2048 位密钥对**：签发用 `auth/jwt-private.pem`，验签用 `auth/jwt-public.pem`。该密钥对与密码加密密钥（`auth/*.cer`）分离。
- Token 有效期 3 天。
- 中间件会校验用户是否存在，存在则挂载 `req._id`、`req.isPass = true`。

> ⚠️ **密钥切换说明**：JWT 密钥拆分后，此前签发的 token 全部失效，客户端需要重新登录获取新 token。

### 安全说明（密码传输）

- 密码在客户端用 RSA 公钥加密（PKCS#1 v1.5，`encryptionScheme: 'pkcs1'`），密文随请求体传输。
- 公钥由 `GET /keys` 提供，与服务端 `auth/public.cer` 一致，客户端应从该接口获取。
- **已知风险**：PKCS#1 v1.5 加密存在 Bleichenbacher 类填充预言机风险，服务端会解密客户端提交的密文。推荐改为 OAEP（`pkcs1_oaep`）。
- **改造需要前后端同时进行**：前端加密方式、服务端 `encryptionScheme`、以及数据库中已存储的密码密文都需要迁移，不能只改服务端。本项目目前未改造，待前端配合后再做。

### 免鉴权白名单

| 方法 | 路径 |
| --- | --- |
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
- [其他接口 (获取公钥 校验登录态 用户模块 文件上传)](./other/index.md)
