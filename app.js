var express = require('express');
var app = express();

app.set('view engine', 'ejs');
app.use('/static',  express.static(__dirname + '/static'));
app.use('/bower_components',  express.static(__dirname + '/bower_components'));

var http = require('http');
var request = require('request');

var zlib = require('zlib');
var fs = require('fs');
var mkdirp = require('mkdirp').mkdirp;

var credentials = require('./credentials.js');

var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));




var url = 'http://api.prod.obanyc.com/api/siri/vehicle-monitoring.json?key=' + credentials.mtakey;



function requestWithEncoding (url, callback) {
	var headers = {
		"accept-charset" : "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
		"accept-language" : "en-US,en;q=0.8",
		"accept" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"user-agent" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/537.13+ (KHTML, like Gecko) Version/5.1.7 Safari/534.57.2",
		"accept-encoding" : "gzip,deflate",
	};

	var options = {
		url: url,
		headers: headers
	};

	var req = request.get(options);

	req.on('response', function(res) {
		var chunks = [];
		res.on('data', function(chunk) {
			chunks.push(chunk);
		});

		res.on('end', function() {
			var buffer = Buffer.concat(chunks);
			var encoding = res.headers['content-encoding'];
			if (encoding == 'gzip') {
				zlib.gunzip(buffer, function(err, decoded) {
					callback(err, decoded && decoded.toString());
				});
			} else if (encoding == 'deflate') {
				zlib.inflate(buffer, function(err, decoded) {
					callback(err, decoded && decoded.toString());
				})
			} else {
				callback(null, buffer.toString());
			}
		});
	});

	req.on('error', function(err) {
		callback(err);
	});
}


function resProcessor (data) {
	data = JSON.parse(data);
	var curTime = Date.now();
	if (data.Siri !== undefined && data.Siri.ServiceDelivery !== undefined) {
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
					timestamp_utc: new Date(veh.RecordedAtTime).getTime(),
					vehicle_id: mvj.VehicleRef.split("_")[1],
					latitude: String(parseFloat(mvj.VehicleLocation.Latitude.toFixed(3))),
					longitude: String(parseFloat(mvj.VehicleLocation.Longitude.toFixed(3))),
					bearing: String(parseFloat(mvj.Bearing.toFixed(3))),
					progress: null,
					service_date: mvj.FramedVehicleJourneyRef.DataFrameRef.split("-").join(""),
					trip_id: mvj.FramedVehicleJourneyRef.DatedVehicleJourneyRef.slice(mvj.FramedVehicleJourneyRef.DatedVehicleJourneyRef.indexOf("_")+1),
					block_assigned: null,
					next_stop_id: null,
					dist_along_route: null,
					dist_from_stop: null
				};

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
					newData.dist_along_route = String(mvj.MonitoredCall.Extensions.Distances.CallDistanceAlongRoute.toFixed(1));
					newData.dist_from_stop = String(mvj.MonitoredCall.Extensions.Distances.DistanceFromCall.toFixed(1));
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
};


function csvBundler (vehicles) {
	var cols = Object.keys(vehicles[0]).join('\r\n') + '\r\n';
	vehicles = cols + vehicles.join('\r\n') + '\r\n';
	var rte_path = 'saves';
	mkdirp(rte_path, function (err) {
		if (err) { 
			console.error('Failed to make file path. Error: ' + err);
		} else {
			rte_path += '/test.csv';
			fs.writeFile(rte_path, vehicles, function (err) {
				if (err) {
					console.error('Failed to write file. Error: ' + err);
				} else {
					console.log('Write success.')
				}
			});
		}
	});
}



requestWithEncoding(url, function(err, data) {
	if (err) {
		console.log('Error on request: ', err);
	} else {
		var vehicles = resProcessor(data);

		// convert each obj in array to a list/array
		vehicles = vehicles.map(function (veh) {
			var keys = Object.keys(veh);
			var res = []
			keys.forEach(function (key) {
				res.push(veh[key]);
			});
			return res;
		}); console.log(vehicles[4])
		
		csvBundler(vehicles);
	}
})



var server = app.listen(3000, function () {
	var host = server.address().address;
	var port = server.address().port;

	console.log('Bus app listening at http://%s:%s', host, port);
});