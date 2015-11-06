var credentials = require('../credentials.js');

var azure = require('azure-storage');
var AZURECREDS = credentials.azure;

function timeBundler (dir, hr, cb) {
	try {
		var bSvc = azure.createBlobService(AZURECREDS.temp.account, AZURECREDS.temp.key);
		bSvc.listBlobsSegmented(dir, null, function(err, result) {
			if (err) {
				cb(true, 'Error listing blob for ' + dir + ', hour ' + hr + '. Error res: ' + result);
			} else {
				var files = result.entries.map(function (ea) { 
					return ea.name;
				}).filter(function (ea) { 
					return String(hr) == String(ea[0] + ea[1]);
				});

				var anyErrors = false;

				files.forEach(function (file, i) {
					if (anyErrors == false) {
						bSvc.getBlobToText(dir, file, function(err, data, meta) {
							ctr.goal += 1;
							if (err) {
								anyErrors = true; // if errors occur with any file, send email, kill ops
								cb(true, 'Error reading file: ' + file + ' in dir: ' + dir + '. Error: ', err);
							} else {
								var rows = [];

								data = data.split('\r\n');
								data.shift(); // drop first row, col headers

								data.forEach(function (row) {
									var sp = row.split(',');
									if (sp.length == 12) // only add if its a complete row
										rows.push(sp);
								});

								ctr.state += 1;
								allFiles.push(rows);

								// run parseRead() on last file
								if (files.length - 1 == i) {
									parseRead(hr, function (err, res) {
										if (err) { cb(true, res); } 
										else {
											archive(dir, hr, res, function (err, res) {
												if (err) { cb(true, res); } 
												else { cb(false, null); }
											}); 
										}
									});
								}
							}
						});
					}
				});
			}
		} catch (e) {
			cb(true, 'Error occurred during timeBundler operation: ' + e);
		}
	});

	// function global
	var allFiles = [];
	var ctr = { state: 0, goal: 0, repeat: 0 };


	function parseRead (targHr, cb) {
		// ctr is a control against running parseRead without finishing file reads
		if (ctr.goal !== ctr.state) {
			if (ctr.repeat < 25) {
				ctr.repeat += 1;
				console.log('Still waiting to finish loading files...');
				setTimeout(function () { parseRead(targHr) }, 20000);
			} else {
				cb(true, 'parseRead operation failed; too many errors.');
			}
		} else {
			var uniques = {},
					ur =[];
			allFiles.forEach(function (rows, i1) {
				rows.forEach(function (row, i2) {
					try {
						var sameHr = row[0].split("T")[1].split(":")[0] == targHr;
						if (sameHr && row[0] !== undefined && row[7] !== undefined) {
							var key = row[0] + row[7];
							if (uniques[key] == undefined) ur.push(row);
						}
					} catch (e) {
						console.log('Error when parsing trip_id: ' + row[7]);
					}
				});
			});
			var cols = ['timestamp', 'vehicle_id', 'latitude', 'longitude', 'bearing', 'progress', 'service_date', 'trip_id', 'block_assigned', 'next_stop_id', 'dist_along_route', 'dist_from_stop'];
			ur = cols + '\r\n' + ur.join('\r\n') + '\r\n';

			console.log('Finished processing ' + (allFiles.length - 1) + ' files for hour ' + targHr + '.');
			cb(false, ur);
		}
	};

	function archive (dir, targHr, ar, cb) {
		try {
			var yr = dir.split('-')[0], 
					fn = dir.split('-')[1] + '/' + dir.split('-')[2] + '/' + targHr + '.csv';
			var bSvc = azure.createBlobService(AZURECREDS.archive.account, AZURECREDS.archive.key);
			bSvc.createContainerIfNotExists(yr, {publicAccessLevel : 'container'}, function(err, result, response) {
				if (err) {
					cb(true, 'Failed during archive() for container ' + yr + ' ' + response);
				} else {
					bSvc.createBlockBlobFromText(yr, fn, ar, function (error, result, response){
						if (error) { cb(true, error); } 
						else { cb(false, null); }
					});
				}
			});
		} catch (e) {
			cb(true, 'Failed prior to archive(), with response: ' + e);
		};
	};
};




module.exports = {
	timeBundler: timeBundler,
};





