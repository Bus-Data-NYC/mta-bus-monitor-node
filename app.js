var express = require('express');
var app = express();

app.set('view engine', 'ejs');
app.use('/static',  express.static(__dirname + '/static'));
app.use('/bower_components',  express.static(__dirname + '/bower_components'));

var http = require('http');
var request = require('request');
var zlib = require('zlib');

var credentials = require('./credentials.js');

var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));


// up and running with mongodb
var mongoose = require('mongoose'),
		dbLoc = 'mongodb://localhost:27017/' + credentials.dbname;
mongoose.connect(dbLoc);


// model schemas
var Schema = mongoose.Schema;
var routeSchema = new Schema({
  routeId:  String,
  comments: [{ body: String, date: Date }],
  date: { type: Date, default: Date.now }
});


function resProcessor (data) {
	data = JSON.parse(data);
	var curTime = Date.now();
	if (data.Siri !== undefined && data.Siri.ServiceDelivery !== undefined) {
		var del = data.Siri.ServiceDelivery,
				time = new Date(del.ResponseTimestamp).getTime(),
				vehs = del.VehicleMonitoringDelivery[0],
				warn = del.SituationExchangeDelivery[0];

		// handle all vehicle results
		var active = vehs[0].VehicleActivity
		if (active !== undefined) {
			active.forEach(function (ea) {

			});
		}
	} else {
		curTime = new Date(curTime).toString()
		console.log('Error on results processor at time ' + curTim);
	}
};



var headers = {
  "accept-charset" : "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
  "accept-language" : "en-US,en;q=0.8",
  "accept" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "user-agent" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/537.13+ (KHTML, like Gecko) Version/5.1.7 Safari/534.57.2",
  "accept-encoding" : "gzip,deflate",
};

var options = {
  url: 'http://api.prod.obanyc.com/api/siri/vehicle-monitoring.json?key=' + credentials.mtakey,
  headers: headers
};

var requestWithEncoding = function(options, callback) {
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

requestWithEncoding(options, function(err, data) {
  if (err) {
  	console.log('Error on request: ', err);
  } else {
  	console.log('Worked');
  }
})



var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Bus app listening at http://%s:%s', host, port);
});