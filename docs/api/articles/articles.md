# 文章扩展接口

## 1. 搜索文章
**GET** `/articles/search` （免鉴权）
**Query 参数**
| 参数 | 说明 |
| `q` / `keyword` | 搜索关键字（具体字段以实现为准） |
| `page` / `size` | 分页 |
**响应**：分页列表

## 2. 点赞文章
**POST** `/articles/likes` （免鉴权）
**请求体**
| 字段 | 类型 | 说明 |
| `aid` | string | 文章 ID |
| `uid` | string | 用户 ID（若接口按登录态取 `req._id` 则无需传） |
**响应**
```json
{ "code": 200, "message": "ok" }
```
- 效果：对应文章的 `like_num + 1`