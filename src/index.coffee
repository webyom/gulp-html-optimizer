Q = require 'q'
fs = require 'fs'
path = require 'path'
less = require 'gulp-less'
gutil = require 'gulp-util'
through = require 'through2'
coffee = require 'gulp-coffee'
amdBundler = require 'gulp-amd-bundler'

EOL = '\n'

compileLess = (file, lessOpt) ->
	Q.Promise (resolve, reject) ->
		lessStream = less lessOpt
		lessStream.pipe through.obj(
			(file, enc, next) ->
				file.contents = new Buffer [
					'<style type="text/css">'
						file.contents.toString 'utf8'
					'</style>'
				].join EOL
				resolve file
				next()
		)
		lessStream.end file

compileCoffee = (file, coffeeOpt, plainId) ->
	Q.Promise (resolve, reject) ->
		coffeeStream = coffee coffeeOpt
		coffeeStream.pipe through.obj(
			(file, enc, next) ->
				file.contents = new Buffer [
					if plainId then '<script type="text/html" id="' + plainId + '">' else '<script type="text/javascript">'
					file.contents.toString 'utf8'
					'</script>'
				].join EOL
				resolve file
				next()
		)
		coffeeStream.end file

compileJs = (file, plainId) ->
	Q.Promise (resolve, reject) ->
		file.contents = new Buffer [
			if plainId then '<script type="text/html" id="' + plainId + '">' else '<script type="text/javascript">'
			file.contents.toString 'utf8'
			'</script>'
		].join EOL
		resolve file

compileAmd = (file, baseFile, beautifyTemplate, plainId) ->
	Q.Promise (resolve, reject) ->
		amdBundler.bundle(file, {baseFile: baseFile, inline: true, beautifyTemplate: beautifyTemplate}).then(
			(file) ->
				file.contents = new Buffer [
					if plainId then '<script type="text/html" id="' + plainId + '">' else '<script type="text/javascript">'
					file.contents.toString 'utf8'
					if (/\brequire-plugin\b/).test(file.path) then 'require.processDefQueue();' else 'require.processDefQueue(\'\', require.PAGE_BASE_URL, require.getBaseUrlConfig(require.PAGE_BASE_URL));'
					'</script>'
				].join EOL
				resolve file
			(err) ->
				reject err
		)

compile = (file, baseFile, opt) ->
	Q.Promise (resolve, reject) ->
		content = file.contents.toString 'utf-8'
		content = replaceProperties content, _lang_: file._lang_
		asyncList = []
		content = content.replace(/<!--\s*include\s+(['"])([^'"]+)\.(inc\.html|less|coffee|js)\1(?:\s+plain-id:([\w-]+))?\s*-->/mg, (full, quote, incName, ext, plainId) ->
			asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>'
			incFilePath = path.resolve path.dirname(file.path), incName + '.' + ext
			incFile = new gutil.File
				base: file.base
				cwd: file.cwd
				path: incFilePath
				contents: fs.readFileSync incFilePath
			incFile._lang_ = file._lang_
			if ext is 'inc.html'
				asyncList.push compile(incFile, baseFile, opt)
			if ext is 'less'
				asyncList.push compileLess(incFile, opt.lessOpt)
			if ext is 'coffee'
				asyncList.push compileCoffee(incFile, opt.coffeeOpt, plainId)
			if ext is 'js'
				asyncList.push compileJs(incFile, plainId)
			asyncMark
		).replace(/<!--\s*require\s+(['"])([^'"]+)\1(?:\s+plain-id:([\w-]+))?\s*-->/mg, (full, quote, amdName, plainId) ->
			asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>'
			amdFilePath = path.resolve path.dirname(file.path), amdName
			if fs.existsSync amdFilePath
				amdFilePath = amdFilePath
			else if fs.existsSync amdFilePath + '.coffee'
				amdFilePath = amdFilePath + '.coffee'
			else
				amdFilePath = amdFilePath + '.js'
			amdFile = new gutil.File
				base: file.base
				cwd: file.cwd
				path: amdFilePath
				contents: fs.readFileSync amdFilePath
			asyncList.push compileAmd(amdFile, baseFile, opt.beautifyTemplate, plainId)
			asyncMark
		)
		Q.all(asyncList).then(
			(results) ->
				results.forEach (incFile, i) ->
					content = content.replace '<INC_PROCESS_ASYNC_MARK_' + i + '>', incFile.contents.toString 'utf8'
				file.contents = new Buffer content
				resolve file
			(err) ->
				reject err
		).done()

getProperty = (propName, properties) ->
	tmp = propName.split '.'
	res = properties
	while tmp.length and res
		res = res[tmp.shift()]
	res

replaceProperties = (content, properties) ->
	if not properties
		return content
	content.replace /%{{([\w-\.]+)}}%/g, (full, propName) ->
		res = getProperty propName, properties
		if typeof res is 'string' then res else full

module.exports = (opt = {}) ->
	through.obj (file, enc, next) ->
		return @emit 'error', new gutil.PluginError('gulp-html-optimizer', 'File can\'t be null') if file.isNull()
		return @emit 'error', new gutil.PluginError('gulp-html-optimizer', 'Streams not supported') if file.isStream()
		compile(file, file, opt).then(
			(file) =>
				file.path = file.path.replace /\.src\.html$/, '\.html'
				@push file
				next()
			(err) =>
				@emit 'error', new gutil.PluginError('gulp-html-optimizer', err)
		).done()
