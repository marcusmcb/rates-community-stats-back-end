const fs = require('fs')
const path = require('path')
const csvParser = require('csv-parser')
const { MongoClient } = require('mongodb')
const dotenv = require('dotenv')

dotenv.config()

const mongoUri = process.env.MONGO_CONNECTION_STRING

const createSpotifyLink = (artist, title) => {
	let queryString = encodeURIComponent(`${artist} ${title}`)
	if (queryString.includes(encodeURIComponent('(Explicit)'))) {
		queryString = queryString.replace(encodeURIComponent('(Explicit)'), '')
	}
	return `https://open.spotify.com/search/${queryString}`
}

// Function to load playlists from CSV files and insert them into MongoDB
const loadPlaylists = async () => {
	const playlistsDir = path.join(__dirname, './playlists')

	// Get all CSV files in the playlists directory
	const files = fs
		.readdirSync(playlistsDir)
		.filter((file) => file.endsWith('.csv'))

	try {
		// Connect to MongoDB
		const client = new MongoClient(mongoUri, { tls: true })
		await client.connect()
		const db = client.db('rates-community-stats')
		const collection = db.collection('tracks')

		// Clear the existing collection to avoid duplicates
		await collection.deleteMany({})
		console.log('Existing playlists collection cleared.')

		// Iterate over each CSV file
		for (const file of files) {
			const playlistDate = extractDateFromFilename(file)
			const playlistTracks = await parseCSVFile(path.join(playlistsDir, file))

			// Insert each track as an individual document with a playlist_date and track order
			for (let index = 0; index < playlistTracks.length; index++) {
				const track = playlistTracks[index]
				console.log(track)
        const spotifyLink = createSpotifyLink(track.artist, track.title)  
				const trackData = {
					...track,
					playlist_date: playlistDate,
					original_track_order: index + 1, 
          spotify_link: spotifyLink
				}

				// Insert the track data into the MongoDB collection
				const result = await collection.insertOne(trackData)
				console.log('Track inserted with ID:', result.insertedId)
        console.log(trackData)

				// Introduce a small delay between inserts (e.g., 500ms)
				await delay(50)
			}
		}

		// Close the MongoDB connection
		await client.close()
		console.log('All playlists have been loaded and inserted.')
	} catch (error) {
		console.error('Error connecting to MongoDB or inserting data:', error)
	}
}

// Helper function to introduce a delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Helper function to extract date from the filename
const extractDateFromFilename = (filename) => {
	const match = filename.match(/rate_wonder_spotify_stream_(\w+_\d{4})\.csv/)
	if (match) {
		const [month, year] = match[1].split('_')
		return `${capitalize(month)} ${year}`
	}
	return 'Unknown'
}

// Helper function to parse a CSV file
const parseCSVFile = (filePath) => {
	return new Promise((resolve, reject) => {
		const results = []
		fs.createReadStream(filePath)
			.pipe(csvParser())
			.on('data', (data) => {
				results.push({
					title: data.title,
					artist: data.artist,
					added: data.added,
				})
			})
			.on('end', () => resolve(results))
			.on('error', (error) => reject(error))
	})
}

// Helper function to capitalize the first letter of a string
const capitalize = (str) => {
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

module.exports = loadPlaylists
