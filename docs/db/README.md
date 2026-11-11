# 数据库设计说明文档

使用 MongoDB 作为持久化数据库，通过 Mongoose 进行对象建模。以下为各个集合（Collection）的详细字段说明及关联关系。
> 数据库：**MongoDB**　ODM：**Mongoose 5**
> 共 5 个集合：`User`、`Column`、`Article`、`Comment`、`Key`。

## 实体关系图 (ER 映射)

```test
[USER] (用户)
   │
   ├── (1对多) ──> [ARTICLE] (文章)
   │                  │(1对
   │                  │  多)
   ├── (1对多) ──> [COMMENT] (评论)
   │                  │
   └── (1对多) ──> [COLUMN] (专栏)
                      │
                      └── (1对多) ──> [ARTICLE] (文章)
```

---

## 集合详情说明

### 1. User (用户表)
用于存储系统用户及鉴权信息。

| 字段名 | 类型 | 必填 | 唯一 | 默认值 / 说明 |
| :--- | :--- | :---: | :---: | :--- |
| `username` | String | 是 | 是 | 用户名（6-8位字母+数字） |
| `password` | String | 是 | 否 | 密码（不参与默认查询 `select: false`，含 RSA 解密校验逻辑） |
| `email` | String | 是 | 是 | 邮箱地址 |
| `avatar` | String | 否 | 否 | 头像 URL |
| `nikname` | String | 否 | 否 | 昵称 |
| `signature` | String | 否 | 否 | 个性签名 |

### 2. Column (专栏/分类表)
文章的分类目录。

| 字段名 | 类型 | 必填 | 唯一 | 默认值 / 说明 |
| :--- | :--- | :---: | :---: | :--- |
| `name` | String | 是 | 是 | 专栏名称 |
| `date` | Date | 否 | 否 | 创建时间 |
| `aids` | Array\<ObjectId\> | 否 | 否 | **[外键]** 关联 `Article`，存储文章 ID 列表 |
| `uid` | ObjectId | 否 | 否 | **[外键]** 关联 `User`，专栏创建者 |

### 3. Article (文章表)
博客的核心内容。

| 字段名 | 类型 | 必填 | 默认值 / 说明 |
| :--- | :--- | :---: | :--- |
| `title` | String | 是 | 文章标题 |
| `cover` | String | 否 | 封面图 URL |
| `content` | String | 是 | 文章 HTML 内容（接收前端 URI 编码后解码） |
| `date` | Date | 否 | 发布时间 |
| `hit_num` | Number | 否 | 点击量（默认 0） |
| `comment_num` | Number | 否 | 评论数量（默认 0，冗余字段便于列表展示） |
| `like_num` | Number | 否 | 点赞数（默认 0） |
| `author` | ObjectId | 是 | **[外键]** 关联 `User`，文章作者 |
| `comments` | Array\<ObjectId\> | 否 | **[外键]** 关联 `Comment`，文章下的评论 ID 列表 |
| `column` | ObjectId | 是 | **[外键]** 关联 `Column`，所属专栏 |

### 4. Comment (评论表)
用户对文章的评论。

| 字段名 | 类型 | 必填 | 默认值 / 说明 |
| :--- | :--- | :---: | :--- |
| `content` | String | 是 | 评论内容 |
| `date` | Date | 否 | 评论时间 |
| `uid` | ObjectId | 否 | **[外键]** 关联 `User`，评论者 ID |
| `aid` | ObjectId | 否 | **[外键]** 关联 `Article`，被评论的文章 ID |

### 5. Key (系统密钥表)
用于存储系统级的 RSA 密钥，供前端获取公钥加密敏感数据。

| 字段名 | 类型 | 必填 | 默认值 / 说明 |
| :--- | :--- | :---: | :--- |
| `content` | String | 是 | RSA 公钥字符串 |
| `date` | Date | 否 | 生成时间 |

---

## 关系汇总

| 关系 | 实现字段 | 说明 |
| --- | --- | --- |
| User → Article | `Article.author` | 一个用户多篇文章 |
| User → Comment | `Comment.uid` | 一个用户多条评论 |
| User → Column | `Column.uid` | 一个用户多个专栏 |
| Column → Article | `Article.column` / `Column.aids` | 双向引用 |
| Article → Comment | `Comment.aid` / `Article.comments` | 双向引用 |

---

## 索引与约束

| 集合 | 唯一键 | 说明 |
| --- | --- | --- |
| User | `username` | 用户名唯一，重复插入报 `duplicate key error` |
| User | `email` | 邮箱唯一 |
| Column | `name` | 专栏名唯一 |

> 上述唯一约束由 `app.js` 的全局错误处理器捕获 `duplicate key error`，转换为 `422` + `xxx不能重复` 返回。

---

## 数据一致性说明

- 创建 **Comment** 时同步向 `Article.comments` push ID，并 `comment_num + 1`。
- 创建 **Article** 时同步向 `Column.aids` push ID。
- 访问 **Article** 详情时 `hit_num + 1`。
- 删除 **Comment** 时从 `Article.comments` `$pull` 该 ID，并 `comment_num - 1`。
- 删除 **Article** 时从 `Column.aids` `$pull` 该 ID。
- 注销 **User**（`DELETE /user`）时的级联删除，规则见 [其他接口 - 注销账号](../api/other/other.md)：删除其专栏及专栏中的文章、其作为作者的文章、待删文章下的所有评论、其本人发表的评论，并修正保留文章的 `comments` 与 `comment_num`。
- 更新资源时自动刷新 `date` 字段。

---

## 🔗 数据关联与业务逻辑说明

### 双向关联设计
为提升不同维度的查询效率，采用了双向关联（反范式设计）：
- **专栏 ↔ 文章**：`Column.aids` (一对多) 与 `Article.column` (多对一) 相互映射。
- **文章 ↔ 评论**：`Article.comments` (一对多) 与 `Comment.aid` (多对一) 相互映射。

### ⚠️ 开发注意事项 (必读)

1. **密码安全性**
   - 用户密码在数据库中是以**密文**形式存在的。
   - 前端发送明文密码前需使用 RSA 公钥加密。
   - 后端 `User` 模型中的 `set` 拦截器会使用私钥解密验证格式，再次加密后存库。**切勿在日志中打印明文密码**。

2. **数据一致性维护**
   - 由于计数器和双向关联的存在，在编写删除或更新接口时：
     - 新增/删除评论时，需同步更新 `Article.comment_num` 字段（已实现）。
     - 删除文章时，需使用 `$pull` 更新 `Column.aids` 数组（已实现）。相关 `Comment` 的级联删除**尚未实现**，目前会留下孤立评论。

3. **内容编码处理**
   - `Article.content` 带有 `decodeURIComponent` 处理，前端富文本提交时务必先调用 `encodeURIComponent`。