const express = require('express');
const router = express.Router();
const { decrypt, encrypt } = require('../core/util/util')
const { sendToken } = require('../core/sendToken')
const User = require('../models/User');
const assert = require('http-assert');
const createError = require('http-errors')
const QUE_MAP = require('../plugins/QUE_MAP')

const CLASSIFY = {
  'login': "login",
  'register': "register"
}

router.post('/:classify', async (req, res, next) => {

  let { username, password } = req.body
  let { classify } = req.params

  // 只认自有属性，避免 constructor 等原型链属性命中
  let isClassPass = Object.prototype.hasOwnProperty.call(CLASSIFY, classify)
  assert(isClassPass, 400, '无效的请求')
  let user
  // +password 设置追加返回password内容 password Schema设置select为false时使用
  try {
    if (!username || username?.trim()?.length === 0 || !password || password?.trim()?.length === 0) {
      assert(false, 422, "账号密码必填") 
    }
    if (classify === 'login') {
      user = await User.findOne({ username }).select('+password')
      assert(user, 422, "用户不存在")
      //校验密码
      //密文格式非法（解密抛错）与密码不一致一样处理为 422
      let isMatch = false
      try {
        isMatch = decrypt(password) === decrypt(decrypt(user.password))
      } catch (err) {
        isMatch = false
      }
      assert(isMatch, 422, '账号密码错误')
    }
    if (classify === 'register') {
      // 只接受白名单字段，避免客户端指定 _id、signature 等
      const { nikname, avatar, email } = req.body
      user = await User.create({ username, password, email, nikname, avatar })
    }

    //生成token
    let token = await sendToken(user)
    res.status(200).send({
      message: '登录成功',
      data: {
        userId: user._id,
        token: token
      }
    })
  } catch (err) {
    next(err)
  }
});



module.exports = router;






// /* POST register listing. */
// router.post('/', async function (req, res, next) {

//   let { username, password } = req.body
//   // +password 设置追加返回password内容 password Schema设置select为false时使用
//   try {
//     if (!username || username?.trim()?.length === 0 || !password || password?.trim()?.length === 0) {
//       assert(false, 422, "账号密码必填")
//     }
//     const user = await User.create(req.body)

//     //生成token
//     let token = await sendToken(user)
//     res.send(200, {
//       message: '注册成功',
//       data: {
//         userId: user._id,
//         token: token
//       }
//     })
//   } catch (err) {
//     if (err.message.indexOf('duplicate key error') !== -1) {
//       let repeatKey = Object.entries(err.keyPattern)?.map(([key, value]) => {
//         return `${QUE_MAP?.[key]}不能重复`
//       })[0]
//       next(createError(422, repeatKey))
//     }
//     let paramErrors = Object.entries(err.errors).map(([key, val]) => {
//       return `${val.message}`
//     }).join(',')
//     next(createError(422, paramErrors))
//   }
// });

// module.exports = router;

