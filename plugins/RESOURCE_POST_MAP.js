// 每个模型创建时允许客户端提交的字段白名单。
// 未列出的字段（hit_num、like_num、comments、aids、date 等）一律忽略，
// 所有者字段 author/uid 由服务端从 token 注入。
function pick (body, keys) {
  return Object.fromEntries(Object.entries(body || {}).filter(([key]) => keys.includes(key)))
}

const ARTICLE_FIELDS = ['title', 'cover', 'content', 'column']
const COLUMN_FIELDS = ['name']
const COMMENT_FIELDS = ['content', 'aid']

module.exports = {
  "Article": {
    "creatable": ARTICLE_FIELDS,
    "body": function (body, _id) {
      return {
        ...pick(body, ARTICLE_FIELDS),
        author: _id
      }
    }
  },
  "Column": {
    "creatable": COLUMN_FIELDS,
    "body": function (body, _id) {
      return {
        ...pick(body, COLUMN_FIELDS),
        uid: _id
      }
    }
  },
  "Comment": {
    "creatable": COMMENT_FIELDS,
    "body": function (body, _id) {
      return {
        ...pick(body, COMMENT_FIELDS),
        uid: _id
      }
    }
  }
}
