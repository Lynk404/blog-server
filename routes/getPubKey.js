const express = require('express');
const router = express.Router();
const Key = require('../models/Key');
const assert = require('http-assert');

/*GET /keys */
router.get('/', async function (req, res, next) {
  try {
    let result = await Key.findOne()
    // Key 集合为空时不再挂起，返回明确的 404
    assert(result, 404, '公钥未初始化')
    res.status(200).send({
      message: 'ok',
      data: {
        pubKey: result.content
      }
    })
  } catch (err) {
    next(err)
  }
});

module.exports = router;
