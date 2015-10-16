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
		console.log('Waiting to finish loading files...')
		setTimeout(doneLoading(), 2000);
	} else {
		var mega = {}
		var flattened = []

		allFiles.forEach(function (rows) {
			rows.forEach(function (row) {
				flattened.push(row);
			});
		});		

		flattened.forEach(function (file) {
			var key = file[0] + file[7];
			mega[key] = file;
		});

		console.log(Object.keys(mega).length);
	}
}


var ctr = {
	state: 0,
	goal: 0
};
var allFiles = [];
dive('store')