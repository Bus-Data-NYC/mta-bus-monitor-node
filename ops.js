var fs = require('fs');
var mkdirp = require('mkdirp').mkdirp;

module.exports = {
	processVehs: function (data) {
		data = JSON.parse(data);
		var curTime = Date.now();
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
			curTime = new Date(curTime).toString()
			console.log('Errored/empty results processor at time ' + curTim);
		}
	},

	csvBundler: function (vehicles) {
		var cols = ['timestamp', 'vehicle_id', 'latitude', 'longitude', 'bearing', 'progress', 'service_date', 'trip_id', 'block_assigned', 'next_stop_id', 'dist_along_route', 'dist_from_stop'];
		vehicles = cols + '\r\n' + vehicles.join('\r\n') + '\r\n';

		var t = new Date(Date.now()).toISOString().split('T');
		var rte_path = 'store/' + t[0];

		mkdirp(rte_path, function (err) {
			if (err) { 
				console.error('Failed to make file path. Error: ' + err);
			} else {
				rte_path += '/' + t[1].split('.')[0].split(':').join('') + '.csv';
				fs.writeFile(rte_path, vehicles, function (err) {
					if (err) {
						console.error('Failed to write file at day ' + t[0] + ' at time ' + t[1] + '. Error: ' + err);
					} else {
						console.log('Write success for day ' + t[0] + ' at time ' + t[1] + '.')
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
			files = files.filter(function (ea) { return String(Number(currHr) - 1) == String(ea[0] + ea[1]); });
			dive(dir, files);
		});






		var allFiles = [];
		var ctr = { state: 0, goal: 0, repeat: 0 };
		function dive (dir, files) {
	    files.forEach(function (file, i) {
	      var path = dir + "/" + file;
				fs.readFile(file, 'utf-8', function (err, data) {
				  if (err) {
				    console.log('Error reading this file: ' + path + ': ', err);
				  } else {
				  	ctr.goal += 1;
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
				  		parseRead();
				  }
				});
	    });
		};

		function parseRead () {
			// ctr is a control against running parseRead without finishing file reads
			if (ctr.goal !== ctr.state) {
				if (ctr.repeat < 25) {
					ctr.repeat += 1;
					console.log('Still waiting to finish loading files...');
					setTimeout(function () { parseRead() }, 20000);
				} else {
					console.log('Count failed; too many errors.')
				}
			} else {
				var ct = 0;

				allFiles.forEach(function (rows, i1) {

					var flattened = [];
					rows.forEach(function (row, i2) {
						var key = row[0] + row[7];
						flattened.push(key);
					});
					var uniqueArray = flattened.filter(function(item, pos) {
					  return flattened.indexOf(item) == pos;
					});
					console.log('Finished route ' + i1 + ' of ' + (allFiles.length - 1) + ' (Length ' + uniqueArray.length + ')');
					ct += uniqueArray.length;

				});

				console.log('Calculations done: ' + ct + ' unique rows.');
			}
		}


		var ctr = {
				state: 0,
				goal: 0,
				repeat: 0
			},
			allFiles = [],
			folder = process.argv[2] == undefined ?  'store' : process.argv[2];

		dive(folder);






	}

}
