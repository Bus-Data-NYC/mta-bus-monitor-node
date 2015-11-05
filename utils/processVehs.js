function processVehs (data, cb) {
	try {
		var notReal, hasProp, hasPropAll;

		notReal = (data == undefined || data == null);
		hasProp = (data.hasOwnProperty('Siri') && data.Siri.hasOwnProperty('ServiceDelivery'));

		if (!notReal && hasProp) hasPropAll = data.Siri.ServiceDelivery.hasOwnProperty('VehicleMonitoringDelivery');
		else hasPropAll = false;

		if (hasPropAll) {

			var del = data.Siri.ServiceDelivery,
					vehs = del.VehicleMonitoringDelivery[0]

			// handle all vehicle results
			var vehicles = [];

			var active = vehs.VehicleActivity
			if (active !== undefined || active.length > 0) {
				active.forEach(function (veh, i) {

					// convert timestamp to utc
					var ts = new Date(veh.RecordedAtTime);
					var t_utc = new Date(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate(),  ts.getUTCHours(), ts.getUTCMinutes(), ts.getUTCSeconds());

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
						dist_from_stop: null,
						timestamp: t_utc.toISOString().split(".")[0] + "Z",
					};

					// setting progression index
					if (mvj.ProgressRate == 'normalProgress') {
						newData.progress = String(0); // normal prog
					} else if (mvj.ProgressRate !== undefined) {
						newData.progress = String(2); // layover
					} else {
						newData.progress = String(1); // no progress
					}

					// setting boolean on block assignment
					if (mvj.BlockRef == undefined) {
						newData.block_assigned = String(1);
					} else {
						newData.block_assigned = String(0);
					}

					// trip progress information
					if (mvj.MonitoredCall == undefined) {
						newData.next_stop_id = '\N';
						newData.dist_along_route = '\N';
						newData.dist_from_stop = '\N';
					} else {
						newData.next_stop_id = mvj.MonitoredCall.StopPointRef.slice(4);
						newData.dist_along_route = String(mvj.MonitoredCall.Extensions.Distances.CallDistanceAlongRoute.toFixed(2));
						newData.dist_from_stop = String(mvj.MonitoredCall.Extensions.Distances.DistanceFromCall.toFixed(2));

						// reduce zeroes in the name of space saving
						if (newData.dist_along_route == '0.0') newData.dist_along_route = '0';
						if (newData.dist_from_stop == '0.0') newData.dist_along_route = '0';
					}

					vehicles.push(newData)
				});
				
				cb(false, vehicles);
			}
		} else {
			try { data = data.toString(); } catch (e) { data = '[failed to convert to string]'; }
			cb(true, 'Bad parameters. The data variable missing necessary property attributes. var data = ' + data);
		}
	} catch (e) {
		cb(true, 'Errored during processVehs operation, unknown specifics.');
	}
};

module.exports = {
	processVehs: processVehs,
};




