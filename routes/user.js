const express = require('express')
const router = express.Router()
const User = require('../models/User')
const Article = require('../models/Article')
const Column = require('../models/Column')
const assert = require('http-assert')
const qs = require('qs')
const Comment = require('../models/Comment')
const { decrypt } = require('../core/util/util')
const POP_PUT_MAP = require('../plugins/POP_PUT_MAP')

//修改当前用户资料：只允许白名单字段；修改密码必须提供旧密码
router.put('/', async (req, res, next) => {
  let putData = req.body
  let isPass = req.isPass //鉴权结果
  let userId = req._id //userID

  try {
    assert(isPass, 400, "无权修改")
    let updateData = Object.fromEntries(
      Object.entries(putData).filter(([key]) => POP_PUT_MAP.User.revisable.includes(key))
    )
    assert(Object.keys(updateData).length !== 0, 400, '修改失败')

    if ('password' in updateData) {
      let { oldPassword } = putData
      assert(oldPassword, 422, '请提供旧密码')
      let user = await User.findById(userId).select('+password')
      assert(user, 422, '用户不存在')
      //与登录校验逻辑一致：decrypt(客户端密文) 与 decrypt(decrypt(存储值)) 比较
      let isMatch = false
      try {
        isMatch = decrypt(oldPassword) === decrypt(decrypt(user.password))
      } catch (err) {
        isMatch = false
      }
      assert(isMatch, 422, '旧密码错误')
      // 记录修改时间，使此前签发的 token 失效
      updateData.pwdChangedAt = Math.floor(Date.now() / 1000)
    }

    await User.findByIdAndUpdate(userId, updateData, { runValidators: true, new: true })
    res.status(200).send({
      message: '修改成功'
    })
  } catch (err) {
    next(err)
  }
})

//查询资源详情
router.get('/', async (req, res, next) => {
  let _id = req._id
  try {
    // 账号已注销或 token 已因改密码失效时，isPass 为 false，不能继续读取用户
    assert(req.isPass, 401, '请先登录')
    let userResult = await User.findById(_id)
    let articleCount = await Article.countDocuments({ author: _id })
    let columnCount = await Column.countDocuments({ uid: _id })
    userResult = userResult.toJSON()
    userResult.articleCount = articleCount
    userResult.columnCount = columnCount
    res.status(200).send({
      message: '查询成功',
      data: userResult
    })
  } catch (err) {
    next(err)
  }
})

//注销当前用户：需提供当前密码确认，级联规则见 docs/api/other/other.md
router.delete('/', async (req, res, next) => {
  try {
    assert(req.isPass, 400, '无权操作')
    let { password } = req.body
    assert(password, 422, '请提供密码')
    let user = await User.findById(req._id).select('+password')
    assert(user, 422, '用户不存在')
    let isMatch = false
    try {
      isMatch = decrypt(password) === decrypt(decrypt(user.password))
    } catch (err) {
      isMatch = false
    }
    assert(isMatch, 422, '密码错误')
    await deleteAccount(req._id)
    res.status(200).send({
      message: '注销成功'
    })
  } catch (err) {
    next(err)
  }
})

//注销的级联规则：
// 1. 用户名下的专栏，及专栏中的所有文章（包括他人的文章）一并删除
// 2. 用户作为作者的文章一并删除
// 3. 待删文章下的所有评论一并删除（包括他人的评论）
// 4. 用户发表的评论删除；若所属文章仍保留，同步从其 comments 移除并使 comment_num 减 1
// 5. 删除的文章从所有专栏的 aids 中移除
// 先删内容，最后删用户：中途失败时用户仍存在，可以重试
async function deleteAccount (userId) {
  let columns = await Column.find({ uid: userId }, '_id')
  let columnIds = columns.map(c => c._id)

  let ownArticles = await Article.find({ $or: [{ author: userId }, { column: { $in: columnIds } }] }, '_id')
  let articleIds = ownArticles.map(a => a._id)
  let isDoomedArticle = id => articleIds.some(a => String(a) === String(id))

  let doomedComments = await Comment.find({ $or: [{ aid: { $in: articleIds } }, { uid: userId }] }, '_id aid')

  // 仍会保留的文章：移除这些评论的引用并修正计数
  let pullsByArticle = {}
  for (let c of doomedComments) {
    if (!c.aid || isDoomedArticle(c.aid)) continue
    let key = String(c.aid)
    pullsByArticle[key] = pullsByArticle[key] || { aid: c.aid, ids: [] }
    pullsByArticle[key].ids.push(c._id)
  }
  for (let { aid, ids } of Object.values(pullsByArticle)) {
    await Article.updateOne({ _id: aid }, { $pull: { comments: { $in: ids } }, $inc: { comment_num: -ids.length } })
  }

  await Comment.deleteMany({ _id: { $in: doomedComments.map(c => c._id) } })
  await Article.deleteMany({ _id: { $in: articleIds } })
  await Column.updateMany({ aids: { $in: articleIds } }, { $pull: { aids: { $in: articleIds } } })
  await Column.deleteMany({ _id: { $in: columnIds } })
  await User.findByIdAndDelete(userId)
}


module.exports = router

