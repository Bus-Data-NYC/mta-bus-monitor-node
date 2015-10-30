var fs = require('fs');
var mkdirp = require('mkdirp').mkdirp;

var credentials = require('./credentials.js');

var azure = require('azure-storage');
var AZURE_STORAGE_ACCOUNT = credentials.azure.account,
		AZURE_STORAGE_ACCESS_KEY = credentials.azure.key;

module.exports = {
	processVehs: function (data) {
		data = JSON.parse(data);
		if (data !== undefined && data.Siri !== undefined && data.Siri.ServiceDelivery !== undefined) {
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
			var csvBundlercurTime = new Date(Date.now()).toString()
			console.log('Errored/empty results processor at time ' + curTim);
			return [];
		}
	},

	csvBundler: function (vehicles, cb) {
		var cols = ['timestamp', 'vehicle_id', 'latitude', 'longitude', 'bearing', 'progress', 'service_date', 'trip_id', 'block_assigned', 'next_stop_id', 'dist_along_route', 'dist_from_stop'];
		vehicles = cols + '\r\n' + vehicles.join('\r\n') + '\r\n';
		var t = new Date(Date.now()).toISOString().split('T');

		var bSvc = azure.createBlobService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);
		bSvc.createContainerIfNotExists(t[0], {publicAccessLevel : 'container'}, function (error, result, response){
			if (error) {
				console.log('Error creating Azure storage container: ', error);
			} else {
				var fn = t[1].split('.')[0].split(':').join('') + '.csv';
				bSvc.createBlockBlobFromText(t[0], fn, vehicles, function (error, result, response){
					if (error) {
						cb(true, 'Failed to write file at day ' + t[0] + ' at time ' + t[1] + '. Error: ' + err)
					} else {
						cb(false, 'Write success for day ' + t[0] + ' at time ' + t[1] + '.');
					}
				});
			}
		});
	},

	bundler: function () {
		var t = new Date(Date.now()).toISOString().split('T'),
				currHr = t[1].split('.')[0].split(':')[0],
				dir = 'store/' + t[0];
		fs.readdir(dir, function (err, files) {
			if (err) {
				console.log('Error calculating data for day ' + t[0] + ', hour ' + currHr);
			} else {
				files = files.filter(function (ea) { return String(Number(currHr) - 1) == String(ea[0] + ea[1]); });
				dive(dir, files);
			}
		});

		var allFiles = [];
		var ctr = { state: 0, goal: 0, repeat: 0 };
		function dive (dir, files) {
	    files.forEach(function (file, i) {
	      var path = dir + "/" + file;
				fs.readFile(path, 'utf-8', function (err, data) {
					ctr.goal += 1;
				  if (err) {
				    console.log('Error reading this file: ' + path + ': ', err);
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

				  	if (files.length - 1 == i)
				  		parseRead(currHr);
				  }
				});
	    });
		};

		function parseRead (currHr) {
			// ctr is a control against running parseRead without finishing file reads
			if (ctr.goal !== ctr.state) {
				if (ctr.repeat < 25) {
					ctr.repeat += 1;
					console.log('Still waiting to finish loading files...');
					setTimeout(function () { parseRead(currHr) }, 20000);
				} else {
					console.log('Count failed; too many errors.')
				}
			} else {
				var flattened = {};
				allFiles.forEach(function (rows, i1) {
					rows.forEach(function (row, i2) {
						try {
							var hr = row[0].split("T")[1].split(":")[0];
							if (hr == currHr && row[0] !== undefined && row[7] !== undefined) {
								var key = row[0] + row[7];
								if (flattened[key] == undefined) {
									flattened[key] = {
										timestamp: row[0] || null,
										vehicle_id: row[1] || null,
										latitude: row[2] || null,
										longitude: row[3] || null,
										bearing: row[4] || null,
										progress: row[5] || null,
										service_date: row[6] || null,
										trip_id: row[7] || null,
										block_assigned: row[8] || null,
										next_stop_id: row[9] || null,
										dist_along_route: row[10] || null,
										dist_from_stop: row[11] || null
									};
								}
							}
						} catch (e) {
							console.log('Error when parsing trip_id: ' + row[7]);
						}
					});
				});
				console.log('Finished processing ' + (allFiles.length - 1) + ' files for hour ' + currHr + '.');
				// upload resulting files
			}
		};



	}

}
