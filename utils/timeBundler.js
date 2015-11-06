var credentials = require('../credentials.js');

var azure = require('azure-storage');
var AZURECREDS = credentials.azure;

function timeBundler (dir, hr, cb) {
	// function global
	var allFiles = [];
	var ctr = { state: 0, goal: 0, repeat: 0 };

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
					// only do anything if anyErrors is false, otherwise just loop out
					if (anyErrors == false) {
						bSvc.getBlobToText(dir, file, function(err, data, meta) {
							ctr.goal += 1;

							if (err) {
								anyErrors = true; // if errors occur with any file, send email, kill ops
								cb(true, 'Error reading file: ' + file + ' in dir: ' + dir + '. Error: ', err);

							} else {
								data = data.split('\r\n');
								var cols = data.shift(); // drop first row, col headers

								var rws = [];
								data.forEach(function (row) {
									var sp = row.split(',');
									if (sp.length == cols.length) rws.push(sp); // only add if its a complete row
								});

								ctr.state += 1;
								allFiles.push(rws);

								// run parseRead() on last file
								if (files.length - 1 == i) {
									callOnReady(ctr, function (err, errMsg) {
										if (err) {
											cb(true, errMsg);
										} else {

											var uniques = {},
													ur =[];

											allFiles.forEach(function (rows, i1) {
												rows.forEach(function (row, i2) {
													try {
														var sameHr = (row[0].split("T")[1].split(":")[0] == hr);
														if (sameHr && row[0] !== undefined && row[7] !== undefined) {
															var key = String(row[0] + row[7]);
															if (uniques[key] == undefined) ur.push(row);
															uniques[key] = true;
														}
													} catch (e) {
														console.log('Error when parsing trip_id: ' + row[7]);
													}
												});
											});

											var cols = ['timestamp', 'vehicle_id', 'latitude', 'longitude', 'bearing', 'progress', 'service_date', 'trip_id', 'block_assigned', 'next_stop_id', 'dist_along_route', 'dist_from_stop'];
											ur = cols + '\r\n' + ur.join('\r\n') + '\r\n';

											var yr = dir.split('-')[0], 
													fn = dir.split('-')[1] + '/' + dir.split('-')[2] + '/' + hr + '.csv';

											var aBlobSvc = azure.createBlobService(AZURECREDS.archive.account, AZURECREDS.archive.key);
											aBlobSvc.createContainerIfNotExists(yr, {publicAccessLevel : 'container'}, function (err, result, response) {
												if (err) {
													cb(true, 'Failed during arch. proc. createContainerIfNotExists() for container ' + yr + ' ' + response);
												} else {
													aBlobSvc.createBlockBlobFromText(yr, fn, ur, function (error, result, response){
														if (error) { 
															cb(true, 'Failed during arch. proc. createBlockBlobFromText() for container: ' + yr + ', file: ' + fn + ': ' + error); 
														} else { 
															cb(false, null); 
														}
													});
												}
											});
										}
									});
								}
							}
						});
					}
				});
			}
		});
	} catch (e) {
		cb(true, 'Error occurred during timeBundler operation: ' + e);
	}

	function callOnReady (ctr, cb) {
		if (ctr.goal !== ctr.state) {
			ctr.repeat += 1;
			if (ctr.repeat < 16) setTimeout(function () { callOnReady(ctr) }, 20000);
			else cb(true, 'parseRead operation failed; too many errors while waiting for `ctr.goal == ctr.state`.');
		} else { cb(false); }
	}

};



module.exports = {
	timeBundler: timeBundler,
};





