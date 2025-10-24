import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import neo4j from 'neo4j-driver';

const { MONGODB_URI, MONGODB_DB, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = process.env;
const HOURS = 24;

async function getFolloweesByHandle(handle) {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();
  const res = await session.run(
    `MATCH (me:User {handle: $handle})-[:FOLLOWS]->(u:User) RETURN u.mongoId AS mongoId`,
    { handle }
  );
  await session.close();
  await driver.close();
  return res.records.map(r => r.get('mongoId'));
}

function score(recencyMinutes, likes) {
  return 0.7 * Math.exp(-recencyMinutes / 720) + 0.3 * Math.log1p(likes);
}

(async () => {
  const handle = process.argv[2];
  if (!handle) {
    console.error('Usage: npm run q:feed -- <handle>');
    process.exit(1);
  }

  const followeeMongoIds = await getFolloweesByHandle(handle);
  if (followeeMongoIds.length === 0) {
    console.log('No followees found for handle:', handle);
    process.exit(0);
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);
  const posts = db.collection('posts');
  const likes = db.collection('likes');
  const users = db.collection('users');

  const since = new Date(Date.now() - HOURS * 60 * 60 * 1000);
  const authorIds = followeeMongoIds.map(id => new ObjectId(id));

  const rawPosts = await posts.find({
    authorId: { $in: authorIds },
    createdAt: { $gte: since }
  }).sort({ createdAt: -1 }).limit(200).toArray();

  const postIds = rawPosts.map(p => p._id);
  const likeAgg = await likes.aggregate([
    { $match: { postId: { $in: postIds } } },
    { $group: { _id: "$postId", count: { $sum: 1 } } }
  ]).toArray();
  const likeMap = new Map(likeAgg.map(x => [String(x._id), x.count]));

  const now = Date.now();
  const enriched = rawPosts.map(p => {
    const likeCount = likeMap.get(String(p._id)) || 0;
    const mins = (now - p.createdAt.getTime()) / 60000;
    return { ...p, likeCount, _score: score(mins, likeCount) };
  }).sort((a, b) => b._score - a._score).slice(0, 30);

  const authors = await users.find({ _id: { $in: enriched.map(e => e.authorId) } }).toArray();
  const byId = new Map(authors.map(a => [String(a._id), a]));
  const printable = enriched.map(e => ({
    author: byId.get(String(e.authorId))?.handle,
    text: e.text,
    likeCount: e.likeCount,
    createdAt: e.createdAt,
    score: +e._score.toFixed(4),
    hashtags: e.hashtags
  }));

  console.log(JSON.stringify(printable, null, 2));
  await client.close();
})();
