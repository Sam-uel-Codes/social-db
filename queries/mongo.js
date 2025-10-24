import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const { MONGODB_URI, MONGODB_DB } = process.env;

function log(title, data, limit = 5) {
  console.log('\n=== ' + title + ' ===');
  console.log(JSON.stringify(Array.isArray(data) ? data.slice(0, limit) : data, null, 2));
}

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);
  const users = db.collection('users');
  const posts = db.collection('posts');
  const comments = db.collection('comments');
  const likes = db.collection('likes');

  const me = await users.findOne({}, { sort: { createdAt: -1 } });
  log('Picked user', { handle: me.handle, _id: String(me._id) });

  // 1) User by handle
  const userByHandle = await users.findOne({ handle: me.handle });
  log('User by handle', userByHandle);

  // 2) Latest 10 posts by user
  const latestPosts = await posts.find({ authorId: me._id }).sort({ createdAt: -1 }).limit(10).toArray();
  log('Latest 10 posts by user', latestPosts);

  // 3) Comments for first post
  if (latestPosts.length) {
    const cmts = await comments.find({ postId: latestPosts[0]._id }).sort({ createdAt: -1 }).limit(5).toArray();
    log('Latest 5 comments for first post', cmts);
  }

  // 4) Count likes on first post
  if (latestPosts.length) {
    const likeCount = await likes.countDocuments({ postId: latestPosts[0]._id });
    log('Like count for first post', { postId: String(latestPosts[0]._id), likeCount });
  }

  // 5) Trending hashtags (last 6 hours)
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const trending = await posts.aggregate([
    { $match: { createdAt: { $gte: sixHoursAgo } } },
    { $unwind: "$hashtags" },
    { $group: { _id: "$hashtags", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]).toArray();
  log('Trending hashtags (6h)', trending);

  // 6) Engagement per post for user (likes + comments)
  const engagement = await posts.aggregate([
    { $match: { authorId: me._id } },
    { $lookup: { from: 'likes', localField: '_id', foreignField: 'postId', as: 'likes' } },
    { $lookup: { from: 'comments', localField: '_id', foreignField: 'postId', as: 'comments' } },
    { $project: { _id: 1, createdAt: 1, likes: { $size: "$likes" }, comments: { $size: "$comments" } } },
    { $sort: { createdAt: -1 } },
    { $limit: 10 }
  ]).toArray();
  log('Engagement per post (likes+comments)', engagement);

  await client.close();
})();
