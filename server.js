function super_ops () {
	var http = require('http');
	var request = require('request');

	// file handling
	var zlib = require('zlib');
	var fs = require('fs');

	// private information
	var credentials = require('./credentials.js');

	// operations tools
	var emailError = require('./utils/emailError.js').emailError,
			archiveSituationFeed = require('./utils/archiveSituationFeed.js').archiveSituationFeed,
			processVehs = require('./utils/processVehs.js').processVehs,
			csvBundler = require('./utils/csvBundler.js').csvBundler,
			timeBundler = require('./utils/timeBundler.js').timeBundler,
			initializeSQLite = require('./utils/initializeSQLite.js').initializeSQLite;
			



	function requestWithEncoding (url, method, cb) {
		try {
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
						cb(false, buffer.toString());
					}
				});
			});

			req.on('error', function(err) {
				cb(true, err);
			});
		} catch (e) {
			cb(true, e);
		}
	};


	function runCall (method) {
		requestWithEncoding(url, method, function(err, data) {
			try {
				var t = new Date(Date.now()).toISOString().split('T'),
						xmlIndex = data.indexOf('<?xml'),
						errIndex = data.indexOf('Server Error');

				// sometimes we get returned xml for some reason, this handles that
				if (typeof data == 'string' && xmlIndex > -1 && xmlIndex < 5) {
					if (errIndex > -1) runCall(method); // sometimes server errors, try a second time right away
					else emailError('Received XML instead of JSON: ' + data);

				} else {
					if (err) {
						emailError('Error returned to requestWithEncoding callback: ' + err);

					} else {
						// if data is a string, parse it
						if (typeof data == 'string') data = JSON.parse(data);

						var vehicles = null;

						// creates cleaned JSON for each row
						processVehs(data, function (err, res) {
							if (err) emailError('Error returned to processVehs callback: ' + res);
							else vehicles = res;
						});

						// convert each obj in array to a list/array
						if (vehicles && vehicles.length > 0) {
							vehicles = vehicles.map(function (veh) {
								var keys = Object.keys(veh);
								var res = []
								keys.forEach(function (key) { res.push(veh[key]); });
								return res;
							}); 

							csvBundler(vehicles, function (err, msg) { 
								if (err) { emailError(msg); }
								else { console.log('csvBundler: ' + msg); }
							});

							archiveSituationFeed(data, function (err, msg) {
								if (err) emailError('Error returned in archiveSituationFeed callback: ' + msg);
							});
						} else {
							console.log('No vehicles trips parsed on call.');
						}
					}
				}
			} catch (e) {
				emailError('Error during requestWithEncoding callback: ' + e);
			}
		})
	};


	function kill () {
		console.log('Stopping calls, wrapping up.');
		if (intervalGlobal == true) {
			intervalGlobal = false;
		} else {
			if (job && job == 'scrape') {
				clearInterval(intervalGlobal);
			} else if (job && job == 'archive') {
				lastBundleRun = 'STOP';
			} else {
				console.log('Error occured during kill cycle.');
			}
		}
	};


	// operation to determine how to run repeated api calls
	var mtakey = (process.argv[5] !== undefined) && (process.argv[5] !== 'default') ? process.argv[5] : credentials.mtakey,
			url = 'http://api.prod.obanyc.com/api/siri/vehicle-monitoring.json?key=' + mtakey;

	if (mtakey == undefined) {
		console.log('Failed: Supply an MTA Bustime API key in order to run.');

	} else {
		var job = (process.argv[2] == undefined || process.argv[2] == 'scrape') ? 'scrape' : 'archive',
				method = ((process.argv[3] == 'default') || (process.argv[3] == 'production')) ? 1 : Number(process.argv[3]),
				researchLength = ((process.argv[4] !== undefined) && (isNaN(Number(process.argv[4])) == false)) ? Number(process.argv[4]) : ((process.argv[4] == 'production') ? 0 : 0),
				intervalGlobal = null;

		if (isNaN(method) || method < 0 || method > 3) {
			method = 1;
			console.log('No method provided; using default Method #1.');
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
		} else if ((method == 1 || method == 2 || method == 3) && (job == 'scrape')) {
			intervalGlobal = true;
			runCall(method);
			if (researchLength > 0)
				setTimeout(function () { kill(); }, researchLength);
		} else if (job == 'archive') {
			initializeSQLite(); // initialize sqlite3 db
			bundler();
			if (researchLength > 0)
				setTimeout(function () { kill(); }, researchLength);
		}
	};


	// manage bundler operations every 100 min (6000000 ms) do a check
	var lastBundleRun = null,
			bundlerRunning = false;
	function bundler () {
		setTimeout(function () { 
			bundlerRunning = true;
			var latest = new Date(Date.now()),
					y = latest.getUTCFullYear(),
					m = latest.getUTCMonth() + 1, // months are zero-based in JS, go figure
					d = latest.getUTCDate(); // days, too so already 1 behind

			if (Number(m) < 10) m = String(0) + String(m);
			if (Number(d) < 10) d = String(0) + String(d);
			var dir = y + '-' + m + '-' + d;

			if (lastBundleRun !== d) {
				lastBundleRun = d;
				timeBundler(dir, function (err, errMsg, errCount) {
					bundlerRunning = false;
					if (err) { 
						lastBundleRun = null;
						emailError('Error returned in bundler callback: ' + errMsg); 
					} else {
						console.log('Successfully ran bundler for day/dir: ' + dir);
					}
				});
			} else if (lastBundleRun !== 'STOP') {
				bundler();
			}
		}, 2000);
	};
};




// onload logic
// application run directly; start app server
if (require.main === module) super_ops();

// application imported as a module via "require"
// export function to create server
else module.exports = super_ops;














