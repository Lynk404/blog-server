const mongoose = require('mongoose')
//'mongodb://127.0.0.1:27017/blog'
console.log('mongodb://127.0.0.1:27017/db_blog连接中...')
// mongoose 9 / driver 7 已移除 useNewUrlParser、useUnifiedTopology（现为默认行为），传入会报错
mongoose.connect('mongodb://127.0.0.1:27017/db_blog')
let db = mongoose.connection
db.on('error', function (err) {
  console.log(err)
})
db.on('open', function (err) {
  console.dir('mongodb://127.0.0.1:27017/blog is open')
})

module.exports = {
  mongoose
}