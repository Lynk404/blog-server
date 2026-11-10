# 数据库设计说明文档

本项目使用 MongoDB 作为持久化数据库，通过 Mongoose 进行对象建模。以下为各个集合（Collection）的详细字段说明及关联关系。

## 🗺️ 实体关系图 (ER 映射)

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

## 📊 集合详情说明

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
     - 新增/删除评论时，需同步更新 `Article.comment_num` 字段。
     - 删除文章时，需使用 `$pull` 更新 `Column.aids` 数组，并级联删除相关 `Comment`。

3. **内容编码处理**
   - `Article.content` 带有 `decodeURIComponent` 处理，前端富文本提交时务必先调用 `encodeURIComponent`。
