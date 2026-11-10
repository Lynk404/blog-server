# 专栏资源 (Columns)

> 基础路径：`/api/rest/columns`

## 字段说明 (Body)
| 字段 | 类型 | 必填 | 说明 |
| `name` | String | 是 | 专栏名称（唯一） |
| `uid` | String | 否 | **禁止前端传值**，后台自动注入当前用户 ID |

## 特殊规则
1. **更新限制**：`PUT /api/rest/columns/:id` 只能修改 `name`，且必须是专栏创建者本人操作。
2. **关联查询**：获取专栏详情时，后台自动 populate 该专栏下的所有文章列表(`aids`)。