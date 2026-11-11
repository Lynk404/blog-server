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
