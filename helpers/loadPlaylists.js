// Import necessary modules
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

const loadPlaylists = async () => {
	const playlistsDir = path.join(__dirname, '../playlists')	
	const files = fs
		.readdirSync(playlistsDir)
		.filter((file) => file.endsWith('.csv'))
	try {
		// connect to MongoDB
		const client = new MongoClient(mongoUri, { tls: true })
		await client.connect()
		const db = client.db('rates-community-stats')
		const collection = db.collection('tracks')

		// clear the existing collection to avoid duplicates
		await collection.deleteMany({})
		console.log('Existing playlists collection cleared.')

		// iterate over each CSV file
		for (const file of files) {
			const playlistDate = extractDateFromFilename(file)
			const playlistDateObj = convertToDateObject(playlistDate)
			const playlistTracks = await parseCSVFile(path.join(playlistsDir, file))
			
			for (let index = 0; index < playlistTracks.length; index++) {
				const track = playlistTracks[index]
				const spotifyLink = createSpotifyLink(track.artist, track.title)
				const trackData = {
					...track,
					playlist_date: playlistDate,
					playlist_date_obj: playlistDateObj,
					original_track_order: index + 1,
					spotify_link: spotifyLink,
				}				
				const result = await collection.insertOne(trackData)
				console.log('Track inserted with ID:', result.insertedId)
				console.log(trackData)
				// introduce a small delay between inserts (e.g., 50ms)
				// to avoid any MongoDB API rate limits
				await delay(50)
			}
		}	
		await client.close()
		console.log('All playlists have been loaded and inserted.')
	} catch (error) {
		console.error('Error connecting to MongoDB or inserting data:', error)
	}
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const extractDateFromFilename = (filename) => {
	const match = filename.match(/rate_wonder_spotify_stream_(\w+_\d{4})\.csv/)
	if (match) {
		const [month, year] = match[1].split('_')
		return `${capitalize(month)} ${year}` // e.g., "April 2024"
	}
	return 'Unknown'
}

const convertToDateObject = (dateString) => {
	const [month, year] = dateString.split(' ')
	const monthIndex = new Date(`${month} 1, ${year}`).getMonth()
	return new Date(year, monthIndex)
}

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

const capitalize = (str) => {
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

module.exports = loadPlaylists
