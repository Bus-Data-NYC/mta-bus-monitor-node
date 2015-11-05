var credentials = require('../credentials.js');

var azure = require('azure-storage');
var AZURECREDS = credentials.azure;

function archiveSituationFeed (data, cb) {
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
				d = t[0].split('-').join('/'),
				s = t[1].split('.')[0].split(':').join(''),
				fn = d + '/' + hr + '/' + s + '.json';

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
};

module.exports = {
	archiveSituationFeed: archiveSituationFeed,
}