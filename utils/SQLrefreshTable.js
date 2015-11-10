var sqlite3 = require('sqlite3').verbose();

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
					});
				} else {
					db.run(create_table_query);
				}
				console.log('done');
			}
		});
	});
};

module.exports = {
	SQLrefreshTable: SQLrefreshTable,
};







