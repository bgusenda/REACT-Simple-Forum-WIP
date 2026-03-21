import { MongoClient } from 'mongodb';
let database: any;

const connectToServer = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    database = client.db('reactforumDB');
    await database
      .collection('users')
      .createIndex(
        { email: 1 },
        { unique: true, collation: { locale: 'en', strength: 2 } }
      );
    await database
      .collection('users')
      .createIndex(
        { username: 1 },
        { unique: true, collation: { locale: 'en', strength: 2 } }
      );
    console.log('Connected successfuly to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB: ', error);
    throw error;
  }
};

const getDb = () => database;

module.exports = {
  connectToServer,
  getDb,
};
