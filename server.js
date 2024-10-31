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
		playlist_number: Int
  }

	type UserTrackCount {
    added: String!
    trackCount: Int!
  }

	type ArtistCount {
  	artist: String
  	trackCount: Int
	}

	type TitleCount {
  	title: String
  	playCount: Int
	}

  type Query {
    searchByArtist(artist: String): [Track]
    searchByTitle(title: String): [Track]
    searchByAdded(added: String): [Track]
    getPlaylistTracks(playlist_date: String): [Track]
		totalSongs: Int
		mostTracksByUser: [UserTrackCount]
		mostPlayedArtists: [ArtistCount]
		mostPlayedTitles: [TitleCount]
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
				.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special characters for safe regex
				.replace(/\s+/g, '[\\s-]') // Handle spaces and dashes

			// Add optional period handling with \.? for cases like "Dr Dre" and "Dr. Dre"
			const regex = new RegExp(
				`\\b${escapedArtist.replace(/\\s/, '\\.?\\s')}\\b`,
				'i'
			)

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
	async totalSongs() {
		try {
			const { collection, client } = await trackCollection()
			const count = await collection.countDocuments() // Count all documents in the tracks collection
			await client.close()
			return count
		} catch (error) {
			console.error('Error counting songs:', error)
			return 0 // Return 0 in case of an error
		}
	},
	async mostTracksByUser() {
		try {
			const { collection, client } = await trackCollection()
			const result = await collection
				.aggregate([
					{
						$group: {
							_id: '$added',
							trackCount: { $sum: 1 }, // Count the number of tracks each user added
						},
					},
					{
						$project: {
							added: '$_id',
							trackCount: 1,
						},
					},
					{
						$sort: { trackCount: -1 }, // Sort by track count in descending order
					},
				])
				.toArray()

			await client.close()
			return result
		} catch (error) {
			console.error('Error retrieving most tracks by user:', error)
			return []
		}
	},
	async mostPlayedArtists() {
		try {
			const { collection, client } = await trackCollection()
			const artists = await collection
				.aggregate([
					// Step 1: Split the artist field by commas and trim whitespace
					{ $project: { artists: { $split: ['$artist', ','] } } },
					// Step 2: Unwind the array to create a document per artist
					{ $unwind: '$artists' },
					// Step 3: Trim whitespace from each artist name
					{ $set: { artists: { $trim: { input: '$artists' } } } },
					// Step 4: Group by artist name and count occurrences
					{ $group: { _id: '$artists', trackCount: { $sum: 1 } } },
					// Step 5: Sort by trackCount in descending order and limit to top 10
					{ $sort: { trackCount: -1 } },
					{ $limit: 10 },
				])
				.toArray()
			await client.close()
			return artists.map((artist) => ({
				artist: artist._id,
				trackCount: artist.trackCount,
			}))
		} catch (error) {
			console.error('Error retrieving most played artists:', error)
			return []
		}
	},
	async mostPlayedTitles() {
		try {
			const { collection, client } = await trackCollection()
			const titles = await collection
				.aggregate([
					// Step 1: Normalize title by removing text in parentheses or after hyphens
					{
						$project: {
							normalizedTitle: {
								$trim: {
									input: { $arrayElemAt: [{ $split: ['$title', /[-(]/] }, 0] },
								},
							},
						},
					},
					// Step 2: Group by normalized title and count occurrences
					{ $group: { _id: '$normalizedTitle', playCount: { $sum: 1 } } },
					// Step 3: Filter for titles with more than one play
					{ $match: { playCount: { $gt: 1 } } },
					// Step 4: Sort by playCount in descending order and limit to top 10
					{ $sort: { playCount: -1 } },
					{ $limit: 10 },
				])
				.toArray()
			await client.close()
			return titles.map((title) => ({
				title: title._id,
				playCount: title.playCount,
			}))
		} catch (error) {
			console.error('Error retrieving most played titles:', error)
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
