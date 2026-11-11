const express = require('express');
const router = express.Router();
const assert = require('http-assert')
const Article = require('../models/Article')

/*post 文章点赞 */
router.post('/:id', async (req, res, next) => {
  let id = req.params.id
  try {
    let result = await Article.findByIdAndUpdate(id, {
      $inc: {
        like_num: 1
      }
    }, { new: true })
    // 文章不存在时直接返回 404，避免下面读 null 抛 TypeError
    assert(result, 404, '文章不存在')
    res.status(200).send({
      message: '点赞成功',
      data: {
        likes: result.like_num
      }
    })
  } catch (err) {
    next(err)
  }

});

module.exports = router;
