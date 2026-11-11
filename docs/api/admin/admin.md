# 登录 / 注册接口

> 密码需先用 `GET /keys` 返回的 RSA 公钥加密（PKCS#1 v1.5）。加密方式的已知风险与改造条件见 [接口总览 - 安全说明](../README.md#安全说明密码传输)。
> 返回的 `token` 为 JWT（RS256，JWT 专用密钥签发），有效期 3 天。JWT 密钥拆分前签发的 token 已全部失效，需重新登录。

## 1. 登录
**POST** `/admin/login`

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
    "userId": "5fddfce41140ac3418062094"
  }
}
```

## 2. 注册
**POST** `/admin/register`

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