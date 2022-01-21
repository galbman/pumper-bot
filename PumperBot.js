const discord = require("discord.js");
const pr = require('properties-reader');
const quoteHandler = require("./QuoteHandler.js");
const playlistHandler = require("./PlaylistHandler.js");
const dadjokeHandler = require("./DadJokeHandler.js");


const CONFIG_PATH = './resources/config.txt';
const PROPERTIES = pr(CONFIG_PATH);
const SHORT_PREFIX = '!';

const client = new discord.Client();


var token = PROPERTIES.get('discord.token');
client.login(token);

client.on('ready', () => {
	for (const handler of handlers){
		handler.init(PROPERTIES);
	}
	console.log('plant is ready!');
})

client.on('message', async (msg) => {
	if (!msg.content.startsWith(SHORT_PREFIX) || msg.author.bot){
		return;	
	} else {
		for (const handler of handlers){
			if (handler.handle(client, msg)){
				return;
			}
		}
		//if verbose, respond with help message?
	}
});

const handlers = [quoteHandler, playlistHandler, dadjokeHandler];