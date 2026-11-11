const express = require('express')
const router = express.Router()
const User = require('../models/User')
const Article = require('../models/Article')
const Column = require('../models/Column')
const assert = require('http-assert')
const qs = require('qs')
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
    }

    await User.findByIdAndUpdate(userId, updateData, { runValidators: true, new: true })
    res.send(200, {
      message: '修改成功'
    })
  } catch (err) {
    next(err)
  }
})

//查询资源详情
router.get('/', async (req, res, next) => {
  let _id = req._id
  console.log(_id)
  try {
    let userResult = await User.findById(_id)
    let articleCount = await Article.find({ author: _id }).count()
    let columnCount = await Column.find({ uid: _id }).count()
    userResult = userResult.toJSON()
    userResult.articleCount = articleCount
    userResult.columnCount = columnCount
    console.log(userResult)
    res.send(200, {
      message: '查询成功',
      data: userResult
    })
  } catch (err) {
    console.log(err)
    next(err)
  }
})


module.exports = router

