import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import neo4j from "neo4j-driver";
import { faker } from "@faker-js/faker";

const { MONGODB_URI, MONGODB_DB, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } =
  process.env;

// ---- knobs you can tweak ----
const N_USERS = 2000; // total users
const POSTS_PER_USER_MIN = 2;
const POSTS_PER_USER_MAX = 15;
const AVG_FOLLOWS = 40; // average following per user (power-law skew)
const LIKE_RATE = 0.15; // prob. that a random user likes a given post (scaled down)
const COMMENT_RATE = 0.03; // prob. that a random user comments a given post (scaled down)
const HASHTAGS = [
  "tech",
  "news",
  "music",
  "coding",
  "ai",
  "ml",
  "fitness",
  "travel",
  "food",
  "movies",
  "gaming",
  "startups",
  "js",
  "python",
  "java",
  "react",
  "node",
  "rust",
  "go",
];
// --------------------------------

function pickHashtags() {
  const n = Math.floor(Math.random() * 3); // 0..2
  const tags = new Set();
  for (let i = 0; i < n; i++) tags.add(faker.helpers.arrayElement(HASHTAGS));
  return [...tags];
}

// Zipf-ish index to create popularity skew (some users get followed more)
function samplePowerLawIndex(n) {
  const r = Math.random();
  const k = Math.floor(n * Math.pow(r, 2)); // bias to low indices
  return Math.min(Math.max(k, 0), n - 1);
}

async function main() {
  // --- connect to Mongo ---
  const mongo = new MongoClient(MONGODB_URI);
  await mongo.connect();
  const db = mongo.db(MONGODB_DB);
  const usersCol = db.collection("users");
  const postsCol = db.collection("posts");
  const commentsCol = db.collection("comments");
  const likesCol = db.collection("likes");

  console.log("🔗 Connected to MongoDB");

  // 1) reset collections FIRST
  await Promise.all([
    usersCol.deleteMany({}),
    postsCol.deleteMany({}),
    commentsCol.deleteMany({}),
    likesCol.deleteMany({}),
  ]);

  // 2) THEN create indexes
  await usersCol.createIndex(
    { handle: 1 },
    { unique: true, partialFilterExpression: { handle: { $type: "string" } } }
  );
  await usersCol.createIndex({ createdAt: -1 });

  await postsCol.createIndex({ authorId: 1, createdAt: -1 });
  await postsCol.createIndex({ hashtags: 1, createdAt: -1 });

  await commentsCol.createIndex({ postId: 1, createdAt: -1 });

  await likesCol.createIndex({ postId: 1 });
  await likesCol.createIndex({ userId: 1 });
  await likesCol.createIndex({ postId: 1, userId: 1 }, { unique: true });

  // --- generate users ---
  const users = Array.from({ length: N_USERS }, () => {
    const base = faker.internet
      .userName()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    const handle =
      base.length < 3
        ? `${base}${faker.number.int({ min: 10, max: 99 })}`
        : base;
    return {
      _id: new ObjectId(),
      handle,
      name: faker.person.fullName(),
      bio: faker.lorem.sentence(),
      createdAt: faker.date.past({ years: 2 }),
    };
  });

  // fix duplicate/short handles
  const seen = new Set();
  for (let i = 0; i < users.length; i++) {
    let h = users[i].handle;
    let c = 1;
    while (seen.has(h) || h.length < 3) {
      h = `${users[i].handle}${c++}`;
    }
    seen.add(h);
    users[i].handle = h;
  }

  await usersCol.insertMany(users, { ordered: false });
  console.log(`👤 Inserted users: ${users.length}`);

  // --- generate posts ---
  const posts = [];
  for (const u of users) {
    const k = faker.number.int({
      min: POSTS_PER_USER_MIN,
      max: POSTS_PER_USER_MAX,
    });
    for (let i = 0; i < k; i++) {
      posts.push({
        _id: new ObjectId(),
        authorId: u._id,
        text: faker.lorem.sentence({ min: 6, max: 18 }),
        hashtags: pickHashtags(),
        createdAt: faker.date.recent({ days: 45 }),
      });
    }
  }
  if (posts.length) await postsCol.insertMany(posts, { ordered: false });
  console.log(`📝 Inserted posts: ${posts.length}`);

  // --- likes & comments ---
  const likes = [];
  const comments = [];
  for (const p of posts) {
    // iterate over a small random sample of users for speed
    for (
      let i = 0;
      i < users.length;
      i += Math.floor(Math.random() * 25) + 15
    ) {
      if (Math.random() < LIKE_RATE) {
        likes.push({
          _id: new ObjectId(),
          postId: p._id,
          userId: users[i]._id,
          createdAt: faker.date.between({ from: p.createdAt, to: new Date() }),
        });
      }
      if (Math.random() < COMMENT_RATE) {
        comments.push({
          _id: new ObjectId(),
          postId: p._id,
          authorId: users[i]._id,
          text: faker.lorem.sentence({ min: 8, max: 20 }),
          createdAt: faker.date.between({ from: p.createdAt, to: new Date() }),
        });
      }
    }
  }
  if (likes.length) await likesCol.insertMany(likes, { ordered: false });
  if (comments.length)
    await commentsCol.insertMany(comments, { ordered: false });
  console.log(
    `❤️ Inserted likes: ${likes.length}   💬 Inserted comments: ${comments.length}`
  );

  // --- connect to Neo4j ---
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );
  const session = driver.session();
  console.log("🔗 Connected to Neo4j");

  // reset graph
  await session.run(`MATCH (n) DETACH DELETE n`);

  // indexes (Neo4j)
  await session.run(
    `CREATE INDEX user_mongoid IF NOT EXISTS FOR (u:User) ON (u.mongoId)`
  );
  await session.run(
    `CREATE INDEX user_handle IF NOT EXISTS FOR (u:User) ON (u.handle)`
  );

  // create User nodes in batches
  const BATCH = 1000;
  for (let i = 0; i < users.length; i += BATCH) {
    const slice = users.slice(i, i + BATCH);
    await session.run(
      `
      UNWIND $rows AS row
      MERGE (u:User {mongoId: row.mongoId})
      SET u.handle = row.handle, u.createdAt = datetime(row.createdAt)
      `,
      {
        rows: slice.map((u) => ({
          mongoId: String(u._id),
          handle: u.handle,
          createdAt: u.createdAt.toISOString(),
        })),
      }
    );
  }
  console.log("🧩 Created User nodes in Neo4j");

  // FOLLOWS edges (power-law-ish)
  for (const u of users) {
    const targetCount = faker.number.int({ min: 5, max: AVG_FOLLOWS * 2 });
    const targets = new Set();
    while (targets.size < targetCount) {
      const idx = samplePowerLawIndex(users.length);
      const t = users[idx];
      if (t._id.equals(u._id)) continue;
      targets.add(String(t._id));
    }
    const rows = Array.from(targets).map((dst) => ({
      src: String(u._id),
      dst,
      createdAt: faker.date.recent({ days: 45 }).toISOString(),
    }));
    await session.run(
      `
      UNWIND $rows AS r
      MATCH (a:User {mongoId: r.src}), (b:User {mongoId: r.dst})
      MERGE (a)-[f:FOLLOWS]->(b)
      ON CREATE SET f.createdAt = datetime(r.createdAt)
      `,
      { rows }
    );
  }
  console.log("🔗 Created FOLLOWS edges in Neo4j");

  await session.close();
  await driver.close();
  await mongo.close();

  // print a sample handle for the feed query
  const sampleHandle = users[Math.floor(Math.random() * users.length)].handle;
  console.log(`\n✅ Seed complete.`);
  console.log(
    `   Users: ${users.length} | Posts: ${posts.length} | Likes: ${likes.length} | Comments: ${comments.length}`
  );
  console.log(`   Try this handle in feed: ${sampleHandle}\n`);
}

main().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
