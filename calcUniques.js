var fs = require('fs');

var dive = function (dir) {

  // Read the directory
  fs.readdir(dir, function (err, list) {

    // Return the error if something went wrong
    if (err) {
    	console.log('Failed to read directory.')
      return false;
    }

    // For every file in the list
    list.forEach(function (file, i) {

      // Full path of that file
      var path = dir + "/" + file;
      // Get the file's stats
      fs.stat(path, function (err, stat) {

        // If the file is a directory
        if (stat && stat.isDirectory()) {
          // Dive into the directory
          dive(path);
        } else {
        	ctr.goal += 1;
          if (i == list.length - 1) {
          	loadUp(null, path, true);
          } else {
          	loadUp(null, path, false);
          }
        }

      });
    });

  });
};


function loadUp (err, file, last) {
	if (err) {
		console.log('Failed to read file');
		ctr.state += 1;
	} else if (file.indexOf('.DS_Store') < 0) {
		fs.readFile(file, 'utf-8', function (err, data) {
			ctr.state += 1;
		  if (err) {
		    throw err; 
		  } else {
		  	var rows = [];
		  	data = data.split('\r\n');
		  	data.shift(); // drop first row
		  	data.forEach(function (row) {
		  		var sp = row.split(',');
		  		// only add if its a complete row
		  		if (sp.length == 12) {
		  			rows.push(sp);
		  		}
		  	});
		  	allFiles.push(rows);
		  	if (last == true) {
		  		doneLoading()
		  	}
		  }
		});
	} else {
		// ignore the .DS_Store files
		ctr.state += 1;
	}
}


function doneLoading () {
	// ctr is a control against running doneLoading without finishing file reads
	if (ctr.goal !== ctr.state) {
		if (ctr.repeat < 100) {
			ctr.repeat += 1;
			console.log('Still waiting to finish loading files...');
			setTimeout(doneLoading(), 2000);
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







