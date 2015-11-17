



var fs = require('fs');
var zlib = require('zlib');
var sqlite3 = require('sqlite3').verbose();

// Global performance measures
var peakStats = {rss: 0, heapTotal: 0, heapUsed: 0};
var db = new sqlite3.Database('archive.db');
console.log(db);

csvWrite();

function createDummyDB () {
	logOps('Start by creating archive.db and table "temp". Current Mem: ', process.memoryUsage());

	var file = 'archive.db';
	var exists = fs.existsSync(file);
	if (!exists) { fs.openSync(file, 'w'); }

	// check if the table exists already and, if so, clear it
	var query = "SELECT count(type) as count FROM sqlite_master WHERE type='table' AND name='temp'";
	var db = new sqlite3.Database(file);

	// remove table and recreate it so its fresh/empty
	var create_table_query = "CREATE TABLE temp (" + 
			"timestamp TEXT, " +
			"vehicle_id TEXT, " +
			"latitude TEXT, " +
			"longitude TEXT, " +
			"bearing TEXT, " +
			"progress TEXT, " +
			"service_date TEXT, " +
			"trip_id TEXT, " +
			"block_assigned TEXT, " +
			"next_stop_id TEXT, " +
			"dist_along_route TEXT, " +
			"dist_from_stop TEXT" +
	  ");";

	db.serialize( function() {
		var query1 = "SELECT count(type) as count FROM sqlite_master WHERE type='table' AND name='temp'";
		db.get(query1, function (err, row) {
			if (err) {
				cb(true, 'Check for temp table resulted in error: ' + err);
			} else {
				if (row.hasOwnProperty('count') && Number(row.count) > 0) {
					db.run('DROP TABLE temp;', function () {
						// run in cb since serialize seems to still be running them async
						db.run(create_table_query, function () { addDumbRows() });
					});
				} else {
					db.run(create_table_query, function () { addDumbRows() });
				}
			}
		});
	});
}

function addDumbRows () {
	var rows = [];
	for (var i = 0; i < 3000000; i++) {
		var row = []
		for (var i2 = 0; i2 < 12; i2++) {
			var v = Math.round(Math.random()*1000);
			row.push(v);
		}
		rows.push(row);
	}
	logOps('Done creating 3000000 rows dumbie file.');
	SQLnewRows(rows, function () {
		logOps('Before dumping rows var.');
		rows = null;
		logOps('Done uploading to SQL the 3000000 dumbie rows.');
		csvWrite();
	})
};

function SQLnewRows (rows, cb) {
	try {
		if (rows.length > 0) {
			var chunked = [];
			while (rows.length > 0) {chunked.push(rows.splice(0,250)); };
			var db = new sqlite3.Database('archive.db');

			runInsert(0);
			function runInsert (chunkIndex) {
				if (chunkIndex%500 == 0) logOps('Current state at chunkIndex ' + chunkIndex + '.'); 

				var rs = chunked[chunkIndex]
				var sqlInsert = "INSERT INTO 'temp' VALUES(" + 
												"'" + rs[0][0]  + "', " + 
												"'" + rs[0][1]  + "', " + 
												"'" + rs[0][2]  + "', " + 
												"'" + rs[0][3]  + "', " + 
												"'" + rs[0][4]  + "', " + 
												"'" + rs[0][5]  + "', " + 
												"'" + rs[0][6]  + "', " + 
												"'" + rs[0][7]  + "', " + 
												"'" + rs[0][8]  + "', " + 
												"'" + rs[0][9]  + "', " + 
												"'" + rs[0][10] + "', " + 
												"'" + rs[0][11] + "')";

				// using method disucssed on so at
				// http://stackoverflow.com/questions/1609637/is-it-possible-to-insert-multiple-rows-at-a-time-in-an-sqlite-database
				for (var i = 1; i < rs.length; i++) {
					sqlInsert = sqlInsert + ",('" + rs[i][0]  + "', " + 
																		"'" + rs[i][1]  + "', " + 
																		"'" + rs[i][2]  + "', " + 
																		"'" + rs[i][3]  + "', " + 
																		"'" + rs[i][4]  + "', " + 
																		"'" + rs[i][5]  + "', " + 
																		"'" + rs[i][6]  + "', " + 
																		"'" + rs[i][7]  + "', " + 
																		"'" + rs[i][8]  + "', " + 
																		"'" + rs[i][9]  + "', " + 
																		"'" + rs[i][10] + "', " + 
																		"'" + rs[i][11] + "')";
				}
				db.run(sqlInsert, function () {
					chunkIndex = chunkIndex + 1;
					if (chunkIndex >= chunked.length) {
						rows = null;
						cb(false, null); // finished with all
					} else {
						runInsert(chunkIndex);
					}
				});
			};

		}
	} catch (e) {
		console.log('Caught error.' + e);
		cb(true, 'Unknown error occured during SQLnewRows: ' + e);
	}
};


function csvWrite () {
	try {
		var stream = fs.createWriteStream('uniqueRows_dailyArchive.csv', {flags: 'w'});
		stream.write(['timestamp', 'vehicle_id', 'latitude', 'longitude', 'bearing', 'progress', 'service_date', 'trip_id', 'block_assigned', 'next_stop_id', 'dist_along_route', 'dist_from_stop'].join(','));

		logOps('Right before getting all result rowids.')
		db.all("SELECT rowid FROM temp", function (error, res) {
			if (error) {
				logOps('Failed on getting count number: ' + error);
			} else {
				res = res.map(function (ea) { return ea.rowid; });
				logOps('There are ' + res.length + ' rows of unique results.');

				var chunked = [];
				while (res.length > 0) { chunked.push(res.splice(0,15000)); };
				res = null;

				logOps(chunked.length + ' chunked lists created. Starting stream process.');

				getPortion(0);

				function getPortion (index) {

					if (index >= chunked.length) {
						stream.end();

						// now we need to compress the file
						var gzip = zlib.createGzip({level: 9});
						var inp = fs.createReadStream('uniqueRows_dailyArchive.csv');
						var out = fs.createWriteStream('uniqueRows_dailyArchive.csv.gz');
						inp.pipe(gzip).pipe(out);
						out.on('finish', function () {
							fs.stat('uniqueRows_dailyArchive.csv.gz', function (error, stats) {
								if (error || !(stats.hasOwnProperty('size') && !isNaN(stats.size))) {
									complete('Failed ' + dateDiff() + ' minutes: ' + error);
								} else {
									complete('All processes completed in ' + dateDiff() + ' minutes.');
								}
							});
						});

						function complete (msg) {
							console.log(msg);
							console.log('\r\nPerformance peaks:  \r\n  rss: ' + neatNum(peakStats.rss) + 
																									'\r\n  heapTotal: ' + neatNum(peakStats.heapTotal) + 
																									'\r\n  heapUsed: ' + neatNum(peakStats.heapUsed) + '\r\n');
						};
					} else {
						var rowid = chunked[index][chunked[index].length - 1];
						var q = "SELECT * FROM temp WHERE rowid IN (SELECT MIN(rowid) AND rowid > " + rowid + " FROM temp GROUP BY timestamp, trip_id) LIMIT 15000;"

						db.all(q, function (error, data) {
							if (error) {
								logOps('Failed during "SELECT * FROM temp LIMIT 10;" ' + error);
								return false;
							} else {
								logOps('Retrieved all results for chunk ' + index + ' out of ' + (chunked.length - 1) + '.');

								data.forEach(function (d, i) {
									var row = '\r\n' + [
															d.timestamp, 
															d.vehicle_id,
															d.latitude,
															d.longitude,
															d.bearing,
															d.progress,
															d.service_date,
															d.trip_id,
															d.block_assigned,
															d.next_stop_id,
															d.dist_along_route,
															d.dist_from_stop
														].join(',');
									stream.write(row);
									row = d = null; // dump row + data just in case
								});

								data = error = null;
								getPortion(index + 1);
								return false;
							}
						});
					}
				};
			}
		});
	} catch (e) {
		console.log(true, 'Unknown error occured during SQLcleanRows: ' + e);
	}
}






// performance logging utilities
function logOps (msg) {
	if (msg !== undefined) console.log(msg + '\r\n\r\n');

	var currMem = process.memoryUsage();
	var pct = null;
	var changes = [];

	if (peakStats.rss < currMem.rss) {
		pct = (((currMem.rss/peakStats.rss) - 1) * 100).toFixed(1).toString() + '%';
		changes.push('rss increased ' + pct + ' from ' + neatNum(peakStats.rss) + ' to ' + neatNum(currMem.rss) + ' MB.');
		peakStats.rss = currMem.rss;
	}

	if (peakStats.heapTotal < currMem.heapTotal) {
		pct = (((currMem.heapTotal/peakStats.heapTotal) - 1) * 100).toFixed(1).toString() + '%';
		changes.push('heapTotal increased ' + pct + ' from ' + neatNum(peakStats.heapTotal) + ' to ' + neatNum(currMem.heapTotal) + ' MB.');
		peakStats.heapTotal = currMem.heapTotal;
	}

	if (peakStats.heapUsed < currMem.heapUsed) {
		pct = (((currMem.heapUsed/peakStats.heapUsed) - 1) * 100).toFixed(1).toString() + '%';
		changes.push('heapUsed increased ' + pct + ' from ' + neatNum(peakStats.heapUsed) + ' to ' + neatNum(currMem.heapUsed) + ' MB.');
		peakStats.heapUsed = currMem.heapUsed;
	}

	if (changes.length > 0) {
		var c = changes.join('\r\n      ');
		console.log('    Current resource changes: \r\n      ' + c + '\r\n');
	}
};

function neatNum (x) {
	x = (x/1000000).toFixed(2);
  var parts = x.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

var startTime = new Date();
function dateDiff (datepart) {
	if (datepart == undefined) datepart = 'm';
	else datepart = datepart.toLowerCase();

	var endTime = new Date();
	var diff = endTime - startTime;
	return (diff/60000).toFixed(2);
};





