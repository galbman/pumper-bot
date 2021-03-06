var AWS = require("aws-sdk");
const { v4: uuidv4, NIL: NIL_UUID} = require('uuid');

const ALT_ROOT_COMMAND = '!dadjoke';
const ROOT_COMMAND = '!dadabase';
const DAD_PART = 0;
const JOKE_PART = 1;
const WOTD_PART = 2;
const DATE_PART = 3;

const FIRST_DATE = '012022';

var JON_ID;
var HACKMAN_ID;
var TABLEKNIGHT_ID;


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
		JON_ID = props.getRaw('discord.jonID');
		HACKMAN_ID = props.getRaw('discord.hackmanID');
		TABLEKNIGHT_ID = props.getRaw('discord.tableknightID');

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
		if (msg.content.toLowerCase().startsWith(ROOT_COMMAND + " " + command.command)
			|| msg.content.toLowerCase().startsWith(ALT_ROOT_COMMAND + " " + command.command)){
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
			} else {
				console.log(JSON.stringify(data, undefined, 2));
				msg.reply("Your dad joke will make a fine addition to my collection!");
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
			//console.log("Query succeeded.");
			
			if (data.Items.length > 0){
			let retString = "Jokes for " + dateParm + ":\n\n";			
			
			//temporary fix, eventually change this to direct channel messages to avoid the reply interuption
			data.Items.forEach(function(item) {
				newPart = item.Dad + ": \"" + item.Joke + "\"\nWOTD: " + item.Word + "\n\n";
				if (retString.length + newPart.length >= 2000){
					msg.reply(retString);
					retString = "\n" + newPart;
				} else {
					retString += newPart;
				}
			});	
			msg.reply(retString);
			} else {
				msg.reply("No dad jokes found for " + dateParm + ". Perhaps the archives are incomplete.");
			}
		}
	});
}

//pick random date between now and the date of the first jokes. get all for that date.  get random from results.
function randomJoke(client, msg){

	let dateParm = getRandomDateParm();

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
			let item = data.Items[(Math.floor(Math.random() * data.Items.length))];
			
			let retString = "\n";
			retString += "\"" + item.Joke + "\"";
			//retString += "\nDad: " + item.Dad + "\tWOTD: " + item.Word + "\tDate: " + item.MMYYYY + "\n\n";
			msg.reply(retString);
		}
	});
}

//pretend i'm using a proper date library and this is a single line of code
function getRandomDateParm(){
	let dt = new Date();
	
	let numMonthsFirst = (FIRST_DATE.substr(2) * 12) + (parseInt(FIRST_DATE.substr(0,2)));
	//console.log("numMonthsFirst: " + numMonthsFirst);
	let numMontsCurrent = (dt.getFullYear() * 12) + (dt.getMonth() + 1);
	//console.log("numMontsCurrent: " + numMontsCurrent);
	let monthDif = numMontsCurrent - numMonthsFirst;
	//console.log("monthDif: " + monthDif);
	let randOffset = Math.floor(Math.random() * (monthDif + 1));
	//console.log("randOffset: " + randOffset);
	let numMonthsRand = randOffset + numMonthsFirst;
	//console.log("numMonthsRand: " + numMonthsRand);
	let multTwelve = (numMonthsRand % 12) == 0;
	
	let strDateRand = "";
	if (multTwelve){
		strDateRand = "12" + String(Math.floor(numMonthsRand/12)-1);	
	} else {
		strDateRand = String(numMonthsRand % 12).padStart(2, "0") + String(Math.floor(numMonthsRand/12));	
	}
	//console.log("strDateRand: " + strDateRand);
	return strDateRand;		
}

function help(client, msg){
	let resp = "\n"
	resp += ROOT_COMMAND + " add [_DAD_] [\"_JOKE_\"] [_WOTD_] {_MMYYYY_}\n";
	resp += ROOT_COMMAND + " random\n";
	resp += ROOT_COMMAND + " dump {_MMYYYY_}\n";
	msg.reply(resp);
}

function modCheck(msg){
	console.log("mod check for msg with guild [" + msg.guild + "] and author: [" + msg.author.id + "]");
	console.log("TABLEKNIGHT_ID: " + TABLEKNIGHT_ID + " msgId: " + msg.author.id + " equal? " + (msg.author.id === TABLEKNIGHT_ID));
	if (!msg.guild){
		return (msg.author.id === JON_ID || msg.author.id === HACKMAN_ID);
	} else {
		return (msg.member.roles.cache.has(DISCORD_MOD_ID) || msg.author.id === TABLEKNIGHT_ID);
	}
}

function getCurrentMonthString(){
	let dt = new Date();
	let retStr = (dt.getMonth() + 1).toString().padStart(2, "0") + dt.getFullYear().toString();
	console.log("returning date string: " + retStr);
	return retStr;
}

