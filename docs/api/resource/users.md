# 用户资源 (Users)

> 基础路径：`/api/rest/users`
> 注意：注册请走 `/admin/register`，此接口主要用于后台管理端的用户资源 CRUD。

## 特殊规则
1. **更新限制**：`PUT /api/rest/users/:id` 只能修改 `password`、`email`、`nikname`，且只能修改自己的信息。
2. **安全限制**：`password` 必须是通过 RSA 公钥加密后的密文。