var credentials = require('../credentials.js');

var azure = require('azure-storage');
var AZURECREDS = credentials.azure;



var bSvc = azure.createBlobService(AZURECREDS.temp.account, AZURECREDS.temp.key);
var bKeys = Object.keys(bSvc);
console.log(bSvc);

// bSvc.createContainerIfNotExists('situations', function(err, result, response) {
// if (err) {
// 	cb(true, 'Failed to create situations container in Azure.');
// } else {
// 		bSvc.createBlockBlobFromText('situations', fn, sx, function (err, result, response){
// 		  if (err) {
// 		    cb(true, 'Error listing blob for ' + dir + ', hour ' + targHr + '. Error res: ' + result);
// 		  } else {
// 		    cb(false, null);
// 		  }
// 		});
// }
// });