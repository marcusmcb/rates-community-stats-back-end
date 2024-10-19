const { MongoClient } = require('mongodb')
const dotenv = require('dotenv')

dotenv.config()
const mongoUri = process.env.MONGO_CONNECTION_STRING

const trackCollection = async () => {
	try {
		const client = new MongoClient(mongoUri, { tls: true })
		await client.connect()
		const db = client.db('rates-community-stats')
		const collection = db.collection('tracks')
    return {
      collection,
      client
    }
	} catch (error) {
		console.error('Error retrieving track collection:', error)
		return
	}
}

module.exports = trackCollection
