const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const debug = require('debug')('blog:app')
const cors = require('cors')
const mongoose = require('./plugins/db') // 连接db
const assert = require('http-assert')
const User = require('./models/User')
const { maxFileSize } = require('./config')
const { expressjwt: expressJwt } = require('express-jwt')
const { getJwtPublicKeySync } = require('./core/rsaControl')

const app = express();
// Express 5 默认使用 Node 原生 querystring，这里保持 qs 的嵌套解析（如 query[q]=...）
app.set('query parser', 'extended');

app.use(cors({
  "origin": true, //true 设置为 req.origin.url
  "methods": "GET,HEAD,PUT,PATCH,POST,DELETE", //容许跨域的请求方式
  "allowedHeaders": "x-requested-with,Authorization,token, content-type", //跨域请求头
  "preflightContinue": false, // 是否通过next() 传递options请求 给后续中间件 
  "maxAge": 1728000, //options预验结果缓存时间 20天
  "credentials": true, //携带cookie跨域
  "optionsSuccessStatus": 200 //options 请求返回状态码
}))

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Express 5 在无请求体时 req.body 为 undefined，Express 4 为 {}；统一为 {} 以保持原行为
app.use((req, res, next) => {
  req.body = req.body || {}
  next()
});
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'uploads')));
//中间件  nameMiddleware
const resourceMiddleware = require('./middleware/resource')

//路由  nameRoute
const busRoute = require('./routes/bus');
const adminRoute = require('./routes/admin');
const pubKeyRoute = require('./routes/getPubKey')
const uploadRoute = require('./routes/upload')
const searchRoute = require('./routes/search')
const artLikesRoute = require('./routes/artLikes');
const userRoute = require('./routes/user')

app.use(expressJwt({
  secret: getJwtPublicKeySync(), //JWT 验签公钥（JWT 专用，与密码密钥分离）
  algorithms: ["RS256"], //6.0.0以上版本必须设置解密算法
  // v8 语义：返回 true 才会拒绝请求。这里从不拒绝，只挂载 isPass，由各处理器自行判断
  // 数据库查询出错时直接抛出，交给全局错误处理器（500）
  isRevoked: async (req, token) => {
    let { _id } = token.payload
    req._id = _id
    req.isPass = true
    let result = await User.findById(_id).select('+pwdChangedAt')
    if (!result) {
      req.isPass = false
    } else if (result.pwdChangedAt && token.payload.iat < result.pwdChangedAt) {
      // 修改密码后，签发于修改时间之前的 token 失效。iat 精度为秒，同一秒内签发的旧 token 有残留窗口，
      // 但改密码后紧接着重新登录不会被误伤
      req.isPass = false
    }
    return false
  }
}).unless({
  path: [
    { url: /\/api\/rest/, methods: ['GET'] },
    { url: '/api/rest/keys', methods: ['GET'] },
    { url: '/admin/login' },
    { url: '/admin/register' },
    { url: '/keys' },
    { url: /^\/articles\/search$/, methods: ['GET'] },
    { url: /^\/articles\/likes\/[^/]+$/, methods: ['POST'] },
  ]
}))

app.use((req, res, next) => {
  next()
});

//资源路由
app.use('/api/rest/:resource', resourceMiddleware(), busRoute)

//登录注册
app.use('/admin', adminRoute)

//用户信息
app.use('/user', userRoute)

app.use('/index', (req, res, next) => {
  if (req.isPass) {
    res.status(200).send({
      message: 'ok'
    })
  } else {
    res.status(401).send({
      message: '请先登录'
    })
  }

})

//获取公钥
app.use('/keys', pubKeyRoute)

//文件上传
app.use('/upload', uploadRoute)

//文章搜索
app.use('/articles/search', searchRoute)

//文章点赞
app.use('/articles/likes', artLikesRoute)






// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});


const ERROR_CODE_MAP = {
  'LIMIT_FILE_SIZE': `文件大小不得超过 ${maxFileSize} bytes`,

}
const ERROR_STATUS_MAP = {
  '401': "无权限操作,请先登录"
}

const QUE_MAP = {
  "username": "用户名",
  "password": "密码",
  "email": "邮箱",
  "nikname": "昵称",
  "avatar": "头像"
}

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  // res.locals.message = err.message;
  // res.locals.error = req.app.get('env') === 'development' ? err : {};
  // render the error page
  debug('err: %O', err)
  // err.message 可能为 undefined（如客户端主动中断），先兜底再判断
  if (String(err.message || '').indexOf('duplicate key error') !== -1) {
    let repeatKey = Object.entries(err.keyPattern)?.map(([key, value]) => {
      return `${QUE_MAP?.[key]}不能重复`
    })[0]
    err.status = 422
    err.message = repeatKey
  }

  if (err.errors) {
    let paramErrors = Object.entries(err.errors).map(([key, val]) => {
      return `${val.message}`
    }).join(',')
    err.status = 422
    err.message = paramErrors
  }

  if (err.code in ERROR_CODE_MAP) {
    err.status = 422
    err.message = ERROR_CODE_MAP[err.code]
  }

  if (err.status in ERROR_STATUS_MAP) {
    err.message = ERROR_STATUS_MAP[err.status]
  }

  res.status(err.status || 500).send({
    code: err.status,
    message: err.message
  });
  // res.render('error');
});


module.exports = app;
