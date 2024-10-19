const express = require('express')
const { createHandler } = require('graphql-http/lib/use/express')
const { buildSchema } = require('graphql')
const { ruruHTML } = require('ruru/server')

const loadPlaylists = require('./helpers/loadPlaylists')
const trackCollection = require('./database/getTrackCollection')

const dotenv = require('dotenv')

dotenv.config()

const PORT = process.env.PORT || 4000

// main GraphQL schema
const schema = buildSchema(`
  type Track {
    title: String
    artist: String
    added: String
    original_track_order: Int
    spotify_link: String
    playlist_date: String
  }

  type Query {
    searchByArtist(artist: String): [Track]
    searchByTitle(title: String): [Track]
    searchByAdded(added: String): [Track]
    getPlaylistTracks(playlist_date: String): [Track]
  }
`)

// the root provides a resolver function for each GraphQL API endpoint
const root = {
	async searchByArtist({ artist }) {
		try {
			const { collection, client } = await trackCollection()
			const tracks = await collection.find({ artist }).toArray()
			await client.close()
			return tracks
		} catch (error) {
			console.error('Error retrieving tracks by artist:', error)
			return []
		}
	},
	async searchByTitle({ title }) {
		try {
			const { collection, client } = await trackCollection()
			const tracks = await collection.find({ title }).toArray()
			await client.close()
			return tracks
		} catch (error) {
			console.error('Error retrieving tracks by title:', error)
			return []
		}
	},
	async searchByAdded({ added }) {
		try {
			const { collection, client } = await trackCollection()
			const tracks = await collection.find({ added }).toArray()
			await client.close()
			return tracks
		} catch (error) {
			console.error('Error retrieving tracks for viewer:', error)
			return []
		}
	},
	async getPlaylistTracks({ playlist_date }) {
		try {
			const { collection, client } = await trackCollection()

			const tracks = await collection
				.find({ playlist_date })
				.sort({ original_track_order: 1 })
				.toArray()

			await client.close()
			return tracks
		} catch (error) {
			console.error('Error retrieving tracks for playlist:', error)
			return []
		}
	},
}

const app = express()

// create & use the main GraphQL handler
app.all(
	'/graphql',
	createHandler({
		schema: schema,
		rootValue: root,
	})
)

app.get('/', async (_req, res) => {
	// console.log(loadPlaylists())
	res.type('html')
	res.end(ruruHTML({ endpoint: '/graphql' }))
})

// Start the server at port
app.listen(PORT)
console.log('Running a GraphQL API server at http://localhost:4000/graphql')
