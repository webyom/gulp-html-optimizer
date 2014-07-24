Q = require 'q'
fs = require 'fs'
path = require 'path'
less = require 'gulp-less'
gutil = require 'gulp-util'
through = require 'through2'
coffee = require 'gulp-coffee'
amdBundler = require 'gulp-amd-bundler'

EOL = '\n'

compileLess = (file, opt) ->
	Q.Promise (resolve, reject) ->
		if opt.trace
			trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL
		else
			trace = ''
		lessStream = less opt.lessOpt
		lessStream.pipe through.obj(
			(file, enc, next) ->
				file.contents = new Buffer [
					trace + '<style type="text/css">'
						file.contents.toString()
					'</style>'
				].join EOL
				resolve file
				next()
		)
		lessStream.end file

compileCoffee = (file, plainId, opt) ->
	Q.Promise (resolve, reject) ->
		if opt.trace
			trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL
		else
			trace = ''
		coffeeStream = coffee opt.coffeeOpt
		coffeeStream.pipe through.obj(
			(file, enc, next) ->
				file.contents = new Buffer [
					if plainId then trace + '<script type="text/html" id="' + plainId + '">' else trace + '<script type="text/javascript">'
					file.contents.toString()
					'</script>'
				].join EOL
				resolve file
				next()
		)
		coffeeStream.end file

compileCss = (file, opt) ->
	Q.Promise (resolve, reject) ->
		if opt.trace
			trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL
		else
			trace = ''
		file.contents = new Buffer [
			trace + '<style type="text/css">'
			file.contents.toString()
			'</style>'
		].join EOL
		resolve file

compileJs = (file, plainId, opt) ->
	Q.Promise (resolve, reject) ->
		if opt.trace
			trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL
		else
			trace = ''
		file.contents = new Buffer [
			if plainId then trace + '<script type="text/html" id="' + plainId + '">' else trace + '<script type="text/javascript">'
			file.contents.toString()
			'</script>'
		].join EOL
		resolve file

compileAmd = (file, baseFile, baseDir, plainId, opt) ->
	Q.Promise (resolve, reject) ->
		if opt.trace
			trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL
		else
			trace = ''
		amdBundler.bundle(file, {baseFile: baseFile, baseDir: baseDir || path.dirname(baseFile.path), inline: true, beautifyTemplate: opt.beautifyTemplate, trace: opt.trace}).then(
			(file) ->
				file.contents = new Buffer [
					if plainId then trace + '<script type="text/html" id="' + plainId + '">' else trace + '<script type="text/javascript">'
					file.contents.toString()
					if baseDir or (/\brequire-plugin\b/).test(file.path) then 'require.processDefQueue();' else 'require.processDefQueue(\'\', require.PAGE_BASE_URL, require.getBaseUrlConfig(require.PAGE_BASE_URL));'
					'</script>'
				].join EOL
				resolve file
			(err) ->
				reject err
		)

getParams = (params) ->
	res = {}
	return res if not params
	params = params.split /\s+/
	params.forEach (param) ->
		m = param.match /([\w\-]+)=(['"])([^'"]+)\2/
		if m
			key = m[1].replace /\-(\w)/g, (full, w) -> w.toUpperCase()
			res[key] = m[3]
	res

compile = (file, baseFile, opt) ->
	Q.Promise (resolve, reject) ->
		content = file.contents.toString()
		content = replaceProperties content, _lang_: file._lang_
		asyncList = []
		fileDir = path.dirname file.path
		baseDir = ''
		content = content.replace(/<!--\s*require-base-dir\s+(['"])([^'"]+)\1\s*-->/mg, (full, quote, base) ->
			baseDir = base
			''
		).replace(/<!--\s*include\s+(['"])([^'"]+)\.(inc\.html|less|coffee|css|js)\1\s*(.*?)\s*-->/mg, (full, quote, incName, ext, params) ->
			params = getParams params
			asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>'
			incFilePath = path.resolve fileDir, incName + '.' + ext
			incFile = new gutil.File
				base: file.base
				cwd: file.cwd
				path: incFilePath
				contents: fs.readFileSync incFilePath
			incFile._lang_ = file._lang_
			if ext is 'inc.html'
				if opt.trace
					trace = '<!-- trace:' + path.relative(process.cwd(), incFile.path) + ' -->' + EOL
					incFile.contents = new Buffer trace + incFile.contents.toString()
				asyncList.push compile(incFile, baseFile, opt)
			if ext is 'less'
				asyncList.push compileLess(incFile, opt)
			if ext is 'coffee'
				asyncList.push compileCoffee(incFile, params.plainId, opt)
			if ext is 'css'
				asyncList.push compileCss(incFile, opt)
			if ext is 'js'
				asyncList.push compileJs(incFile, params.plainId, opt)
			asyncMark
		).replace(/<!--\s*require\s+(['"])([^'"]+)\1\s*(.*?)\s*-->/mg, (full, quote, amdName, params) ->
			params = getParams params
			asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>'
			amdFilePath = path.resolve fileDir, amdName
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
			asyncList.push compileAmd(amdFile, baseFile, params.baseDir && path.resolve(fileDir, params.baseDir) || baseDir && path.resolve(fileDir, baseDir), params.plainId, opt)
			asyncMark
		)
		Q.all(asyncList).then(
			(results) ->
				results.forEach (incFile, i) ->
					content = content.replace '<INC_PROCESS_ASYNC_MARK_' + i + '>', incFile.contents.toString()
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
				if (/\.src\.html$/).test file.path
					if opt.trace
						content = file.contents.toString().replace /(<body[^>]*>)/i, '$1' + EOL + '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->'
						file.contents = new Buffer content
					file.path = file.path.replace /\.src\.html$/, '\.html'
				@push file
				next()
			(err) =>
				@emit 'error', new gutil.PluginError('gulp-html-optimizer', err)
		).done()
