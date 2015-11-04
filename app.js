var express = require('express');
var app = express();

// settings
app.set('view engine', 'ejs');
app.use('/static',  express.static(__dirname + '/static'));
app.use('/bower_components',  express.static(__dirname + '/bower_components'));

// calls
var http = require('http');
var request = require('request');

// packaging
var zlib = require('zlib');
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// file handling
var fs = require('fs');
var mkdirp = require('mkdirp').mkdirp;

// private information
var credentials = require('./credentials.js');

// other tools
var nodemailer = require('nodemailer');
var emailError = function () {
if (credentials.nodemailer == undefined) {
	console.log('Warning: Missing email login information.');
} else {
	var transporter = nodemailer.createTransport({
	  service: credentials.nodemailer.service,
	  auth: {
	    user: credentials.nodemailer.auth.user,
	    pass: credentials.nodemailer.auth.pass
	  }
	});
	var mailOptions = {
    from: credentials.nodemailer.options.from,
    to: credentials.nodemailer.options.to,
    subject: 'Bus Monitor Runtime Error',
    text: '',
    html: ''
	};
	var emailError = function (errText) {
		mailOptions.html = mailOptions.text = '<b>Runtime Error: </b><br> Something happened: ' + errText;
		transporter.sendMail(mailOptions, function(error, info){
		  if (error) console.log(error, info);
		  else console.log('Message sent: ' + info.response);
		});
	};
};

// operations
var ops = require('./ops.js'),
		processVehs = ops.processVehs,
		csvBundler = ops.csvBundler;

function startServer () {
	var server = app.listen(3000, function () {
		var host = server.address().address;
		var port = server.address().port;
		console.log('Bus app listening at http://%s:%s', host, port);
	});
};

function requestWithEncoding (url, method, callback) {
	var headers = {
		"accept-charset" : "ISO-8859-1,utf-8;q=0.7,*;q=0.3", 
		"accept-language" : "en-US,en;q=0.8", 
		"accept" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", 
		"user-agent" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/537.13+ (KHTML, like Gecko) Version/5.1.7 Safari/534.57.2", 
		"accept-encoding" : "gzip,deflate"
	};
	var options = {url: url, headers: headers};
	var req = request.get(options);

	req.on('response', function(res) {
		// if method start timer for next call now
		if (method == 1 && intervalGlobal == true)
			setTimeout(function () { runCall(method); }, 30000);

		var chunks = [],
				firstChunk = true;
		res.on('data', function(chunk) {
			// if method start timer for next call now
			if (method == 2 && intervalGlobal == true && firstChunk == true) {
				firstChunk = false;
				setTimeout(function () { runCall(method); }, 30000);
			}

			chunks.push(chunk);
		});

		res.on('end', function() {
			if (method == 3 && intervalGlobal == true)
				setTimeout(function () { runCall(method); }, 30000);
			var buffer = Buffer.concat(chunks);
			var encoding = res.headers['content-encoding'];
			if (encoding == 'gzip') {
				zlib.gunzip(buffer, function(err, decoded) {
					callback(err, decoded && decoded.toString());
				});
			} else if (encoding == 'deflate') {
				zlib.inflate(buffer, function(err, decoded) {
					callback(err, decoded && decoded.toString());
				});
			} else {
				callback(null, buffer.toString());
			}
		});
	});

	req.on('error', function(err) {
		callback(err);
	});
};

function runCall (method) {
	requestWithEncoding(url, method, function(err, data) {
		var t = new Date(Date.now()).toISOString().split('T');
		if (err) {
			console.log(err);
			emailError('Error on request at day ' + t[0] + ' and time ' + t[1] + '. Error: ', err);
		} else {
			var vehicles = processVehs(data);
			if (vehicles.length > 0) {
				// convert each obj in array to a list/array
				vehicles = vehicles.map(function (veh) {
					var keys = Object.keys(veh);
					var res = []
					keys.forEach(function (key) {
						res.push(veh[key]);
					});
					return res;
				}); 
				
				csvBundler(vehicles, function (err, msg) {
					if (err) emailError(msg);
					console.log(msg);
				});
			} else {
				emailError('0 vehicles returned after processing on request at day ' + t[0] + ' and time ' + t[1]);
			}
		}
	})
};

function kill () {
	if (intervalGlobal == true)
		intervalGlobal = false;
	else
		clearInterval(intervalGlobal);
	console.log('Stopping calls, wrapping up.');
};


// operation to determine how to run repeated api calls
var mtakey = (process.argv[4] !== undefined) && (process.argv[4] !== 'default') ? process.argv[4] : credentials.mtakey,
		url = 'http://api.prod.obanyc.com/api/siri/vehicle-monitoring.json?key=' + mtakey;

if (mtakey == undefined) {
	if (mtakey == 'production')
	console.log('Failed: Supply an MTA Bustime API key in order to run.');
} else {
	var method = ((process.argv[2] == 'default') || (process.argv[2] == 'production')) ? 1 : Number(process.argv[2]),
			researchLength = (process.argv[3] !== undefined) && (isNaN(Number(process.argv[3])) == false) ? Number(process.argv[3]) : ((process.argv[3] == 'production') ? 0 : 600000),
			intervalGlobal = null;

	if (isNaN(method) || method < 0 || method > 3) {
		console.log('Method option invalid.');
	} else {
		startServer();
	}

	// Method 0: run this every 30 seconds
	// Method 1: run 30 seconds after first response from Bustime API
	// Method 2: run 30 seconds after first portion of streamed data from Bustime API
	// Method 3: run this 30 seconds in callback
	if (method == 0) {
		intervalGlobal = setInterval(function () { runCall(method); }, 30000);
		if (researchLength > 0)
			setTimeout(function () { kill(); }, researchLength);
	} else if (method == 1 || method == 2 || method == 3) {
		// intervalGlobal = true;
		// runCall(method);
		// if (researchLength > 0)
		// 	setTimeout(function () { kill(); }, researchLength);
	}
};

// manage bundler operations every 10 min (600000 ms) do a check
var lastBundleRun = null;
var bundler = function () {
	setTimeout(function () { 
		var latest = new Date(Date.now()).getUTCHours();
		var targHr = Number(latest) - 1;
		if (lastBundleRun !== targHr) {
			ops.bundler(t, targHr, function (err, errMsg) {
				if (err) { 
					lastBundleRun = null;
					emailError(errMsg); 
				} else {
					console.log('Success');
				}
			});
		}
		lastBundleRun = targHr;
		bundler();
	}, 2000);
};
bundler();















