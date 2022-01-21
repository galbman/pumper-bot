var AWS = require("aws-sdk");
const { v4: uuidv4, NIL: NIL_UUID} = require('uuid');

const ROOT_COMMAND = '!dadjoke';
const DAD_PART = 0;
const JOKE_PART = 1;
const WOTD_PART = 2;
const DATE_PART = 3;
//TODO make help message use these


var docClient;
var commands;


module.exports = {	
	init: function(props){
		
		AWS.config.update({
			region: 'us-east-1',
			accessKeyId: props.get('dynamo.key.access'),
			secretAccessKey: props.get('dynamo.key.secret')
		});
				
		docClient = new AWS.DynamoDB.DocumentClient();
				
				
		DISCORD_MOD_ID = props.getRaw('discord.mod');

		commands = [
			{command: "add", requiresMod: true, handler: addJoke},
			{command: "random", requiresMod: false, handler: randomJoke},
			{command: "dump", requiresMod: false, handler: getJokes},
			{command: "help", requiresMod: false, handler: help}
		]
		
		console.log("joke handler ready!");
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

function getParamsFromMessage(message){
	return message.split(" ").slice(1).join(" ").trim();
}

function canHandle(client, msg){
	for (const command of commands){
		if (msg.content.toLowerCase().startsWith(ROOT_COMMAND + " " + command.command)){
			if (command.requiresMod && !modCheck(msg))	{
				msg.reply("not allowed, " + msg.author.username + " does not have mod role");	
			} else {
				return command;
			}
		}
	}
	return false;
}

function addJoke(client, msg) {	
	let parts = getAddParts(msg.content);
	
	if (!parts || parts.length == 0){
		msg.reply("Invalid syntax.  Expected: " + ROOT_COMMAND + " add [_DAD_] [\"_JOKE_\"] [_WOTD_] {_MMYYYY_}");
	} else {
		
		let dateParm = (parts.length == 4 ? parts[DATE_PART] : getCurrentMonthString());
		console.log("dateParm: " + dateParm);
		
		var params = {
			TableName: "DadJokes",
			Item:{
				"MMYYYY": dateParm,
				"Joke": parts[JOKE_PART],
				"Dad": parts[DAD_PART],
				"Word": parts[WOTD_PART]        
			}
		};
		docClient.put(params, function(err, data) {
			if (err) {
				console.log(JSON.stringify(err, undefined, 2));
				msg.reply("err");
			} else {
				console.log(JSON.stringify(data, undefined, 2));
				msg.reply("success");
			}
		});
	}
}

function getAddParts(content){
	//Dad | "Joke" | Word | MMYYYY
	
	if (!/^[^"]*\"[^"]*\"[^"]*$/.test(content)){
		console.log("returning null, bad joke format");
		return null;
	}
	
	let parts = [];
	
	//remove two operators
	content = content.split(" ").slice(2).join(" ");
	
	//split by quote
	let quoteParts = content.split("\"");
	
	//save dad and joke
	parts[0] = quoteParts[0].trim();
	parts[1] = quoteParts[1].trim();
	
	//split by space
	let spaceParts = quoteParts[2].trim().split(" ");
	
	//ensure 1 or 2 parms left
	if (spaceParts.length < 1 || spaceParts.length > 2){
		console.log("returning null, missing/extra parms");
		return null;
	}
	
	//save word
	parts[2] = spaceParts[0];
	
	console.log("spaceParts length: " + spaceParts.length);
	console.log("spaceParts: " + spaceParts);
	console.log("parts: " + parts);
	
	//if final parm is present, verify date format, save date if valid
	if (spaceParts.length == 2 && !(/^\d{6}$/.test(spaceParts[1]))){
		console.log("returning null, bad date");
		return null;
	} else if (spaceParts.length == 2){
		parts[3] = spaceParts[1];
	}
	
	return parts;
}

function getJokes(client, msg){
	let parts = msg.content.split(" ").slice(2);
	let dateParm = (parts.length > 0 ? parts[0] : getCurrentMonthString());
	
	var params = {
		TableName : "DadJokes",
		KeyConditionExpression: "#date = :date",
		ExpressionAttributeNames:{
			"#date": "MMYYYY"
		},
		ExpressionAttributeValues: {
			":date" : dateParm
		}
	};
	
	docClient.query(params, function(err, data) {
		if (err) {
			console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
		} else {
			console.log("Query succeeded.");
			let retString = "Jokes for " + dateParm + ":\n";
			data.Items.forEach(function(item) {
				retString += item.Dad + ": \"" + item.Joke + "\"\nWOTD: " + item.Word + "\n\n";
			});
			msg.reply(retString);
		}
	});
}

function randomJoke(client, msg){	
	//pick random date. get all for that date.  get random from results.

	var params = {
		TableName: "DadJokes",
		Limit: 1,
		HashKeyValue: "Id",
		ExclusiveStartKey: {Id: searchKey, Word: "a"},
	};
	
	//query(params, msg);
}
/*
function scan(params, msg){
	docClient.scan(params, function(err, data){
		if (err) {
            console.log(JSON.stringify(err, undefined, 2));
			msg.reply("err");
        } else {			
            console.log(JSON.stringify(data, undefined, 2));
			if (data.Count == 0){
				console.log("no hits");
				if (params.ExclusiveStartKey.Id != NIL_UUID){
					console.log("trying again with null uuid");
					params.ExclusiveStartKey.Id = NIL_UUID;
					scan(params, msg);
				}
			} else {
				msg.reply(params.ExclusiveStartKey.Id + "  " + data.Items[0].Id);
			}			
        }
	});	
}*/


function help(client, msg){
	let resp = "\n"
	resp += ROOT_COMMAND + " add [_DAD_] [\"_JOKE_\"] [_WOTD_] {_MMYYYY_}\n";
	resp += ROOT_COMMAND + " random\n";
	resp += ROOT_COMMAND + " dump {_MMYYYY_}\n";
	msg.reply(resp);
}

function modCheck(msg){
	if (!msg.guild){
		return (msg.author.id === JON_ID || msg.author.id === HACKMAN_ID);
	} else {
		return msg.member.roles.cache.has(DISCORD_MOD_ID);
	}
}

function getCurrentMonthString(){
	let dt = new Date();
	let retStr = (dt.getMonth() + 1).toString().padStart(2, "0") + dt.getFullYear().toString();
	console.log("returning date string: " + retStr);
	return retStr;
}

/*

sounds like we'd want a way to enter a joke + a name, tied to a month (probably default to current, option to override), then a command to pull back the winners for the current month (with option to pull a specific month).   could add some fun commands too, say to track a leaderboard, or to pull a random dad joke


MMYYYY > Partition Key
Joke > Sort Key
Word 
Dad


Query: all jokes from MMYYYY
Random joke (provide random partition


primary key = UUID?
sort key = 


search:
random
all from MMYY


local secondary index = word



Id
Word
Joke
Date > Default to today
Dad
Reactions
PumperFave


https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStarted.NodeJs.html
https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html

*/




