var fs = require('fs');
var https = require('https');
var path = require('path');

var express = require('express');
var mustache = require('mustache');
var strftime = require('strftime');
var underscore = require('underscore');
var Busboy = require('busboy');

var options = {
	key: fs.readFileSync('cer/mycert1.key', 'utf8'),
	cert: fs.readFileSync('cer/mycert1.cer', 'utf8')
};

var ipasDir = '/home/ipa';
var port = 1234;
var ipAddress = underscore
	.chain(require('os').networkInterfaces())
	.values()
	.flatten()
	.find(function(iface) {
		return iface.family === 'IPv4' && iface.internal === false;
	})
	.value()
	.address;

console.log('https://' + ipAddress + ':' + port + '/download');

var app = express();
app.use('/', express.static(ipasDir));
app.use('/qrcode', express.static(__dirname + '/qrcode'));
app.use('/cer', express.static(__dirname + '/cer'));

app.get(['/', '/download'], function(req, res, next) {

	fs.readFile('download.html', function(err, data) {
		if (err) throw err;
		var template = data.toString();

		var ipas = ipasInLocation(ipasDir);

		var items = [];
		for (var i = ipas.length - 1; i >= 0; i--) {
			items.push(itemWithEnv(ipas[i]));
		};

		items = items.sort(function(a, b) {
			var result = b.time.getTime() - a.time.getTime();
			// if (result > 0) {result = 1} else if (result < 0) { result = -1 };

			return result;
		});

		var info = {};
		info.ip = ipAddress;
		info.port = port;
		info.items = items;
		var rendered = mustache.render(template, info);
		res.send(rendered);
	})
});

app.get('/install/:file', function(req, res) {
	file_name = req.params.file;
	res.writeHead(302, {
		'Location' : 'itms-services://?action=download-manifest&url=https://' + ipAddress + ':' + port + '/plist/' + file_name
	});
	res.end();
});

app.get('/plist/:file', function(req, res) {
	fs.readFile('template.plist', function(err, data) {
		if (err) throw err;
		var template = data.toString();

		file_name = req.params.file;
		var pattern = /(.+)_v(.+)@(.+)/;
		var match = pattern.exec(file_name);

		try {
			var app_name = match[1];
			var bundle_version = match[2];
			var bundle_id = match[3];
		} catch (e) {
			console.log(e);
		}

		var rendered = mustache.render(template, {
			name: req.params.file,
			ip: ipAddress,
			port: port,
			app_name: app_name,
			bundle_id: bundle_id,
			bundle_version: bundle_version,
		});

		res.set('Content-Type', 'text/plain; charset=utf-8');
		res.send(rendered);
	})
});

app.post('/upload', function(req, res) {
	var busboy = new Busboy({ headers: req.headers });
	busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
	  console.log('File [' + fieldname + ']: filename: ' + filename + ', encoding: ' + encoding + ', mimetype: ' + mimetype);
	  var saveTo = path.join(ipasDir, path.basename(filename));
	  file.pipe(fs.createWriteStream(saveTo));
	});
	busboy.on('finish', function() {
	  console.log('Done parsing form!');
	  res.writeHead(200, { Connection: 'close' });
	  res.end("Upload complete!");
	});
	req.pipe(busboy);
});

app.get('/upload.html', function(req, res, next) {

	fs.readFile('upload.html', function(err, data) {
		if (err) throw err;
		res.set('Content-Type', 'text/html; charset=utf-8');
		res.send(data);
	})
});


https.createServer(options, app).listen(port);

function itemWithEnv(env) {
	var stat = fs.statSync(ipasDir + '/' + env + '.ipa');
	var time = new Date(stat.mtime);
	var timeString = strftime('%F %H:%M', time);
	var app_name = env.replace(/@[^]+$/, '')
	return {
		app_name: app_name,
		name: env,
		description: '   更新: ' + timeString,
		time: time,
		ip: ipAddress,
		port: port,
	}
}

function ipasInLocation(location) {
	var result = [];
	var files = fs.readdirSync(location);
	for (var i in files) {
		if (path.extname(files[i]) === ".ipa") {
			result.push(path.basename(files[i], '.ipa'));
		}
	}
	return result;
}
