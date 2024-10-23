// Import necessary modules
const express = require('express')
const { createHandler } = require('graphql-http/lib/use/express')
const { buildSchema } = require('graphql')
const { ruruHTML } = require('ruru/server')
const dotenv = require('dotenv')

// Load environment variables
dotenv.config()

// Import helper functions and database connection
const loadPlaylists = require('./helpers/loadPlaylists')
const trackCollection = require('./database/getTrackCollection')

// Define server port
const PORT = process.env.PORT || 4000

// Main GraphQL schema
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

// Resolver functions for each GraphQL API endpoint
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

// Initialize Express app
const app = express()

// Create & use the main GraphQL handler
app.all(
	'/graphql',
	createHandler({
		schema: schema,
		rootValue: root,
	})
)

// // Optional endpoint for loading playlists into MongoDB
// app.get('/load-playlists', async (_req, res) => {
// 	try {
// 		const result = await loadPlaylists() // Ensure this method loads data into MongoDB correctly.
// 		res.status(200).json({ message: 'Playlists loaded successfully', result })
// 	} catch (error) {
// 		console.error('Error loading playlists:', error)
// 		res.status(500).json({ error: 'Failed to load playlists' })
// 	}
// })

// Default route for GraphQL Playground or landing page
app.get('/', (_req, res) => {
	res.type('html')
	res.end(ruruHTML({ endpoint: '/graphql' }))
})

// Start the server at specified port
app.listen(PORT, () => {
	console.log(
		`🚀 Running a GraphQL API server at http://localhost:${PORT}/graphql`
	)
})
