const path = require("path")

// 应用侧部署配置集中在本文件。生产环境可通过同名环境变量覆盖，但默认值应在这里维护。
const port = process.env.PORT || 3000
// 四把密钥统一放在 keyPath 下；只改这一项即可整体移动密钥目录
const keyPath = process.env.KEY_PATH || path.join(process.cwd(), '/auth')

module.exports = {
  // 监听所有网卡，保持本地与 Docker 的默认行为；只经 Nginx 暴露时可改为 127.0.0.1
  host: process.env.HOST || '0.0.0.0',
  root: process.cwd(),
  port,
  keyPath,
  pubKeyPath: path.join(keyPath, 'public.cer'),
  priKeyPath: path.join(keyPath, 'private.cer'),
  // JWT 专用 2048 位密钥对，与密码加密密钥（上面两项）分离
  jwtPubKeyPath: path.join(keyPath, 'jwt-public.pem'),
  jwtPriKeyPath: path.join(keyPath, 'jwt-private.pem'),
  // 数据库地址；运维脚本和回归脚本也读取这里
  dbURL: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/db_blog',
  // 上传目录；部署时可改成发布目录之外的持久路径
  uploadPath: process.env.UPLOAD_PATH || path.join(process.cwd(), '/uploads'),
  // 图片对外根地址：上线必须改成公网 HTTPS 域名，例如 https://forum.example.com/
  uploadURL: process.env.PUBLIC_URL || `http://127.0.0.1:${port}/`,
  // 旧图片地址，仅供 scripts/update-image-urls.js 迁移历史数据使用
  legacyUploadURL: process.env.LEGACY_UPLOAD_URL || 'http://127.0.0.1:3000/',
  // CORS 来源：开发保持 true（反射任意来源）；上线建议改成 ['https://forum.example.com']
  corsOrigins: true,
  maxFileSize: 2 * 1024 * 1024
}
