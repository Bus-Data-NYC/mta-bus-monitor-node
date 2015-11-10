var sqlite3 = require('sqlite3').verbose();
var SQLrefreshTable = require('./SQLrefreshTable').SQLrefreshTable;

var credentials = require('../credentials.js');

var azure = require('azure-storage');
var AZURECREDS = credentials.azure;

function timeBundler (dir, cb) {
	SQLrefreshTable();
	var db = new sqlite3.Database('archive.db');

	var globalErrors = 0,
			ALLDONE = false,
			uniques = {},
			ur =[];

	var bSvc = azure.createBlobService(AZURECREDS.temp.account, AZURECREDS.temp.key);

	try {
		bSvc.listBlobsSegmented(dir, null, function(err, res) {
			if (err) {
				cb(true, 'Failed during listBlobsSegmented callback.');
			} else {
				if (res.hasOwnProperty('entries') && res.entries.hasOwnProperty('length') && res.entries.length > 250) {
					var a = res.entries.map(function (ea) { return ea.name; }),
							b = [];

					// break large arrays into blocks due to 500 call per second limit
					while (a.length) { b.push(a.splice(0,100)); }

					// break up calls by > 1 second delays
					var globIndex = 0;
					blobReadLoop();

					function blobReadLoop () {
						console.log('Running operation, globIndex = ' + globIndex);

						var files = b[globIndex];
						if (files == undefined) {
							console.log(files);
						} else {
							var filesCompleted = 0;

							for (var i = 0; i < files.length; i++) {
								var f = files[i];
								getBlobFile(dir, f, 0);

								function getBlobFile (dir, f, errors) {
									var isLast = false;
									if (f == files[files.length - 1]) {
										isLast = true;
									}
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
											}

										} else {
											console.log(process.memoryUsage());
											filesCompleted += 1;
											processData(data);
										}

										// run next chunk if last in array
										if (isLast) {
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
															console.log('Unique rows: ' + Object.keys(uniques).length);
														}
													}, 2000);
												} else {
													console.log('Waiting for current batch downloads to finish. (' + filesCompleted + ' out of ' + files.length + ')');
													setTimeout(checkAllFilesComplete, 4000);
												}
											}
										}
									});
								};
							}
						}
					};
				}
			}
		});
	} catch (e) {
		cb(true, 'Unknown error during listBlobsSegmented operation: ' + e);
	}

	function processData (data) {
		try {
			data = data.split('\r\n');
			var cols = data.shift().split(','); // drop first row, col headers

			var rows = [];
			data.forEach(function (row) {
				var sp = row.split(',');
				if (sp.length == cols.length) rows.push(sp); // only add if its a complete row
			});

			rows.forEach(function (row) {
				try {
					// only add if same day
					if ((row[0] !== undefined) && (row[7] !== undefined) && (row[0].split("T")[0] == dir)) {
						var key = String(row[0] + row[7]);
						if (uniques[key] == undefined) {
							ur.push(row);
						}
						uniques[key] = true;
					}
				} catch (e) {
					console.log('Error when parsing trip_id: ' + row[7]);
				}
			});			
		} catch (e) {
			cb(true, 'Error during processData in timeBundler: ' + e);
		}
	};

	function sqlPrep () {
		// check if the table exists already and, if so, clear it
		var query1 = "SELECT count(type) as count FROM sqlite_master WHERE type='table' AND name='temp';";
		db.get(query1, function (err, row) {
			if (err ) {
				cb(true, 'Check for temp table resulted in error: ' + err);
			} else {
				try {
					if (row.hasOwnProperty('count') && Number(row.count) > 0) {
						db.run('DROP TABLE temp');
					}
				} catch (e) {
					cb(true, 'Error during parse of row, count: ' + err);
				}
			}
		});
	}

	// hacky solution... keeps process from timing out
	(function wait () {
	   if (!ALLDONE) setTimeout(wait, 1000);
	})();
};

module.exports = {
	timeBundler: timeBundler,
};




