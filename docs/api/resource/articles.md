# 文章资源 (Articles)

> 基础路径：`/api/rest/articles`

## 字段说明 (Body)
| 字段 | 类型 | 必填 | 说明 
| `title` | String | 是 | 文章标题 |
| `cover` | String | 否 | 封面图 URL |
| `content` | String | 是 | 正文内容（富文本） |
| `column` | String | **是** | 所属专栏 ID（后台会联动更新专栏的 `aids`） |
| `author` | String | 否 | **禁止前端传值**，后台自动从 Token 注入当前用户 ID |

## 特殊规则
1. **阅读量自增**：每次调用 `GET /api/rest/articles/:id` 获取详情时，后台自动让 `hit_num` 阅读量 +1。
2. **更新限制**：`PUT /api/rest/articles/:id` 只能修改 `title`、`cover`、`content`，且必须是文章作者本人操作。
3. **关联查询**：获取详情或列表时，后台自动 populate 作者信息(`author`)、专栏信息(`column`)及评论列表(`comments`)。