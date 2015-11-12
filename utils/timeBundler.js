var sqlite3 = require('sqlite3').verbose();

var SQLrefreshTable = require('./timeBundlerSQLib').SQLrefreshTable;
var SQLnewRows = require('./timeBundlerSQLib').SQLnewRows;

var credentials = require('../credentials.js');

var azure = require('azure-storage');
var AZURECREDS = credentials.azure;

function timeBundler (dir, cb) {
	SQLrefreshTable();

	var globalErrors = 0,
			ALLDONE = false,
			SQLnewRows_QUEUE = [];
			SQLnewRows_RUNNING = false;

	var bSvc = azure.createBlobService(AZURECREDS.temp.account, AZURECREDS.temp.key);

	try {dir = '2015-11-11'; ///!!!!!!!!!!!!!
		bSvc.listBlobsSegmented(dir, null, function(err, res) {
			if (err) {
				cb(true, 'Failed during listBlobsSegmented callback.');
			} else {
				if (res.hasOwnProperty('entries') && res.entries.hasOwnProperty('length') && res.entries.length > 250) {

					///!!!!! BREAK DOWN TO DEMO SIZE
					res.entries = res.entries.slice(0, 10);

					var a = res.entries.map(function (ea) { return ea.name; }),
							b = [];

					// break large arrays into blocks due to 500 call per second limit
					while (a.length) { b.push(a.splice(0,100)); }

					// break up calls by > 1 second delays
					var globIndex = 0;
					blobReadLoop();
					addSQLRowsFunc();

					function blobReadLoop () {
						console.log('Running operation, globIndex = ' + globIndex);

						var files = b[globIndex];
						if (files == undefined) {
							console.log(files);
						} else {
							var filesCompleted = 0;

							// for (var i = 0; i < files.length; i++) {

								runGetWhenDone(0);

								function runGetWhenDone (fileIndex) {
									if (SQLnewRows_QUEUE.length < 5000) {
										var f = files[fileIndex];
console.log('getting file ' + f);
										getBlobFile(dir, f, 0, function () {
											fileIndex = fileIndex + 1;
											if (fileIndex < files.length) {
												runGetWhenDone(fileIndex);
											} else {
												globIndex = globIndex + 1;
												checkAllFilesComplete();

												function checkAllFilesComplete () {
													if (filesCompleted >= files.length) {
														setTimeout(function () {
															if (globIndex < b.length) {
																blobReadLoop();
															} else {
																ALLDONE = true;
																console.log('DONE obtaining all data from dir ' + dir + '. Errors: ' + globalErrors);
															}
														}, 2000);
													} else {
														console.log('Waiting for current batch downloads to finish. (' + filesCompleted + ' out of ' + files.length + ')');
														setTimeout(checkAllFilesComplete, 4000);
													}
												}
											}
										});
									} else {
										setTimeout(function () { runGetWhenDone(fileIndex); }, 10000);
									}
								};

								function getBlobFile (dir, f, errors, getNext) {
									var isLast = false;
									if (f == files[files.length - 1]) { isLast = true; }

									bSvc.getBlobToText(dir, f, function(err, data, meta) {
										if (err) {
											console.log('Error on getBlobToText: ' + err + ' ' + data + ' ' + meta);

											// try rerunning a few times if it fails
											if (errors < 5) {
												errors += 1;
												getBlobFile(dir, f, errors);

											// if no luck then let's register this as an error
											} else {
												globalErrors += 1;
												filesCompleted += 1;
												getNext(); // move on to next file
											}

										} else {
											filesCompleted += 1;
											processData(data, function (error, errorMsg) {
												if (error) { console.log('FAILED ON PROCESS DATA: ' + errorMsg); }
												getNext(); // either way, run it
											});
										}
									});
								};
							// }
						}
					};
				}
			}
		});
	} catch (e) {
		cb(true, 'Unknown error during listBlobsSegmented operation: ' + e);
	}

	function processData (data, cb) {
		try {
			data = data.split('\r\n');
			var cols = data.shift().split(','); // drop first row, col headers

			var rows = [];
			data.forEach(function (row) {
				var sp = row.split(',');
				if (sp.length == cols.length) rows.push(sp); // only add if its a complete row
			});

			rows = rows.filter(function (row) {
				var hasBoth = ((row[0] !== undefined) && (row[7] !== undefined));
				var sameAsDir = (row[0].split("T")[0] == dir);
				return (hasBoth && sameAsDir);
			});

			// add new rows to the queue of tasks to add to db
			rows.forEach(function (row) { SQLnewRows_QUEUE.push(row); });

		} catch (e) {
			cb(true, 'Error during processData in timeBundler: ' + e);
		}
	};

	function addSQLRowsFunc () {
		if (!ALLDONE) {
			if (SQLnewRows_RUNNING || SQLnewRows_QUEUE.length == 0) {
				// if process currently underway, wait and try again later
				// console.log('Waiting for current SQLnewRows operation to complete...');
				setTimeout(addSQLRowsFunc, 4000)
			} else {
				SQLnewRows_RUNNING = true;
				console.log('RUNNING new SQLnewRows_RUNNING, w/ current length: ', SQLnewRows_QUEUE.length);
				// pop off first set of rows to process
				var r = SQLnewRows_QUEUE.splice(0, 100);
				SQLnewRows(r, function (error, errorMsg) {
					if (error) cb(true, errorMsg);
					SQLnewRows_RUNNING = false;
				});
			}
		}
	};

	// hacky solution... keeps process from timing out
	(function wait () {if (!ALLDONE) setTimeout(wait, 1000);})();
};

module.exports = {
	timeBundler: timeBundler,
};




