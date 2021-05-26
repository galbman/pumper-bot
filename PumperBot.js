
const CONFIG_PATH = './resources/config.txt';


const Discord = require("discord.js");
const fs = require('fs');  //maybe remove?
const pr = require('properties-reader');
const PROPERTIES = pr(CONFIG_PATH);
const quoteHandler = require("./QuoteHandler.js");
const playlistHandler = require("./PlaylistHandler.js");

const client = new Discord.Client();
const short_prefix = '!';

var token = PROPERTIES.get('discord.token');
client.login(token);

client.on('ready', () => {
	for (const handler of handlers){
		handler.init(PROPERTIES);
	}
	console.log('plant is ready!');
})

client.on('message', async (msg) => {
	if (!msg.content.startsWith(short_prefix) || msg.author.bot || !msg.guild){
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

const handlers = [quoteHandler, playlistHandler];


//todo 
//move discord mod id to properties file
