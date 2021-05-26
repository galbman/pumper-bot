verbose = false;  //can be overwritten by property file. decides whether bot should respond to invalid commands (permissions, bad syntax, etc)

var WRITE_TOKEN;
var READ_TOKEN;
const DISCORD_MOD_ID = '827353554678448128';

const https = require('https');
var commands;

module.exports = {	
	init: function(props){
		WRITE_TOKEN = props.get('quote.token.write');
		READ_TOKEN = props.get('quote.token.read');
				
		commands = [
			{command: "!quote", requiresMod: false, apiMethod: "quote", token: READ_TOKEN},
			{command: "!addquote", requiresMod: true, apiMethod: "addquote", token: WRITE_TOKEN},
			{command: "!delquote", requiresMod: true, apiMethod: "delquote", token: WRITE_TOKEN}
		]
		
		//read property file to know whether to set verbose to false or true
		console.log("quote handler ready!");
	},
	
	handle: function(client, msg){
		let command = canHandle(msg);
		if (command){
			//add callback function
			apiCall(command.apiMethod, command.token, getParamsFromMessage(msg.content), out => msg.reply(out));
			return true;
		}
		return false;
	}
}

function canHandle(msg){
	for (const command of commands){
		if (msg.content.toLowerCase().startsWith(command.command)){
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

function getParamsFromMessage(message){
	return message.split(" ").slice(1).join(" ").trim();
}

function apiCall(method, token, params, callback){
	
	let pathStr = '/customapi/' + method + '?token=' + token;
	if (params){
		pathStr += '&data=' + encodeURIComponent(params);
	}
	
	console.log("pathStr " + pathStr);
	
	const options = {
		hostname: 'twitch.center',
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
			callback(resBody);
		})
	})

	req.on('error', error => {
	  console.error(error)
	})

	req.end();
}

/*
!quote
This will return a random quote

!quote 4
This will return the 4th quote in the list
You can use negative numbers (-1 would be the last quote)

!quote cookie
This will return a random quote containing the word “cookie”

There’s also a special command:
!quote list
*/