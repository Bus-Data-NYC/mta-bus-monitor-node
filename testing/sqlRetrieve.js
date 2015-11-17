



var fs = require('fs');
var zlib = require('zlib');

////////////
var sqlite3 = require('sqlite3').verbose();

var db = new sqlite3.Database('../archive.db');
console.log('Current perf 1: ', process.memoryUsage());
var q1 = "SELECT * FROM temp WHERE rowid IN (SELECT MIN(rowid) FROM temp GROUP BY timestamp, trip_id)";
db.get(q1, function (error, data) {
	if (error) {
		console.log('Failed.');
	} else {
		console.log('Current perf: ', process.memoryUsage());
	}
	error = null; data = null;
}, function (error, responseLength) {
	console.log('done with all');
});

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
				console.log(true, 'Failed during "SELECT COUNT(*) AS count FROM temp"');
			} else {
				all = Number(data.count);

				db.get("SELECT COUNT(*) AS count FROM temp WHERE rowid IN (SELECT MIN(rowid) FROM temp GROUP BY timestamp, trip_id)", function (error, data) {
					if (error) {
						console.log(true, 'Failed during "SELECT COUNT(*) AS count FROM temp WHERE rowid IN (SELECT MIN(rowid) FROM temp GROUP BY timestamp, trip_id)"');
					} else {
						cleaned = Number(data.count);
						db.each("SELECT * FROM temp WHERE rowid IN (SELECT MIN(rowid) FROM temp GROUP BY timestamp, trip_id)", function (error, data, ind) {
							if (error) {
								console.log(true, 'Failed during "SELECT COUNT(*) AS count FROM temp WHERE rowid IN (SELECT MIN(rowid) FROM temp GROUP BY timestamp, trip_id)"');
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

