const mongoose = require('mongoose')
const debug = require('debug')('blog:db')
// mongoose 9 / driver 7 已移除 useNewUrlParser、useUnifiedTopology（现为默认行为），传入会报错
mongoose.connect('mongodb://127.0.0.1:27017/db_blog')
let db = mongoose.connection
db.on('error', function (err) {
  debug('连接失败: %O', err)
})
db.on('open', function (err) {
  debug('mongodb://127.0.0.1:27017/db_blog 已连接')
})

module.exports = {
  mongoose
}