/*
	SystemJS CommonJS Format
*/
function cjs(loader) {
	loader._extensions.push(cjs);
	loader._determineFormat = Function.prototype;

	// CJS Module Format
	// require('...') || exports[''] = ... || exports.asd = ... || module.exports = ... || Object.defineProperty(module, "exports" ...
	var cjsExportsRegEx = /(?:^\uFEFF?|[^$_a-zA-Z\xA0-\uFFFF.])(exports\s*(\[['"]|\.)|module(\.exports|\['exports'\]|\["exports"\])\s*(\[['"]|[=,\.])|Object.defineProperty\(\s*module\s*,\s*(?:'|")exports(?:'|"))/;
	// RegEx adjusted from https://github.com/jbrantly/yabble/blob/master/lib/yabble.js#L339
	var cjsRequireRegEx = /(?:^\uFEFF?|[^$_a-zA-Z\xA0-\uFFFF."'])require\s*\(\s*("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')\s*\)/g;
	var commentRegEx = /(^|[^\\])(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg;

	var stringRegEx = /("[^"\\\n\r]*(\\.[^"\\\n\r]*)*"|'[^'\\\n\r]*(\\.[^'\\\n\r]*)*')/g;

	function getCJSDeps(source) {
		cjsRequireRegEx.lastIndex = commentRegEx.lastIndex = stringRegEx.lastIndex = 0;

		var deps = [];
		var info = {};

		var match;

		// track string and comment locations for unminified source
		var stringLocations = [], commentLocations = [];

		function inLocation(locations, match) {
			for (var i = 0; i < locations.length; i++)
				if (locations[i][0] < match.index && locations[i][1] > match.index)
					return true;
			return false;
		}

		if (source.length / source.split('\n').length < 200) {
			while (match = stringRegEx.exec(source))
				stringLocations.push([match.index, match.index + match[0].length]);

			while (match = commentRegEx.exec(source)) {
				// only track comments not starting in strings
				if (!inLocation(stringLocations, match))
					commentLocations.push([match.index, match.index + match[0].length]);
			}
		}

		while (match = cjsRequireRegEx.exec(source)) {
			// ensure we're not within a string or comment location
			if (!inLocation(stringLocations, match) && !inLocation(commentLocations, match)) {
				var dep = match[1].substr(1, match[1].length - 2);
				// skip cases like require('" + file + "')
				if (dep.match(/"|'/))
					continue;
				deps.push(dep);
				info[dep] = match.index;

			}
		}

		return {
			deps: deps,
			info: info
		};
	}

	function makeGetImportPosition(load, depInfo){
		var loader = this;
		return function(specifier){
			var position = depInfo[specifier];
			return loader._getLineAndColumnFromPosition(load.source, position);
		};
	}

	var loaderInstantiate = loader.instantiate;
	loader.instantiate = function(load) {

		if (!load.metadata.format) {
			cjsExportsRegEx.lastIndex = 0;
			cjsRequireRegEx.lastIndex = 0;
			if (cjsRequireRegEx.exec(load.source) || cjsExportsRegEx.exec(load.source)) {
				load.metadata.format = 'cjs';
				this._determineFormat(load);
			}
		}

		if (load.metadata.format == 'cjs') {
			var depInfo = getCJSDeps(load.source);
			load.metadata.deps = load.metadata.deps ?
				load.metadata.deps.concat(depInfo.deps) : depInfo.deps;
			load.metadata.getImportPosition = makeGetImportPosition.call(this,
				load, depInfo.info);

			load.metadata.executingRequire = true;

			load.metadata.execute = function(require, exports, module) {
				var dirname = (load.address || '').split('/');
				dirname.pop();
				dirname = dirname.join('/');

				// if on the server, remove the "file:" part from the dirname
				if (System._nodeRequire)
					dirname = dirname.substr(5);

				var globals = loader.global._g = {
					global: loader.global,
					exports: exports,
					module: module,
					require: require,
					__filename: System._nodeRequire ? load.address.substr(5) : load.address,
					__dirname: dirname
				};


				// disable AMD detection
				var define = loader.global.define;
				loader.global.define = undefined;

				var execLoad = {
					name: load.name,
					source: '(function() {\n(function(global, exports, module, require, __filename, __dirname){\n' + load.source +
																	'\n}).call(_g.exports, _g.global, _g.exports, _g.module, _g.require, _g.__filename, _g.__dirname);})();',
					address: load.address
				};
				try {
					loader.__exec(execLoad);
				} catch(ex) {
					if(loader.StackTrace) {
						var st = loader.StackTrace.parse(ex);
						if(!st) {
							ex.stack = new loader.StackTrace(ex.message, [
								loader.StackTrace.item("<anonymous>", load.address, 1, 0)
							]).toString();
						}
					}

					throw ex;
				}


				loader.global.define = define;

				loader.global._g = undefined;
			}
		}

		return loaderInstantiate.call(this, load);
	};
}
