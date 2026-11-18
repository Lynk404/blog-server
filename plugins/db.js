const mongoose = require('mongoose')
const debug = require('debug')('blog:db')
const { dbURL } = require('../config')
// mongoose 9 / driver 7 已移除 useNewUrlParser、useUnifiedTopology（现为默认行为），传入会报错
// 首次连接失败时直接退出：否则服务会在没有数据库的情况下启动，请求只会挂起或返回模糊错误
mongoose.connect(dbURL).catch(err => {
  console.error('MongoDB 连接失败，服务退出：', err.message)
  process.exit(1)
})
let db = mongoose.connection
db.on('error', function (err) {
  debug('连接失败: %O', err)
})
db.on('open', function (err) {
  debug(`${dbURL} 已连接`)
})

module.exports = {
  mongoose
}