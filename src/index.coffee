_ = require 'lodash'
Q = require 'q'
fs = require 'fs'
path = require 'path'
less = require 'gulp-less'
sass = require 'gulp-sass'
Vinyl = require 'vinyl'
PluginError = require 'plugin-error'
through = require 'through2'
coffee = require 'gulp-coffee'
amdBundler = require 'gulp-amd-bundler'
sus = require 'gulp-sus'
gulpCssSprite = require 'gulp-img-css-sprite'

EOL = '\n'

htmlBase64img = (data, base, opt) ->
	Q.Promise (resolve, reject) ->
		if opt.generateDataUri
			data = data.replace /<img\s([^>]*)src="([^"]+)"/ig, (full, extra, imgPath) ->
				if not (/^data:|\/\//i).test(imgPath)
					imgPath = path.resolve(base, imgPath)
					if fs.existsSync imgPath
						'<img ' + extra + 'src="data:image/' + path.extname(imgPath).replace(/^\./, '') + ';base64,' + fs.readFileSync(imgPath, 'base64') + '"'
					else
						full
				else
					full
			resolve data
		else
			resolve data

cssBase64img = (content, filePath, opt) ->
	Q.Promise (resolve, reject) ->
		if opt.generateDataUri
			sus.cssContent(content, filePath).then(
				(content) ->
					resolve content
				(err) ->
					reject err
			).done()
		else
			resolve content

cssSprite = (content, filePath, opt) ->
	Q.Promise (resolve, reject) ->
		if opt.cssSprite
			gulpCssSprite.cssContent(content, filePath, opt.cssSprite).then(
				(content) ->
					resolve content
				(err) ->
					reject err
			).done()
		else
			resolve content

compileLess = (file, opt) ->
	Q.Promise (resolve, reject) ->
		if opt.trace
			trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL
		else
			trace = ''
		lessStream = less opt.lessOpt
		lessStream.pipe through.obj(
			(file, enc, next) ->
				content = if opt.postcss then opt.postcss(file, 'less') else file.contents.toString()
				cssSprite(content, file.path, opt).then(
					(content) ->
						cssBase64img(content, file.path, opt)
				).then(
					(content) ->
						file.contents = new Buffer [
							trace + '<style type="text/css">'
								content
							'</style>'
						].join EOL
						resolve file
						next()
					(err) ->
						reject err
				).done()
		)
		lessStream.on 'error', (e) ->
			console.log 'gulp-html-optimizer Error:', e.message
			console.log 'file:', file.path
			console.log 'line:', e.line
		lessStream.end file

compileSass = (file, opt) ->
	Q.Promise (resolve, reject) ->
		if opt.trace
			trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL
		else
			trace = ''
		sassStream = sass opt.sassOpt
		sassStream.on 'data', (file) ->
			content = if opt.postcss then opt.postcss(file, 'scss') else file.contents.toString()
			cssSprite(content, file.path, opt).then(
				(content) ->
					cssBase64img(content, file.path, opt)
			).then(
				(content) ->
					file.contents = new Buffer [
						trace + '<style type="text/css">'
							content
						'</style>'
					].join EOL
					resolve file
				(err) ->
					reject err
			).done()
		sassStream.on 'error', (e) ->
			console.log 'gulp-html-optimizer Error:', e.message
			console.log 'file:', file.path
		sassStream.write file

compileCss = (file, opt) ->
	Q.Promise (resolve, reject) ->
		if opt.trace
			trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL
		else
			trace = ''
		content = if opt.postcss then opt.postcss(file, 'css') else file.contents.toString()
		cssSprite(content, file.path, opt).then(
			(content) ->
				cssBase64img(content, file.path, opt)
		).then(
			(content) ->
				file.contents = new Buffer [
					trace + '<style type="text/css">'
						content
					'</style>'
				].join EOL
				resolve file
			(err) ->
				reject err
		).done()

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
		coffeeStream.on 'error', (e) ->
			console.log 'gulp-html-optimizer Error:', e.message
			console.log 'file:', file.path
			console.log e.stack
		coffeeStream.end file

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

compileAmd = (file, baseFile, baseDir, params, opt) ->
	Q.Promise (resolve, reject) ->
		if opt.trace
			trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL
		else
			trace = ''
		amdBundler.bundle(file, {
			baseFile: baseFile
			baseDir: baseDir
			inline: true
			postcss: opt.postcss
			generateDataUri: opt.generateDataUri
			cssSprite: opt.cssSprite
			beautifyTemplate: opt.beautifyTemplate
			trace: opt.trace
			isRelativeDependency: opt.isRelativeDependency
			cssModuleClassNameGenerator: opt.cssModuleClassNameGenerator
			cssModuleClassNamePlaceholder: opt.cssModuleClassNamePlaceholder
			useExternalCssModuleHelper: opt.useExternalCssModuleHelper
		}).then(
			(file) ->
				if params.render and (/\.tpl\.html\.js$/).test file.path
					define = (id, deps, factory) ->
						factory
					factory = null
					eval 'factory = ' + file.contents.toString()
					exp = {}
					factory null, exp, null
					file.contents = new Buffer trace + exp.render(params)
				else
					if params.process in ['no', 'false']
						processDefQueue = ''
					else if baseDir or (/\brequire-plugin\b/).test(file.path)
						processDefQueue = 'require.processDefQueue();'
					else
						processDefQueue = 'require.processDefQueue(\'\', require.PAGE_BASE_URL, require.getBaseUrlConfig(require.PAGE_BASE_URL));'
					if params.out
						if params.out in ['yes', 'true', '1']
							outPath = file.path.slice(0, file.path.lastIndexOf path.extname file.path) + '.js'
						else
							outPath = path.resolve path.dirname(baseFile.path), params.out
						src = params.src
						if not src
							src = path.relative path.dirname(baseFile.path), file.path
							src = src.slice(0, src.lastIndexOf path.extname src) + '.js'
						if not processDefQueue or file.contents.toString().slice(-processDefQueue.length) is processDefQueue
							fs.writeFileSync outPath, file.contents.toString()
						else
							fs.writeFileSync outPath, [
								file.contents.toString()
								processDefQueue
							].join EOL
						file.contents = new Buffer trace + '<script type="text/javascript" src="' + src + '"></script>'
					else
						file.contents = new Buffer [
							if params.plainId then trace + '<script type="text/html" id="' + params.plainId + '">' else trace + '<script type="text/javascript">'
							file.contents.toString()
							processDefQueue
							'</script>'
						].join EOL
				resolve file
			(err) ->
				reject err
		).done()

getParams = (params) ->
	res = {}
	return res if not params
	r = /([\w\-]+)=(['"])([^'"]*)\2/g
	while m = r.exec params
		res[m[1]] = m[3]
	res

extendCache = {}
compileExtendFile = (file, baseFile, extendFilePath, opt) ->
	Q.Promise (resolve, reject) ->
		cate = file._lang_ or 'misc'
		extendFile = extendCache[cate]?[extendFilePath]
		if not extendFile
			extendFile = new Vinyl
				base: file.base
				cwd: file.cwd
				path: extendFilePath
				contents: fs.readFileSync extendFilePath
			extendFile._lang_ = file._lang_ if file._lang_
		if extendFile._compiled_
			resolve extendFile
		else
			compile(extendFile, baseFile, null, opt).then(
				(extendFile) =>
					extendFile._compiled_ = true
					extendCache[cate] ?= {}
					extendCache[cate][extendFile.path] = extendFile
					resolve extendFile
				(err) =>
					reject err
			).done()

extend = (file, baseFile, opt) ->
	Q.Promise (resolve, reject) ->
		content = file.contents.toString()
		fileDir = path.dirname file.path
		extendFilePath = ''
		content.replace(/<!--\s*extend\s+(['"])([^'"]+)\1\s*-->/mg, (full, quote, extendFileName) ->
			extendFilePath = path.resolve fileDir, extendFileName
		)
		if extendFilePath
			compileExtendFile(file, baseFile, extendFilePath, opt).then(
				(extendFile) =>
					sectionMap = {}
					content.replace(/<!--\s*section\s+(['"])([^'"]+)\1\s*-->([\s\S]*?)<!--\s*\/section\s*-->/mg, (full, quote, sectionName, sectionContent) ->
						sectionMap[sectionName] = sectionContent
					)
					content = extendFile.contents.toString()
					content = content.replace(/<!--\s*yield\s+(['"])([^'"]+)\1\s*-->([\s\S]*?)<!--\s*\/yield\s*-->/mg, (full, quote, yieldName, yieldContent) ->
						sectionMap[yieldName] or yieldContent
					)
					if opt.trace
						trace = '<!-- trace:' + path.relative(process.cwd(), extendFile.path) + ' -->'
						if (/(<body[^>]*>)/i).test content
							content = content.replace /(<body[^>]*>)/i, '$1' + EOL + trace
						else
							content = trace + EOL + content
					file.contents = new Buffer content
					resolve file
				(err) =>
					reject err
			).done()
		else
			resolve file

compile = (file, baseFile, properties, opt) ->
	Q.Promise (resolve, reject) ->
		content = file.contents.toString()
		content = replaceProperties content, _.extend({}, properties, _lang_: file._lang_)
		asyncList = []
		fileDir = path.dirname file.path
		baseDir = ''
		content = content.replace(/<!--\s*require-base-dir\s+(['"])([^'"]+)\1\s*-->/mg, (full, quote, base) ->
			baseDir = base
			''
		).replace(/<!--\s*include\s+(['"])([^'"]+)\.(less|scss|es6|coffee|css|js|inc\.[^'"]+)\1\s*(.*?)\s*-->/mg, (full, quote, incName, ext, params) ->
			params = getParams params
			asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>'
			incFilePath = path.resolve fileDir, incName + '.' + ext
			incFile = new Vinyl
				base: file.base
				cwd: file.cwd
				path: incFilePath
				contents: fs.readFileSync incFilePath
			incFile._lang_ = file._lang_
			if ext is 'less'
				asyncList.push compileLess(incFile, opt)
			else if ext is 'scss'
				asyncList.push compileSass(incFile, opt)
			else if ext is 'coffee'
				asyncList.push compileCoffee(incFile, params.plainId, opt)
			else if ext is 'css'
				asyncList.push compileCss(incFile, opt)
			else if ext is 'js'
				asyncList.push compileJs(incFile, params.plainId, opt)
			else
				if opt.trace
					trace = '<!-- trace:' + path.relative(process.cwd(), incFile.path) + ' -->' + EOL
					incFile.contents = new Buffer trace + incFile.contents.toString()
				asyncList.push compile(incFile, baseFile, params, opt)
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
			amdFile = new Vinyl
				base: file.base
				cwd: file.cwd
				path: amdFilePath
				contents: fs.readFileSync amdFilePath
			asyncList.push compileAmd(amdFile, baseFile, params.baseDir && path.resolve(fileDir, params.baseDir) || baseDir && path.resolve(fileDir, baseDir) || opt.requireBaseDir && path.resolve(process.cwd(), opt.requireBaseDir), params, opt)
			asyncMark
		)
		Q.all(asyncList).then(
			(results) ->
				results.forEach (incFile, i) ->
					content = content.replace '<INC_PROCESS_ASYNC_MARK_' + i + '>', () ->
						incFile.contents.toString()
				htmlBase64img(content, path.dirname(file.path), opt).then(
					(content) ->
						file.contents = new Buffer content
						if not (/\.inc\./).test(file.path)
							extend(file, baseFile, opt).then(
								(file) ->
									resolve file
								(err) ->
									reject err
							).done()
						else
							resolve file
					(err) ->
						reject err
				).done()
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
		return @emit 'error', new PluginError('gulp-html-optimizer', 'File can\'t be null') if file.isNull()
		return @emit 'error', new PluginError('gulp-html-optimizer', 'Streams not supported') if file.isStream()
		compile(file, file, null, opt).then(
			(file) =>
				if (/\.src\..+$/).test file.path
					file.path = file.path.replace /\.src\.(.+)$/, '\.$1'
				if opt.trace
					trace = '<!-- trace:' + path.relative(process.cwd(), file._originPath_ or file.path) + ' -->'
					content = file.contents.toString()
					if (/(<body[^>]*>)/i).test content
						content = content.replace /(<body[^>]*>)/i, '$1' + EOL + trace
					else
						content = trace + EOL + content
					file.contents = new Buffer content
				@push file
				next()
			(err) =>
				@emit 'error', new PluginError('gulp-html-optimizer', err)
		).done()
