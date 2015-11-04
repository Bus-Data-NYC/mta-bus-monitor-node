var fs = require('fs');
var mkdirp = require('mkdirp').mkdirp;

var credentials = require('./credentials.js');

var azure = require('azure-storage');
var AZURECREDS = credentials.azure;

module.exports = {

	archiveSituationFeed: function (data, cb) {
		try {
			var d = data.Siri.ServiceDelivery;
			var sx;
			if (d.hasOwnProperty('SituationExchangeDelivery')) {
				sx = '{"SituationExchangeDelivery":' + JSON.stringify(d) + '}';
			} else {
				sx = '{"SituationExchangeDelivery":[]}';
			}
			var t = new Date(Date.now()).toISOString().split('T'),
					hr = Number(t[1].split('.')[0].split(':')[0]) - 1,
					d = t[0].split('-'),
					fn = d[0] + '/' + d[1] + '/' + d[2] + '/' + hr + '.json';

			var bSvc = azure.createBlobService(AZURECREDS.temp.account, AZURECREDS.temp.key);
			bSvc.createContainerIfNotExists('situations', function(err, result, response) {
		    if (err) {
		    	cb(true, 'Failed to create situations container in Azure.');
		    } else {
					bSvc.createBlockBlobFromText('situations', fn, sx, function (err, result, response){
					  if (err) {
					    cb(true, 'Error listing blob for ' + dir + ', hour ' + targHr + '. Error res: ' + result);
					  } else {
					    cb(false, null);
					  }
					});
		    }
			});
		} catch (e) {
			cb(true, 'Failed to handle data.Siri.ServiceDelivery: ' + e);
		}
	},

	processVehs: function (data, cb) {
		if (data !== undefined && typeof data == 'object' && 
				data.Siri !== undefined && data.Siri.ServiceDelivery !== undefined) {
			var del = data.Siri.ServiceDelivery,
					vehs = del.VehicleMonitoringDelivery[0],
					warn = del.SituationExchangeDelivery[0];

			// handle all vehicle results
			var vehicles = [];
			var active = vehs.VehicleActivity
			if (active !== undefined || active.length > 0) {
				active.forEach(function (veh, i) {
					var mvj = veh.MonitoredVehicleJourney;
					var newData = {
						timestamp: null,
						vehicle_id: mvj.VehicleRef.split("_")[1],
						latitude: String(parseFloat(mvj.VehicleLocation.Latitude.toFixed(6))),
						longitude: String(parseFloat(mvj.VehicleLocation.Longitude.toFixed(6))),
						bearing: String(parseFloat(mvj.Bearing.toFixed(2))),
						progress: null,
						service_date: mvj.FramedVehicleJourneyRef.DataFrameRef.split("-").join(""),
						trip_id: mvj.FramedVehicleJourneyRef.DatedVehicleJourneyRef.slice(mvj.FramedVehicleJourneyRef.DatedVehicleJourneyRef.indexOf("_")+1),
						block_assigned: null,
						next_stop_id: null,
						dist_along_route: null,
						dist_from_stop: null
					};

					// convert timestamp to utc
					var ts = new Date(veh.RecordedAtTime);
					var t_utc = new Date(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate(),  ts.getUTCHours(), ts.getUTCMinutes(), ts.getUTCSeconds());
					newData.timestamp = t_utc.toISOString().split(".")[0] + "Z";

					if (mvj.ProgressRate == 'normalProgress') {
						newData.progress = String(0); // normal prog
					} else if (mvj.ProgressRate !== undefined) {
						newData.progress = String(2); // layover
					} else {
						newData.progress = String(1); // no progress
					}

					if (mvj.BlockRef == undefined) {
						newData.block_assigned = String(1);
					} else {
						newData.block_assigned = String(0);
					}

					if (mvj.MonitoredCall == undefined) {
						newData.next_stop_id = '\N';
						newData.dist_along_route = '\N';
						newData.dist_from_stop = '\N';
					} else {
						newData.next_stop_id = mvj.MonitoredCall.StopPointRef.slice(4);
						newData.dist_along_route = String(mvj.MonitoredCall.Extensions.Distances.CallDistanceAlongRoute.toFixed(2));
						newData.dist_from_stop = String(mvj.MonitoredCall.Extensions.Distances.DistanceFromCall.toFixed(2));
						// reduce zeroes for the hell of it
						if (newData.dist_along_route == '0.0') { newData.dist_along_route = '0'; }
						if (newData.dist_from_stop == '0.0') { newData.dist_along_route = '0'; }
					}

					vehicles.push(newData)
				});
				
				return vehicles;
			}
		} else {
			var curTime = new Date(Date.now()).toString();
			cb(true, 'Errored or empty results processor at time ' + curTime)
			return [];
		}
	},

	csvBundler: function (vehicles, cb) {
		var cols = ['timestamp', 'vehicle_id', 'latitude', 'longitude', 'bearing', 'progress', 'service_date', 'trip_id', 'block_assigned', 'next_stop_id', 'dist_along_route', 'dist_from_stop'];
		vehicles = cols + '\r\n' + vehicles.join('\r\n') + '\r\n';
		var t = new Date(Date.now()).toISOString().split('T');

		var bSvc = azure.createBlobService(AZURECREDS.temp.account, AZURECREDS.temp.key);
		bSvc.createContainerIfNotExists(t[0], {publicAccessLevel : 'container'}, function (error, result, response){
			if (error) {
				console.log('Error creating Azure storage container: ', error);
			} else {
				var fn = t[1].split('.')[0].split(':').join('') + '.csv';
				bSvc.createBlockBlobFromText(t[0], fn, vehicles, function (err, result, response){
					if (error) {
						cb(true, 'Failed to write file at day ' + t[0] + ' at time ' + t[1] + '. Error: ' + err)
					} else {
						cb(false, 'Write success for day ' + t[0] + ' at time ' + t[1] + '.');
					}
				});
			}
		});
	},

	bundler: function (dir, targHr, cb) {
		var bSvc = azure.createBlobService(AZURECREDS.temp.account, AZURECREDS.temp.key);
		bSvc.listBlobsSegmented(dir, null, function(err, result) {
		  if (err) {
		    cb(true, 'Error listing blob for ' + dir + ', hour ' + targHr + '. Error res: ' + result);
		  } else {
		    result.entries = result.entries.map(function (e) { return e.name; }).filter(function (e) { return String(targHr) == String(e[0] + e[1]); });
		    dive(bSvc, dir, result.entries, function (err, res) { cb(err, res); });
		  }
		});

		var allFiles = [];
		var ctr = { state: 0, goal: 0, repeat: 0 };

		function dive (bSvc, dir, files, cb) {
			var anyErrors = false;
	    files.forEach(function (file, i) {
	    	if (anyErrors == false) {
					bSvc.getBlobToText(dir, file, function(err, data, meta) {
						ctr.goal += 1;
					  if (err) {
					  	// if any errors occur while parsing any of the files, send an email and kill ops
					  	anyErrors = true;
					    cb(false, 'Error reading file: ' + file + ' in dir: ' + dir + '. Error: ', err);
					  } else {
					  	var rows = [];

					  	data = data.split('\r\n');
					  	data.shift(); // drop first row

					  	data.forEach(function (row) {
					  		var sp = row.split(',');
					  		if (sp.length == 12) // only add if its a complete row
					  			rows.push(sp);
					  	});

					  	ctr.state += 1;
					  	allFiles.push(rows);

					  	if (files.length - 1 == i) {
					  		parseRead(targHr, function (err, res) {
					  			if (err) { cb(true, res); } 
					  			else {
						  			archive(dir, targHr, res, function (err, res) {
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
		};

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
	}

}
