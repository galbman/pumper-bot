const fs = require('fs');
const https = require('https');

const ROOT_COMMAND = '!playlist';
const TITLE_DELIMITER = '-';
const PLAYLIST_FILE = './resources/playlist.json'
var DISCORD_MOD_ID;
var CHANNEL_ID;
var STREAMER_ID;

var commands;


/*TODO
exception handling
help
prevent duplicates?
get past playlists using MMYYYY parm
cache song list? though probably not needed
*/

module.exports = {
	init: function(props){
		DISCORD_MOD_ID = props.get('discord.mod');
		CHANNEL_ID = props.get('playlist.channel');
		STREAMER_ID = props.get('playlist.streamer');

		commands = [
			{command: "request", requiresMod: false, handler: request},
			{command: "check", requiresMod: false, handler: check},
			{command: "dump", requiresMod: false, handler: dump}
		]
		
		console.log("playlist handler ready!");
	},
	
	handle: function(client, msg){
		let command = canHandle(msg);
		if (command){
			command.handler(client, msg);
			return true;
		}
		return false;
	}
}

function canHandle(msg){
	for (const command of commands){
		if (msg.channel.id == CHANNEL_ID && msg.content.toLowerCase().startsWith(ROOT_COMMAND + " " + command.command)){
			if (command.requiresMod && !msg.member.roles.cache.has(DISCORD_MOD_ID))	{
				console.log(msg.member.roles.cache);
				msg.reply("not allowed");
			} else {
				return command;
			}
		}
	}
	return false;
}

/***********************************************

High level handler functions

***********************************************/

function request(client, msg){
	getFromSongApi("export", function(resp) {
		requestFull(client, msg, resp.items);
	});
}

function requestFull(client, msg, songList){
	console.log("msg: " + msg);
	console.log("msg.content: " + msg.content);
	let params = getParamsFromMessage(msg.content);
	let songId = locateSongOnList(params, songList);
	console.log("matched song: " + songId);
	if (songId){
		let match = songList.find(song => song.id === songId);
		let data = readPlaylist();
		updatePlaylist(data, msg.author.id, msg.author.username, songId, match.title, match.artist, getCurrentMonthString());
		writePlaylist(data);
	msg.reply("Your song choice has been updated to \"" + match.title + "\" by " + match.artist);
	} else {
		msg.reply("Song not found. Try copying the exact name from the songlist: https://www.streamersonglist.com/t/" + STREAMER_ID + "/songs");
	}	
}

function check(client, msg){
	let monthStr = getCurrentMonthString();
	let data = readPlaylist();
	if (data[monthStr] && data[monthStr][msg.author.id]){
		getFromSongApi(data[monthStr][msg.author.id]["songId"], function(resp) {
			msg.reply("Your current potato playlist song is " + resp.title + " by " + resp.artist);
		});
	} else {
		msg.reply("You have not requested a song yet this month!");
	}
}

function dump(client, msg){
	let monthStr = getCurrentMonthString();
	let data = readPlaylist();
	
	if (!data[monthStr] || data[monthStr].length == 0){
		msg.reply("No requests yet for " + decodeDateString(monthStr));
	} else {
		let outMsg = "Potato playlist for " + decodeDateString(monthStr);
		Object.keys(data[monthStr]).forEach(function(key) {
			let request = data[monthStr][key];
			outMsg += "\n" + request.username + ": \"" + request.title + "\" by " + request.artist;
		});
		msg.reply(outMsg);
	}
};


/***********************************************

	File interaction functions

***********************************************/

function updatePlaylist(playlist, userId, username, songId, title, artist, date){
	if (!playlist[date]){
		playlist[date] = {};
	}
	if (!playlist[date][userId]){
		playlist[date][userId] = {};
	}
	playlist[date][userId]["songId"] = songId;
	playlist[date][userId]["username"] = username;
	playlist[date][userId]["title"] = title;
	playlist[date][userId]["artist"] = artist;
}

function readPlaylist(){
	let data = fs.readFileSync(PLAYLIST_FILE, 'utf8');
	return JSON.parse(data);
}

function writePlaylist(data){
	let out = JSON.stringify(data);
	fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data));
}


/***********************************************

	Song list API functions

***********************************************/


/**
 return the first match where the input string parsed into title/artist via configured delimiter exactly matches a song title/artist
 if none, return the first match where the entire input string exactly matches the song title
 if none, return the first match where the input string parsed into title/artist via configured delimiter is included in the song title/artist 
 if none, return the first match where the entire input string is included in the song title
 if none, return null
 **/
function locateSongOnList(songParam, songList){
	let parts = songParam.toLowerCase().trim().split(TITLE_DELIMITER);
	let title = "";
	let artist = "";
	if (parts.length > 1){
		artist = parts.slice(parts.length-1)[0].trim();
		title = parts.slice(0, parts.length-1).join(TITLE_DELIMITER).trim();
	} else {
		title = parts.join(TITLE_DELIMITER).trim();
	}
	
	//console.log("title: [" + title + "]");
	//console.log("artist: [" + artist + "]");
	
	let exactTitleId, exactTitleArtistId, partialTitleId, partialTitleArtistId;
	
	for (const song of songList){
		//console.log("songlist title: [" + song.title.trim().toLowerCase() + "]");
		//console.log("songlist artist: [" + song.artist.trim().toLowerCase() + "]");

		if (artist && !exactTitleArtistId && song.title.trim().toLowerCase() === title && song.artist.trim().toLowerCase() === artist){
			exactTitleArtistId = song.id;
		} else if (!exactTitleId && song.title.trim().toLowerCase() === songParam.trim().toLowerCase()){  //treat entire input as title
			exactTitleId = song.id;
		} else if (artist && !partialTitleArtistId && song.title.trim().toLowerCase().includes(title) && song.artist.trim().toLowerCase().includes(artist)){
			partialTitleArtistId = song.id;
		} else if (!partialTitleArtistId && song.title.trim().toLowerCase().includes(songParam.trim().toLowerCase())){ //treat entire input as title
			partialTitleId = song.id;
		}
	}
	
	console.log("songlist matches for " + songParam + ":\nexact title + artist: " + exactTitleArtistId + "\nexact title: " + exactTitleId + "\npartial title + artist: " + partialTitleArtistId + "\npartial title: " + partialTitleId);
		
	if (exactTitleArtistId) return exactTitleArtistId;
	if (exactTitleId) return exactTitleId;
	if (partialTitleArtistId) return partialTitleArtistId;
	return partialTitleId;	
}

function getFromSongApi(path, callback){
	let pathStr = '/v1/streamers/' + STREAMER_ID + '/songs/' + path;
	
	const options = {
		hostname: 'api.streamersonglist.com',
		port: 443,
		path: pathStr,
		method: 'GET'
	}

	const req = https.request(options, res => {
		console.log(`statusCode: ${res.statusCode}`);
		let resBody = '';

		res.on('data', chunk => {
			resBody += chunk;
		})

		res.on('end', d => {
			console.log("response: " + resBody);
			callback(JSON.parse(resBody));
		})
	})

	req.on('error', error => {
	  console.error(error)
	})

	req.end();
}


/***********************************************

	Utility functions

***********************************************/

function getParamsFromMessage(message){
	return message.split(" ").slice(2).join(" ").trim();
}

function getCurrentMonthString(){
	let dt = new Date();
	return (dt.getMonth() + 1).toString().padStart(2, "0") + dt.getFullYear().toString();
}

function decodeDateString(dateString){
	let dt = new Date(dateString.substring(2), dateString.substring(0,2)-1, 1);
	return dt.toLocaleString('default', { month: 'long', year: 'numeric'});
}





