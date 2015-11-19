var sqlite3 = require('sqlite3').verbose();
var fs = require('fs');

var SQLrefreshTable = require('./timeBundlerSQLib').SQLrefreshTable;
var SQLnewRows = require('./timeBundlerSQLib').SQLnewRows;
var SQLcleanRows = require('./timeBundlerSQLib').SQLcleanRows;

var credentials = require('../credentials.js');

var azure = require('azure-storage');
var AZURECREDS = credentials.azure;

function timeBundler (dir, cb) {

	var globalErrors = [],
			ALLDONE = false;

	var bSvc = azure.createBlobService(AZURECREDS.temp.account, AZURECREDS.temp.key);

	try {
		SQLrefreshTable(function () {
			bSvc.listBlobsSegmented(dir, null, function(err, res) {
				if (err) {
					cb(true, 'Failed during listBlobsSegmented callback.');
				} else {
					if (res.hasOwnProperty('entries') && res.entries.hasOwnProperty('length') && res.entries.length > 0) {

						var files = res.entries.map(function (ea) { return ea.name; }); 

						getAndProcessFile(0);

						function getAndProcessFile (fileIndex) {
							console.log('Running getAndProcessFile on file ' + files[fileIndex] + ' (' + fileIndex + '/' + (files.length - 1) + ')');

							if (fileIndex >= (files.length - 1)) {
								ALLDONE = true;

								SQLcleanRows(function (error, res) {
									if (error) {
										cb(true, 'Error during SQLcleanRows in getAndProcessFile: ' + res);
									} else {
										var archiveSvc = azure.createBlobService(AZURECREDS.archive.account, AZURECREDS.archive.key);
										var inLength = Number(res.size);
										var inStream = fs.createReadStream('uniqueRows_dailyArchive.csv.gz');

										var d = dir.split('-');
										var container = d[0];
										var blobName = d[1] + '/' + d[2] + '.csv.gz';

										archiveSvc.createBlockBlobFromStream(container, blobName, inStream, inLength, function (error, result, response) {
								      if (error) {
								      	cb(true, 'Could not upload compressed file stream: ' + error);
								      } else {
								        cb(false, res);
								      }
										});
									}
								});

							} else {
								var file = files[fileIndex];
								getFile(dir, file, 0, function (err, data) {
									if (err) {
										globalErrors.push('Failed to getFile ' + file + '.');
										getAndProcessFile(fileIndex + 1);
									} else {
										try {
											data = data.split('\r\n');
											var cols = data.shift().split(','); // drop first row, col headers

											var rows = [];
											data.forEach(function (row) {
												var row = row.split(',');
												// only add if its a complete row
												if (row.length == cols.length) {
													var hasBoth = ((row[0] !== undefined) && (row[7] !== undefined));
													var sameAsDir = (row[0].split("T")[0] == dir);
													if (hasBoth && sameAsDir) {
														rows.push(row);
													}
												}
											});

											SQLnewRows(rows, function (error, errorMessage) {
												if (error) {
													globalErrors.push('Failed to add rows to SQL DB from ' + file + ': ' + errorMessage);
												}
												getAndProcessFile(fileIndex + 1);
											});

										} catch (e) {
											globalErrors.push('Unknown error caught during parse of data from ' + file + ' blob.');
										}
									}
								});

								function getFile (dir, file, errors, cb) {
									bSvc.getBlobToText(dir, file, function(err, data, meta) {
										if (err) {
											console.log('Error on getBlobToText: ' + err + ' ' + data + ' ' + meta);

											// try rerunning after a delay a few times if it fails
											if (errors < 5) {
												errors += 1;
												setTimeout(function () { getFile(dir, file, errors, cb); }, 500)

											// if no luck then let's register this as an error
											} else {
												cb(true, null);
											}

										} else {
											cb(false, data);
										}
									});
								};
							}
						};
					} else {
						console.log('No content');
					}
				}
			});
		});
	} catch (e) {
		cb(true, 'Unknown error during listBlobsSegmented operation: ' + e);
	}

	// hacky solution... keeps process from timing out
	(function wait () {if (!ALLDONE) setTimeout(wait, 1000);})();
};

module.exports = {
	timeBundler: timeBundler,
};




