# 其他接口

## 获取公钥
**GET** `/keys` （免鉴权）
返回当前 RSA 公钥，前端用于加密密码。
- 响应：RSA 公钥字符串
```json
{ "code": 200, "message": "ok", "data": { "publicKey": "-----BEGIN PUBLIC KEY-----..." } }
```

## 校验登录态
**GET** `/index` （需鉴权）
- 响应：
- 已登录：`{ "code": 200, "message": "ok" }`
- 未登录：`{ "code": 401, "message": "请先登录" }`

## 用户模块 (`/user/*`)
| 方法 | 路径 | 说明 |
| GET | `/user/info` | 获取当前登录用户信息 |
| PUT | `/user/info` | 更新用户信息（等同 `PUT /api/rest/users/:id`） |
| DELETE | `/user/info` | 注销 / 删除账号 |

## 文件上传
**POST** `/upload` （需鉴权）
**Content-Type**：`multipart/form-data`
| 字段 | 类型 | 必填 | 说明 |
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
