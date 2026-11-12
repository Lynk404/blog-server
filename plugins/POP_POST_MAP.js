const User = require('../models/User')
const Article = require('../models/Article')
const Column = require('../models/Column')
const Comment = require('../models/Comment')
module.exports = {
  "Comment": {
    "_refId": "aid",
    "label": "文章",
    "_model": Article,
    "queryAct": "findByIdAndUpdate",
    "options": function (_id) {
      return {
        "$push": {
          "comments": _id
        },
        "$inc": {
          "comment_num": 1
        }
      }
    }
  },
  "Article": {
    "_refId": "column",
    "label": "专栏",
    "ownerField": "uid",
    "_model": Column,
    "queryAct": "findByIdAndUpdate",
    "options": function (_id) {
      return {
        "$push": {
          "aids": _id
        }
      }
    }
  }
}
