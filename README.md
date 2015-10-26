# mta-bus-monitor-node

## What is this
This is an implementation of Nathan9's web scraper in Node. The tool is currently intended for demonstration purposes and is designed to be used in "bursts." To run, please see below instructions. The purpose of the customization below is to research the different callback strategies possible so as to learn what timing strategy results in the greatest "capture" of MTA Bustime API data. There is, according to the site, a 30 second mandated delay between one response and a subsequent. In order to increase the amount of data scraped, I wrote the customization elements in the code to allow for the tester to indicate where they wanted the 30 second timer to begin in the request object. This allows us to observe differences in the number of unique row responses that result.

## How to run
Make sure to `npm install` if you haven't already. To run: `node app.js` + ` ` +  var1 + ` ` +  var2 + ` ` +  var3


#### Customizable components
var1: Method number val (0,1,2, or 3)

var2: Time of experiment in millseconds (default is 600000 if none specified)

var3: `mtakey` (default is one in your credentials.js, if none in cl or in credentials.js, wont run)


#### Methods
0: Run in the callback after everything has been returned and data compilation/gzip completed

1: run 30 seconds after first response from Bustime API

2: run 30 seconds after first portion of streamed data from Bustime API

3: run this 30 seconds in callback (totally complete response)


#### Calc unique rows
Run `node calcUniques.js`. It will return a numerical value indicating the number of unique rows.



