function super_ops () {
	var http = require('http');
	var request = require('request');

	// file handling
	var zlib = require('zlib');
	var fs = require('fs');
	var mkdirp = require('mkdirp').mkdirp;

	// private information
	var credentials = require('./credentials.js');

	// operations tools
	var emailError = require('./utils/emailError.js').emailError,
			archiveSituationFeed = require('./utils/archiveSituationFeed.js').archiveSituationFeed,
			processVehs = require('./utils/processVehs.js').processVehs;

	// operations
	var ops = require('./ops.js'),
			csvBundler = ops.csvBundler;
			



	function requestWithEncoding (url, method, cb) {
		var headers = {
			"accept-charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3", 
			"accept-language": "en-US,en;q=0.8", 
			"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", 
			"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/537.13+ (KHTML, like Gecko) Version/5.1.7 Safari/534.57.2", 
			"accept-encoding": "gzip,deflate"
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
						cb(err, decoded && decoded.toString());
					});
				} else if (encoding == 'deflate') {
					zlib.inflate(buffer, function(err, decoded) {
						cb(err, decoded && decoded.toString());
					});
				} else {
					cb(null, buffer.toString());
				}
			});
		});

		req.on('error', function(err) {
			callback(err);
		});
	};


	function runCall (method) {
		requestWithEncoding(url, method, function(err, data) {
			try {
				var t = new Date(Date.now()).toISOString().split('T'),
						xmlIndex = data.indexOf('<?xml');

				// sometimes we get returned xml for some reason, this handles that
				if (typeof data == 'string' && xmlIndex > -1 && xmlIndex < 5) {
					emailError('Received XML instead of JSON: ' + data);

				} else {
					if (err) {
						emailError('Error returned to requestWithEncoding callback: ' + err);

					} else {
						var vehicles = null;

						// creates cleaned JSON for each row
						processVehs(data, function (err, res) {
							if (err) emailError('Error returned to processVehs callback: ' + res);
							else vehicles = res;
						});

						// convert each obj in array to a list/array
						if (!vehicles && vehicles.length > 0) {
							vehicles = vehicles.map(function (veh) {
								var keys = Object.keys(veh);
								var res = []
								keys.forEach(function (key) { res.push(veh[key]); });
								return res;
							}); 
							csvBundler(vehicles, function (err, msg) { 
								if (err) { emailError(msg); }
								else { console.log(msg); }
							});

						} else {
							emailError('No vehicles returned from processVehs');
						}

						archiveSituationFeed(data, function (err, msg) {
							if (err) emailError('Error returned in archiveSituationFeed callback: ' + msg);
						});
					}
				}
			} catch (e) {
				emailError('Error during requestWithEncoding callback: ' + e);
			}
		})
	};


	function kill () {
		if (intervalGlobal == true) intervalGlobal = false;
		else clearInterval(intervalGlobal);
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
				researchLength = ((process.argv[3] !== undefined) && (isNaN(Number(process.argv[3])) == false)) ? Number(process.argv[3]) : ((process.argv[3] == 'production') ? 0 : 0),
				intervalGlobal = null;

		if (isNaN(method) || method < 0 || method > 3) {
			method = 1;
			console.log('No method provided; using default method #1.');
		} else {
			console.log('Method defined as ', method);
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
			intervalGlobal = true;
			runCall(method);
			if (researchLength > 0)
				setTimeout(function () { kill(); }, researchLength);
		}
	};


	// manage bundler operations every 10 min (600000 ms) do a check
	var lastBundleRun = null;
	var bundler = function () {
		setTimeout(function () { 
			var dir = new Date(Date.now()).toISOString().split('T')[0];
			var latest = new Date(Date.now());
			var targHr = Number(latest.getUTCHours()) - 1;
			if (lastBundleRun !== targHr) {
				ops.bundler(dir, targHr, function (err, errMsg) {
					if (err) { 
						lastBundleRun = null;
						emailError('Error returned in bundler callback: ' + errMsg); 
					}
				});
			}
			lastBundleRun = targHr;
			bundler();
		}, 600000);
	};
	bundler();
};




// onload logic
// application run directly; start app server
if (require.main === module) super_ops();

// application imported as a module via "require"
// export function to create server
else module.exports = super_ops;














