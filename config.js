const path = require("path")
module.exports = {
  host: '127.0.0.1',
  root: process.cwd(),
  port: 3000,
  keyPath: path.join(process.cwd(), '/auth'),
  pubKeyPath: path.join(process.cwd(), '/auth/public.cer'),
  priKeyPath: path.join(process.cwd(), '/auth/private.cer'),
  // JWT 专用 2048 位密钥对，与密码加密密钥（上面两项）分离
  jwtPubKeyPath: path.join(process.cwd(), '/auth/jwt-public.pem'),
  jwtPriKeyPath: path.join(process.cwd(), '/auth/jwt-private.pem'),
  uploadPath: path.join(process.cwd(), '/uploads'),
  uploadURL: 'http://127.0.0.1:3000/',
  maxFileSize: 102400
}