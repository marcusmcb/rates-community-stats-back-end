const express = require('express')
const { createHandler } = require('graphql-http/lib/use/express')
const { buildSchema, GraphQLScalarType, Kind } = require('graphql')
const { ruruHTML } = require('ruru/server')
const dotenv = require('dotenv')
const cors = require('cors')

dotenv.config()

const loadPlaylists = require('./helpers/loadPlaylists')
const trackCollection = require('./database/getTrackCollection')

const PORT = process.env.PORT || 4000

const schema = buildSchema(`
  scalar Date

  type Track {
    title: String
    artist: String
    added: String
    original_track_order: Int
    spotify_link: String
    playlist_date: String
    playlist_date_obj: Date
  }

  type Query {
    searchByArtist(artist: String): [Track]
    searchByTitle(title: String): [Track]
    searchByAdded(added: String): [Track]
    getPlaylistTracks(playlist_date: String): [Track]
  }
`)

const dateScalar = new GraphQLScalarType({
	name: 'Date',
	description: 'A custom date scalar type for ISO date strings',
	parseValue(value) {
		return new Date(value)
	},
	serialize(value) {
		return value.toISOString()
	},
	parseLiteral(ast) {
		if (ast.kind === Kind.STRING) {
			return new Date(ast.value)
		}
		return null
	},
})

// resolver functions for each GraphQL API endpoint
const root = {
	Date: dateScalar,
	async searchByArtist({ artist }) {
		try {
			const { collection, client } = await trackCollection()
			const escapedArtist = artist
				.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
				.replace(/\s+/g, '[\\s-]')
			const regex = new RegExp(`\\b${escapedArtist}\\b`, 'i')
			const tracks = await collection
				.find({ artist: { $regex: regex } })
				.sort({ playlist_date_obj: -1 })
				.toArray()
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
			const regex = new RegExp(title, 'i')
			const tracks = await collection
				.find({ title: { $regex: regex } })
				.sort({ playlist_date_obj: -1 })
				.toArray()

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
			const regex = new RegExp(added, 'i')
			const tracks = await collection
				.find({ added: { $regex: regex } })
				.sort({ playlist_date_obj: -1 })
				.toArray()
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
app.use(cors())

app.all(
	'/graphql',
	createHandler({
		schema: schema,
		rootValue: root,
	})
)

// endpoint to load playlists into MongoDB
app.get('/load-playlists', async (_req, res) => {
	try {
		const result = await loadPlaylists()
		res.status(200).json({ message: 'Playlists loaded successfully', result })
	} catch (error) {
		console.error('Error loading playlists:', error)
		res.status(500).json({ error: 'Failed to load playlists' })
	}
})

// default route
app.get('/', (_req, res) => {
	res.type('html')
	res.end(ruruHTML({ endpoint: '/graphql' }))
})

app.listen(PORT, () => {
	console.log(
		`🚀 Running a GraphQL API server at http://localhost:${PORT}/graphql`
	)
})
