



var fs = require('fs');
var zlib = require('zlib');
var sqlite3 = require('sqlite3').verbose();





function  () {
	// Global performance measures
	var peakStats = {rss: 0, heapTotal: 0, heapUsed: 0};

	var db = new sqlite3.Database('../archive.db');
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
		if (db.open) db.close();
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
						if (db.open) db.close();
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







// performance logging utilities
function logOps (msg) {
	if (msg !== undefined) console.log(msg + '\r\n\r\n');

	var currMem = process.memoryUsage();
	var changes = [];

	if (peakStats.rss < currMem.rss) {
		var pct = (((currMem.rss/peakStats.rss) - 1) * 100).toFixed(1).toString() + '%';
		changes.push('rss increased ' + pct + ' from ' + peakStats.rss + ' to ' + currMem.rss + '.');
		peakStats.rss = currMem.rss;
	}

	if (peakStats.heapTotal < currMem.heapTotal) {
		var pct = (((currMem.heapTotal/peakStats.heapTotal) - 1) * 100).toFixed(1).toString() + '%';
		changes.push('heapTotal increased ' + pct + ' from ' + peakStats.heapTotal + ' to ' + currMem.heapTotal + '.');
		peakStats.heapTotal = currMem.heapTotal;
	}

	if (peakStats.heapUsed < currMem.heapUsed) {
		var pct = (((currMem.heapUsed/peakStats.heapUsed) - 1) * 100).toFixed(1).toString() + '%';
		changes.push('heapUsed increased ' + pct + ' from ' + peakStats.heapUsed + ' to ' + currMem.heapUsed + '.');
		peakStats.heapUsed = currMem.heapUsed;
	}

	if (changes.length > 0) {
		var c = changes.join('\r\n      ');
		console.log('    Current resource changes: \r\n      ' + c + '\r\n');
	}
};

function retrieveAllRows () {
	
}





//////////////////
function SQLcleanRows () {
	var db = new sqlite3.Database('archive.db');
	try {
		// globals
		var all, cleaned;
		var stream = fs.createWriteStream('uniqueRows_dailyArchive.csv', {flags: 'w'});
		stream.write(['timestamp', 'vehicle_id', 'latitude', 'longitude', 'bearing', 'progress', 'service_date', 'trip_id', 'block_assigned', 'next_stop_id', 'dist_along_route', 'dist_from_stop'].join(','));

		db.get("SELECT COUNT(*) AS count FROM temp", function (error, data) {
			if (error) {
				logOps('Failed during "SELECT COUNT(*) AS count FROM temp"');
			} else {
				all = Number(data.count);

				db.get("SELECT COUNT(*) AS count FROM temp WHERE rowid IN (SELECT MIN(rowid) FROM temp GROUP BY timestamp, trip_id)", function (error, data) {
					if (error) {
						logOps('Failed during "SELECT COUNT(*) AS count FROM temp WHERE rowid IN (SELECT MIN(rowid) FROM temp GROUP BY timestamp, trip_id)"');
					} else {
						cleaned = Number(data.count);

						logOps('Right before getting all results')
						// dropped " WHERE rowid IN (SELECT MIN(rowid) FROM temp GROUP BY timestamp, trip_id)" for the time being since dummy file
						db.all("SELECT * FROM temp", function (error, data, ind) {
							if (error) {
								logOps('Failed during "SELECT COUNT(*) AS count FROM temp WHERE rowid IN (SELECT MIN(rowid) FROM temp GROUP BY timestamp, trip_id)"');
							} else {
								var row = '\r\n' + [
														data.timestamp, 
														data.vehicle_id,
														data.latitude,
														data.longitude,
														data.bearing,
														data.progress,
														data.service_date,
														data.trip_id,
														data.block_assigned,
														data.next_stop_id,
														data.dist_along_route,
														data.dist_from_stop
													].join(',');
								stream.write(row);
								
								row = data = null; // dump row + data just in case

								console.log('Current performance: ', ind, process.memoryUsage());
							}
						}, function (error, responseLength) {
							console.log('done with all');
							// // now we need to compress the file
							// var gzip = zlib.createGzip({level: 9});
							// var inp = fs.createReadStream('uniqueRows_dailyArchive.csv');
							// var out = fs.createWriteStream('uniqueRows_dailyArchive.csv.gz');
							// inp.pipe(gzip).pipe(out);
							// out.on('finish', function () {
							// 	fs.stat('uniqueRows_dailyArchive.csv.gz', function (error, stats) {
							// 		if (error || !(stats.hasOwnProperty('size') && !isNaN(stats.size))) {
							// 			console.log(true, stats);
							// 		} else {
							// 			db.run('DROP TABLE temp', function () { if (db.open) db.close(); });
							// 			console.log(false, {all: all, cleaned: cleaned, size: stats.size});
							// 		}
							// 	});
							// });
						});
					}
				});
			}
		});
	} catch (e) {
		console.log(true, 'Unknown error occured during SQLcleanRows: ' + e);
	}
};

