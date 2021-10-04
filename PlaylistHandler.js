const fs = require('fs');
const https = require('https');
const pr = require('properties-reader');


const TWITCH_HANDLES_PATH = './resources/twitch_handles.txt';
const TWITCH_HANDLES = pr(TWITCH_HANDLES_PATH);

const ROOT_COMMAND = '!playlist';
const TITLE_DELIMITER = ' by ';
const FOR_DELIMITER = ' for ';
const PLAYLIST_FILE = './resources/playlist.json'
var DISCORD_MOD_ID;
var CHANNEL_ID;
var STREAMER_ID;
var SONGLIST_AUTH;
var GUILD_ID;
var JON_ID;
var HACKMAN_ID;

var commands;

/*TODO
concurrent access > check for lock file, then create, then read, then write, then remove lock
exception handling
get past playlists using MMYYYY parm
cache song list? though probably not needed
*/

module.exports = {
	init: function(props){
		DISCORD_MOD_ID = props.getRaw('discord.mod');
		CHANNEL_ID = props.get('playlist.channel');
		STREAMER_ID = props.get('playlist.streamer');
		SONGLIST_AUTH = props.get('playlist.auth');
		GUILD_ID = props.getRaw('discord.guildID');
		JON_ID = props.getRaw('discord.jonID');
		HACKMAN_ID = props.getRaw('discord.hackmanID');

		commands = [
			{command: "request", requiresMod: false, handler: request},
			{command: "check", requiresMod: false, handler: check},
			{command: "dump", requiresMod: false, handler: dump},
			{command: "upload", requiresMod: true, handler: upload},
			{command: "clear", requiresMod: false, handler: clear},
			{command: "help", requiresMod: false, handler: help}
		]
		
		console.log("playlist handler ready!");
	},
	
	handle: function(client, msg){
		let command = canHandle(client, msg);
		if (command){
			command.handler(client, msg);
			return true;
		}
		return false;
	}
}

function canHandle(client, msg){
	console.log("GUILD_ID: " + GUILD_ID);
	console.log("MEMBERS: " + JSON.stringify(client.guilds.cache.get(GUILD_ID).members));
	console.log("AUTHOR ID: " + msg.author.id);
	console.log("AUTHOR: " + JSON.stringify(client.guilds.cache.get(GUILD_ID).members.cache.get(msg.author.id)));
	for (const command of commands){
		if ((msg.channel.id == CHANNEL_ID || !msg.guild || msg.author.id === HACKMAN_ID) && msg.content.toLowerCase().startsWith(ROOT_COMMAND + " " + command.command)){
			if (command.requiresMod && !modCheck(msg))	{
				msg.reply("not allowed, " + msg.author.username + " does not have mod role");	
			} else {
				return command;
			}
		}
	}
	return false;
}

function modCheck(msg){
	if (!msg.guild){
		return (msg.author.id === JON_ID || msg.author.id === HACKMAN_ID);
	} else {
		return !msg.member.roles.cache.has(DISCORD_MOD_ID);
	}
}

/***********************************************

Initial handler functions

***********************************************/

function upload(client, msg){
	let data = readPlaylist();
	let monthStr = getCurrentMonthString();
	
	if (!data[monthStr] || data[monthStr].length == 0){
		msg.reply("No requests yet for " + decodeDateString(monthStr));
	} else {
		let songs = Object.values(data[monthStr]);
		if (songs.length > 0){
			uploadSongRecursive(songs, msg);
		}		
	}
}

function request(client, msg){
	getFromSongApi("export", function(resp) {
		requestWithSonglist(client, msg, resp.items);
	});
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

function clear(client, msg){
	const guild = client.guilds.cache.get(GUILD_ID);
	
	let requestBody = getParamsFromMessage(msg.content, 2);
	if (requestBody.startsWith("for ")){
		let requestFor = requestBody.substr(3).trim();
		guild.members.fetch().then(queryResults => {
			queryResults.forEach(user => {
				if ((user.user.username.toLowerCase() === requestFor.trim().toLowerCase()
					|| user.displayName.toLowerCase() === requestFor.trim().toLowerCase())
					 && msg.member.roles.cache.has(DISCORD_MOD_ID)){
					clearFull(client, msg, user.user.id, user.user.username);	
				}
			})
		}).catch(console.error);
	} else {
		clearFull(client, msg, msg.author.id);
	}
}

function help(client, msg){
	let resp = "\n!playlist request [_TITLE_] {by _ARTIST_} {for _USERNAME_}\n";
	resp += "!playlist check\n";
	resp += "!playlist clear {for _USERNAME_}\n";
	resp += "!playlist dump {_MMYYYY_}\n";
	resp += "!playlist upload {_MMYYYY_}\n";
	msg.reply(resp);
}


/***********************************************

Handler helper/recursive/asynch callback functions

***********************************************/

function clearFull(client, msg, userId, username){
	let data = readPlaylist();
	clearFromPlaylist(data, userId, getCurrentMonthString());
	writePlaylist(data);
	let resp = (username ? "Song choice for " + username : "Your song choice");
	msg.reply(resp + " was reset");
}

function requestWithSonglist(client, msg, songList){
	const guild = client.guilds.cache.get(GUILD_ID);
	
	let requestBody = getParamsFromMessage(msg.content, 2);
	console.log("request body: " + requestBody);
	let requestForParts = requestBody.toLowerCase().split(FOR_DELIMITER);
	let found = false;
	if (requestForParts.length > 1 && msg.member.roles.cache.has(DISCORD_MOD_ID)){
		let requestFor = requestForParts[requestForParts.length-1].trim();
		console.log("checking for request for: " + requestFor);
		guild.members.fetch().then(queryResults => {
			queryResults.forEach(user => {
				if ((user.user.username.toLowerCase() === requestFor.trim().toLowerCase() || user.displayName.toLowerCase() === requestFor.trim().toLowerCase())
				&& msg.member.roles.cache.has(DISCORD_MOD_ID)){
					console.log("song string: "+ requestForParts.slice(0, requestForParts.length-1));
					found = true;
					requestFull(client, msg, requestForParts.slice(0, requestForParts.length-1).join(FOR_DELIMITER), user.user.id, user.user.username, songList);
				}
			})
			if (!found){
				requestFull(client, msg, requestBody, msg.author.id, msg.author.username, songList);
			}
		}).catch(console.error);			
	} else {
		requestFull(client, msg, requestBody, msg.author.id, msg.author.username, songList);
	}
}

function requestFull(client, msg, requestString, requestForID, requestForName, songList){
	console.log("request full requestString: " + requestString + " requestForId: " + requestForID + " requestForName: " + requestForName);
	let songId = locateSongOnList(requestString, songList);
	console.log("matched song: " + songId);
	if (songId){	
		let match = songList.find(song => song.id === songId);
		let playlist = readPlaylist();
		//if playlist contains this song already, return error, else add
		let alreadyRequested = whoRequested(songId, playlist);
		if (alreadyRequested){
			msg.reply(alreadyRequested + " has already requested \"" + match.title + "\" by " + match.artist);
		} else {
			updatePlaylist(playlist, requestForID, requestForName, songId, match.title, match.artist, getCurrentMonthString());
			writePlaylist(playlist);
			let resp = (requestForName ? "Song choice for " + requestForName : "Your song choice");
			msg.reply(resp + " has been updated to \"" + match.title + "\" by " + match.artist);			
		}
	} else {
		msg.reply("Song not found. Try copying the exact name from the songlist: https://www.streamersonglist.com/t/" + STREAMER_ID + "/songs");
	}
}

function uploadSongRecursive(songs, msg){
	if (songs.length == 0){
		msg.reply("All songs added to queue");
	} else {
		console.log(songs);
		addSongToQueue(songs[0], songs.slice(1), msg, uploadSongRecursive);
	}
}

/***********************************************

	Playlist functions

***********************************************/

function whoRequested(songId, playlist){
	console.log("who requested: " + songId);
	let date = getCurrentMonthString();
	if (playlist[date] && Object.keys(playlist[date]).length > 0){
		for (const userId of Object.keys(playlist[date])) {
			console.log(playlist[date][userId]);
			if (playlist[date][userId].songId === songId){
				return playlist[date][userId].username;
			}	  
		}
	}
}

function clearFromPlaylist(playlist, userId, date){
	if (playlist[date] && playlist[date][userId]){
		delete playlist[date][userId];
		if (Object.keys(playlist[date]).length == 0){
			delete playlist[date];
		}
	}
}

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
	playlist[date][userId]["twitch_username"] = TWITCH_HANDLES.get(userId);	
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
	console.log("calling locateSongOnList with songParam: " + songParam);
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
		let resBody = '';

		res.on('data', chunk => {
			resBody += chunk;
		})

		res.on('end', d => {
			callback(JSON.parse(resBody));
		})
	})

	req.on('error', error => {
	  console.error(error)
	})

	req.end();
}

function addSongToQueue(request, remainingSongs, msg, callback){
	let pathStr = '/v1/streamers/' + STREAMER_ID + '/queue/';
	console.log(pathStr);
	
	//replace request username with twitch name, if it is in the map
	let name = (request.twitch_username ? request.twitch_username : request.username);
	
	const data = JSON.stringify({
		"songId": request.songId,
		"requests": [{"amount": 0, "name": name}],
		"note": ""
	});

	let auth_header = 'Bearer ' + SONGLIST_AUTH;
	
	const options = {
		hostname: 'api.streamersonglist.com',
		port: 443,
		path: pathStr,
		method: 'POST',
		headers: {'Authorization': auth_header, 'origin': 'plantbot3000', 
			'accept': 'application/json',
			'Content-Type': 'application/json',
			'Content-Length': data.length}
	}	

	const req = https.request(options, res => {
		console.log(`statusCode: ${res.statusCode}`);
		let resBody = '';

		res.on('data', chunk => {
			resBody += chunk;
		})

		res.on('end', d => {	
			if (res.statusCode != 201){
				msg.reply("Upload failed at " + request.username);
			} else {
				callback(remainingSongs, msg);
			}		
		})
	})

	req.on('error', error => {
	  console.error(error);
	  msg.reply("Upload failed at " + request.username);
	})

	req.write(data);
	req.end();
}


/***********************************************

	Utility functions

***********************************************/

function getRequesteeFromMessage(message){
	return message.split(" ")[1];
}

function getParamsFromMessage(message, partsCount){
	return message.split(" ").slice(partsCount).join(" ").trim();
}

function getCurrentMonthString(){
	let dt = new Date();
	return (dt.getMonth() + 1).toString().padStart(2, "0") + dt.getFullYear().toString();
}

function decodeDateString(dateString){
	let dt = new Date(dateString.substring(2), dateString.substring(0,2)-1, 1);
	return dt.toLocaleString('default', { month: 'long', year: 'numeric'});
}





