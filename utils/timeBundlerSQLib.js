var sqlite3 = require('sqlite3').verbose();
var fs = require('fs');

function initializeSQLite (argument) {
	var file = 'archive.db';
	var exists = fs.existsSync(file);
	if (!exists) { fs.openSync(file, 'w'); }

	// check if the table exists already and, if so, clear it
	var query1 = "SELECT count(type) as count FROM sqlite_master WHERE type='table' AND name='temp';";
	var db = new sqlite3.Database(file);
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
};


function SQLrefreshTable (argument) {
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
		var query1 = "SELECT count(type) as count FROM sqlite_master WHERE type='table' AND name='temp';";
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
		var db = new sqlite3.Database('archive.db');
		var errors = [];
		var numDone = 0;
		db.serialize(function () {
			var stmt = db.prepare("INSERT INTO temp VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
			for (var i = 0; i < rows.length; i++) {
				stmt.run(rows[i], function (err) {
					if (err) { errors.push(err); }
					numDone += 1;
					onDone();
				});
			}
			stmt.finalize();
		});

		function onDone () {
			if (numDone == rows.length) {
				try {
					if (db.open) db.close();
				} catch (e) {
					console.log('db.close() failed: ' + e);
				}
				if (errors.length > 0) {
					var errString = errors.map(function (ea) { return JSON.stringify(ea); }).toString();
					cb(true, errString);
				} else {
					cb(false);
				}
			} else {
				setTimeout(onDone, 2000)
			}
		};
	} catch (e) {
		console.log('Caught error.');
		cb(true, 'Unknown error occured during SQLnewRows: ' + e);
	}
};


module.exports = {
	SQLrefreshTable: SQLrefreshTable,
	SQLnewRows: SQLnewRows,
	initializeSQLite: initializeSQLite
};







