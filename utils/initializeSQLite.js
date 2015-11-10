var fs = require('fs');
var sqlite3 = require("sqlite3").verbose();

function initializeSQLite (argument) {
	var file = 'archive.db';
	var exists = fs.existsSync(file);

	if (!exists) {
		fs.openSync(file, 'w');
	}

	var db = new sqlite3.Database(file);


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
};


module.exports = {
	initializeSQLite: initializeSQLite,
};
