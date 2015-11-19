var nodemailer = require('nodemailer');
var credentials = require('../credentials.js');

var emailError = function () { console.log('Error occured but not email information included so email alert not sent.'); };

if (credentials.nodemailer == undefined) {
	console.log('Warning: Missing email login information. Logging will NOT be emailed.');

} else {
	var transporter = nodemailer.createTransport({
	  service: credentials.nodemailer.service,
	  auth: {
	    user: credentials.nodemailer.auth.user,
	    pass: credentials.nodemailer.auth.pass
	  }
	});
	
	var mailOptions = {
    from: credentials.nodemailer.options.from,
    to: credentials.nodemailer.options.to,
    subject: 'Bus Monitor Runtime Message',
    text: '',
    html: ''
	};

	emailError = function (errText) {
		try {
			var time = new Date(Date.now()).toUTCString(),
					introPhrase = '<b>[Runtime Error] </b> Something happened at ' + time + ': <br>';
			mailOptions.html = mailOptions.text = [introPhrase, errText].join(' ');
			transporter.sendMail(mailOptions, function (error, info) {
			  if (error) console.log(error, info);
			});
		} catch (e) {
			console.log('Error when trying to run emailError: ' + e);
		}
	};
};

module.exports = {
	emailError: emailError,
};
