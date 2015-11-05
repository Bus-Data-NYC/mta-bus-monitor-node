var credentials = require('../credentials.js');

var azure = require('azure-storage');
var AZURECREDS = credentials.azure;

function csvBundler (vehicles, cb) {
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
};



module.exports = {
	csvBundler: csvBundler,
};
