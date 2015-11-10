# mta-bus-monitor-node

## What is this
This is an implementation of Nathan9's web scraper in Node. The tool is in development and, when complete, will need to be deployed on two virtual machines. The two part program supports operating both the archival and web scraping components necessary for extracting data from the MTA OBA Bustime API at roughly 30 second intervals, per the limitations established on the Bustime API developer page.

## Installing
Make sure to `npm install` if you haven't already. The archiving portion of this application uses SQLite, so make sure you have that installed. Digital Ocean has a (nice rundown)[https://www.digitalocean.com/community/tutorials/how-and-when-to-use-sqlite] of SQLite3 installation and use.

## Running the tool
To run: `npm start` + variables. There are a number of variables that enable the user to adjust various parameters of the application from the command line. They are explained in the below section, customizable compoennts. If there is no desire to "customize" your operation, the only variable you need to be aware of is the first, which controls whether you are running the application in "archive" or "scrape" mode. Leaving this entry blank or entering `scrape` will run the tool in "scrape" mode. Entering `archive` will have it run in `archive` mode.

### Scrape mode and archive mode
Scrape will run an API call to MTA OBA Bustime API at roughly 30 second intervals (the timing of which can be adjusted via a customizable component, described later on). It will upload the resuling data to an Azure cloud database, the details of which are hosted in `credentials.js` under the key `azure`. There are two elements within that. The first is temp, which handles the scraped components and the second is `archive`, which is the blob service that holds the archived, compressed daily aggregates from 24 hours of scraping, run every new day according to UTC.


#### Customizable components
var2: Method number val (0,1,2, or 3)

var3: Time of experiment in millseconds (default is 600000 if none specified). If set to 0 or the string "production," then will run in perpetuity. You can also specify use of 600000 as the timeout period by entering the string "default" as your value, too.

var4: `mtakey` specfication. Default is one in your `credentials.js`. If none is specified in command line or in `credentials.js`, the program won't run. You can also specify use of `credentials.js` variable by entering the string "default" as your value, too.


#### Methods
0: Run in the callback after everything has been returned and data compilation/gzip completed

1: run 30 seconds after first response from Bustime API

2: run 30 seconds after first portion of streamed data from Bustime API

3: run this 30 seconds in callback (totally complete response)


