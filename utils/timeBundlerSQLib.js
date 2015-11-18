var sqlite3 = require('sqlite3').verbose();
var zlib = require('zlib');
var fs = require('fs');

function initializeSQLite (argument) {
	var file = 'archive.db';
	var exists = fs.existsSync(file);
	if (!exists) { fs.openSync(file, 'w'); }

	// check if the table exists already and, if so, clear it
	var query = "SELECT count(type) as count FROM sqlite_master WHERE type='table' AND name='temp'";
	var db = new sqlite3.Database(file);
	db.get(query, function (err, res) {
		if (err ) {
			cb(true, 'Check for temp table resulted in error: ' + err);
		} else {
			try {
				if (res.hasOwnProperty('count') && Number(res.count) > 0) {
					db.run('DROP TABLE temp');
				}
			} catch (e) {
				cb(true, 'Error during parse of res, count: ' + err);
			}
		}
	});
};


function SQLrefreshTable () {
	var db = new sqlite3.Database('archive.db');

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

	db.serialize(function() {
		var query1 = "SELECT count(type) as count FROM sqlite_master WHERE type='table' AND name='temp'";
		db.get(query1, function (err, row) {
			if (err) {
				cb(true, 'Check for temp table resulted in error: ' + err);
			} else {
				if (row.hasOwnProperty('count') && Number(row.count) > 0) {
					db.run('DROP TABLE temp;', function () {
						// run in cb since serialize seems to still be running them async
						db.run(create_table_query);
						db.close();
					});
				} else {
					db.run(create_table_query);
					db.close();
				}
			}
		});
	});
};

function SQLnewRows (rows, cb) {
	try {
		if (rows.length > 0) {
			var chunked = [];
			while (rows.length > 0) {chunked.push(rows.splice(0,250)); };
			var db = new sqlite3.Database('archive.db');

			runInsert(0);
			function runInsert (chunkIndex) {
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

function SQLcleanRows (cb) {
	var db = new sqlite3.Database('archive.db');
	try {
		// globals
		var all, cleaned;
		var stream = fs.createWriteStream('uniqueRows_dailyArchive.csv', {flags: 'w'});
		stream.write(['timestamp', 'vehicle_id', 'latitude', 'longitude', 'bearing', 'progress', 'service_date', 'trip_id', 'block_assigned', 'next_stop_id', 'dist_along_route', 'dist_from_stop'].join(','));

		var q1 = "SELECT COUNT(*) AS count FROM temp";
		db.get(, function (error, data) {
			if (error) {
				cb(true, 'Failed during ' + q1);
			} else {
				all = Number(data.count);

				var q2 = "SELECT rowid FROM temp WHERE rowid IN (SELECT MIN(rowid) FROM temp GROUP BY timestamp, trip_id)";
				db.get(q2, function (error, data) {
					if (error) {
						cb(true, 'Failed during ' + q2);
					} else {
						data = data.map(function (ea) { return ea.rowid; });
						cleaned = Number(data.length);

						var chunked = [];
						while (data.length > 0) { chunked.push(data.splice(0,15000)); };
						data = null;

						getPortion(0);

						function getPortion (index) {
							if (index >= chunked.length) {
								stream.end()

								// now we need to compress the file
								var gzip = zlib.createGzip({level: 9});
								var inp = fs.createReadStream('uniqueRows_dailyArchive.csv');
								var out = fs.createWriteStream('uniqueRows_dailyArchive.csv.gz');
								inp.pipe(gzip).pipe(out);
								out.on('finish', function () {
									fs.stat('uniqueRows_dailyArchive.csv.gz', function (error, stats) {
										if (error || !(stats.hasOwnProperty('size') && !isNaN(stats.size))) {
											cb(true, stats)
										} else {
											db.run('DROP TABLE temp', function () { if (db.open) db.close(); });
											cb(false, {all: all, cleaned: cleaned, size: stats.size});
										}
									});
								});

								return false;
							} else {
								var rowid = chunked[index][chunked[index].length - 1];
								var q3 = "SELECT * FROM temp WHERE rowid IN (SELECT MIN(rowid) AND rowid > " + rowid + " FROM temp GROUP BY timestamp, trip_id) LIMIT 15000;"

								db.all(q3, function (error, data) {
									if (error) {
										logOps('Failed during "SELECT * FROM temp LIMIT 10;" ' + error);
										return false;
									} else {
										logOps('Retrieved all results for chunk ' + index + '.');

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
			}
		});
	} catch (e) {
		cb(true, 'Unknown error occured during SQLcleanRows: ' + e);
	}
};


module.exports = {
	SQLrefreshTable: SQLrefreshTable,
	SQLnewRows: SQLnewRows,
	initializeSQLite: initializeSQLite,
	SQLcleanRows: SQLcleanRows
};







