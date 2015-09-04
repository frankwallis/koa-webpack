var path = require("path");
var events = require("events");

var mime = require("mime");
var MemoryFileSystem = require("memory-fs");

module.exports = function(compiler, options) {
	options = options || {};
	options.watchOptions = options.watchOptions || {};
	options.watchOptions.aggregateTimeout = options.watchOptions.aggregateTimeout || 200;

	var fs = new MemoryFileSystem();
	var emitter = new events.EventEmitter();
	var valid = false;

	function* middleware(next) {
		
		/* get the requested filename */
		var filename = getFilename(this.path);

		/* get the file */
		var content = yield getFileContent(filename);

		/* return it */
		this.body = content;

		/* set some headers */
		this.set("Access-Control-Allow-Origin", "*"); // To support XHR, etc.
		this.set("Content-Type", mime.lookup(filename));
		this.set("Content-Length", content.length);

		if (options.headers) {
			for( var name in options.headers) {
				this.set(name, options.headers[name]);
			}
		}

		/* and we're done */
		yield next;
	}

	function getFilename(filename) {
		var publicPrefix = options.publicPath || "/";

		if (filename == '/')
			return "/index.html";
		else
			return filename.slice(publicPrefix.length -1);
	}

	function* getFileContent(filename) {
		while (!valid) {
			yield emitter.once.bind(emitter, 'done');
			yield process.nextTick;
		}

		var text = yield fs.readFile.bind(fs, filename);

		return text;
	}

	function donePlugin(stats) {
		console.log(stats.toString());
		valid = true;
		emitter.emit('done');
	}

	function invalidatePlugin(compiler, callback) {
		if (valid)
			console.info("webpack: bundle is now INVALID.");

		valid = false;
		if (callback) callback();
	}

	compiler.plugin("invalid", invalidatePlugin);
	compiler.plugin("watch-run", invalidatePlugin);
	compiler.plugin("run", invalidatePlugin);
	compiler.plugin("done", donePlugin);

	compiler.outputFileSystem = fs;

	var watching = compiler.watch(options.watchOptions, function(err) {
		if(err) throw err;
	});

	middleware.invalidate = function() {
		if(watching) watching.invalidate();
	};

	middleware.close = function(callback) {
		callback = callback || function(){};
		if(watching) watching.close(callback);
		else callback();
	};

	return middleware;
}
