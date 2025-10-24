import 'dotenv/config';
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);

async function test() {
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);
    const res = await db.collection('users').insertOne({ name: 'MongoTest', createdAt: new Date() });
    console.log('Inserted sample doc with ID:', res.insertedId);
  } catch (err) {
    console.error('Connection failed:', err.message);
  } finally {
    await client.close();
  }
}

test();
