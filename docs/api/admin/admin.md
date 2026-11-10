# 登录 / 注册接口

## 1. 登录
**POST** `/admin/login`

**请求体**
| 字段 | 类型 | 必填 | 说明 |
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