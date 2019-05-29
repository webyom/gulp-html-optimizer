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
CleanCSS = require 'clean-css'
UglifyJS = require 'uglify-es'

EOL = '\n'

getDefaultValue = (defaultValue) -> 
	if typeof defaultValue is 'function'
		return defaultValue()
	defaultValue

safeAccess = (obj, props, defaultValue, canBeNull) ->
	return getDefaultValue(defaultValue) if not obj 
	if typeof obj[props] isnt 'undefined'
		return getDefaultValue(defaultValue) if obj[props] is null and not canBeNull
		return obj[props]
	props = props.replace /\[(\w+)\]/g, '.$1'
	props = props.replace /^\./, ''
	propsArr = props.split '.'
	for k, i in propsArr
		if obj and typeof obj is 'object' and Object.prototype.hasOwnProperty.call(obj, k) and (obj[k] isnt null or canBeNull)
			obj = obj[k]
		else
			return getDefaultValue defaultValue
	obj

interpolateTemplate = (tpl, data, opt = {}) -> 
	if not opt.open or not opt.close
		opt.open = '{{'
		opt.close = '}}'
	throw new Error('gulp-html-optimizer: open tag and close tag must not be same!') if opt.open is opt.close
	return tpl
		.split(opt.open)
		.map((part, i) -> 
			return part if i is 0
			parts = part.split opt.close
			len = parts.length
			item = ''
			_getDefaultValue = () -> 
				if typeof opt.defaultValue is 'function'
					opt.defaultValue item.trim()
				else if typeof opt.defaultValue isnt 'undefined'
					String opt.defaultValue
				else
					opt.open + item + opt.close
			if len is 1
				opt.open + part
			else if len is 2
				item = parts[0]
				safeAccess(data, item.trim(), _getDefaultValue) + parts[1]
			else
				item = parts.shift()
				safeAccess(data, item.trim(), _getDefaultValue) + parts.join(opt.close)
		)
		.join ''

minifyJS = (content, file, opt) ->
	content = content.toString()
	if opt.minifyJS
		res = UglifyJS.minify content, _.extend({}, opt.minifyJS)
		if res.error
			res.error.filename = file.path
			console.log res.error
			throw new PluginError('gulp-html-optimizer', 'minifyJS error with file: ' + file.path) 
		content = res.code
	content

minifyCSS = (content, file, opt) ->
	content = content.toString()
	if opt.minifyCSS
		res = new CleanCSS(_.extend({}, opt.minifyCSS)).minify res
		if res.errors and res.errors.length
			console.log res.errors
			throw new PluginError('gulp-html-optimizer', 'minifyCSS error with file: ' + file.path) 
		content = res.styles
	content

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
				Q.Promise((resolve, reject) ->
					if opt.postcss
						opt.postcss(file, 'less').then resolve, reject
					else
						resolve({css: file.contents.toString()})
				).then(
					(res) ->
						content = res.css
						cssSprite(content, file.path, opt).then(
							(content) ->
								cssBase64img(content, file.path, opt)
						).then(
							(content) ->
								file.contents = new Buffer [
									trace + '<style>'
										minifyCSS content, file, opt
									'</style>'
								].join EOL
								resolve file
								next()
							(err) ->
								reject err
						).done()
					(err) ->
						reject err
				)
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
			Q.Promise((resolve, reject) ->
				if opt.postcss
					opt.postcss(file, 'scss').then resolve, reject
				else
					resolve({css: file.contents.toString()})
			).then(
				(res) ->
					content = res.css
					cssSprite(content, file.path, opt).then(
						(content) ->
							cssBase64img(content, file.path, opt)
					).then(
						(content) ->
							file.contents = new Buffer [
								trace + '<style>'
									minifyCSS content, file, opt
								'</style>'
							].join EOL
							resolve file
						(err) ->
							reject err
					).done()
				(err) ->
					reject err
			)
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
		Q.Promise((resolve, reject) ->
			if opt.postcss
				opt.postcss(file, 'css').then resolve, reject
			else
				resolve({css: file.contents.toString()})
		).then(
			(res) ->
				content = res.css
				cssSprite(content, file.path, opt).then(
					(content) ->
						cssBase64img(content, file.path, opt)
				).then(
					(content) ->
						file.contents = new Buffer [
							trace + '<style>'
								minifyCSS content, file, opt
							'</style>'
						].join EOL
						resolve file
					(err) ->
						reject err
				).done()
			(err) ->
				reject err
		)

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
					if plainId then trace + '<script type="text/html" id="' + plainId + '">' else trace + '<script>'
					minifyJS file.contents.toString(), file, opt
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
			if plainId then trace + '<script type="text/html" id="' + plainId + '">' else trace + '<script>'
			minifyJS file.contents.toString(), file, opt
			'</script>'
		].join EOL
		resolve file

compileBabel = (file, attrLeft, attrRight, opt) ->
	Q.Promise (resolve, reject) ->
		opt.babel(file).then (file) ->
			attrLeft = ' ' + attrLeft if attrLeft
			attrRight = ' ' + attrRight if attrRight
			file.contents = new Buffer [
				'<script' + attrLeft + attrRight + '>'
				minifyJS file.contents.toString(), file, opt
				'</script>'
			].join EOL
			resolve file
		, reject

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
			strictModeTemplate: opt.strictModeTemplate
			conservativeCollapseTemplate: opt.conservativeCollapseTemplate
			babel: opt.babel
			trace: opt.trace
			markedOptions: opt.markedOptions
			isRelativeDependency: opt.isRelativeDependency
			cssModuleClassNameGenerator: opt.cssModuleClassNameGenerator
			cssModuleClassNamePlaceholder: opt.cssModuleClassNamePlaceholder
			useExternalCssModuleHelper: opt.useExternalCssModuleHelper
		}).then(
			(file) ->
				if params.render
					define = (id, deps, factory) ->
						factory
					factory = null
					try
						eval 'factory = ' + file.contents.toString().replace(/[\s\S]*\bdefine\(/, 'define(')
					catch err
						console.log file.path
						throw err
					exp = {}
					mod = {}
					factory () ->,
					exp, mod
					if (/\.tpl\.html\.js$/).test file.path
						file.contents = new Buffer trace + exp.render(params)
					else if (/\.md\.js$/).test file.path
						file.contents = new Buffer trace + interpolateTemplate(mod.exports, params, opt.interpolate)
					else
						throw new PluginError('gulp-html-optimizer', 'Unsupported inline render file type: ' + file.path)
				else
					if params.process in ['yes', 'true', '1']
						if baseDir or (/\brequire-plugin\b/).test(file.path)
							processDefQueue = 'require.processDefQueue();'
						else
							processDefQueue = 'require.processDefQueue(\'\', require.PAGE_BASE_URL, require.getBaseUrlConfig(require.PAGE_BASE_URL));'
					else
						processDefQueue = ''
					if params.out in ['no', 'false', '0']
						file.contents = new Buffer [
							if params.plainId then trace + '<script type="text/html" id="' + params.plainId + '">' else trace + '<script>'
							minifyJS file.contents.toString() + EOL + processDefQueue, file, opt
							'</script>'
						].join EOL
					else
						if params.out and params.out not in ['yes', 'true', '1']
							outPath = path.resolve path.dirname(baseFile.path), params.out
						else
							outPath = file.path.slice(0, file.path.lastIndexOf path.extname file.path) + '.js'
						src = params.src
						if not src
							src = path.relative (baseDir || path.dirname(baseFile.path)), file.path
						if baseDir and src.indexOf('.') isnt 0
							src = '/' + src
						if not processDefQueue or file.contents.toString().slice(-processDefQueue.length) is processDefQueue
							fs.writeFileSync outPath, file.contents.toString()
						else
							fs.writeFileSync outPath, [
								file.contents.toString()
								processDefQueue
							].join EOL
						file.contents = new Buffer trace + '<script src="' + src + '"></script>'
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
					if opt.cacheExtend isnt false
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
		content = content.replace(/<!--\s*base-dir\s+(['"])([^'"]+)\1\s*-->/mg, (full, quote, base) ->
			baseDir = base
			''
		)
		content = content.replace(/<script ([^>]*)type="text\/babel"([^>]*)>\s*([\s\S]*?)\s*<\/script>/mg, (full, attrLeft, attrRight, script) ->
			asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>'
			babelFilePath = path.resolve fileDir, '__inline_babel_' + asyncList.length + '__.js'
			babelFile = new Vinyl
				base: file.base
				cwd: file.cwd
				path: babelFilePath
				contents: new Buffer script
			asyncList.push compileBabel(babelFile, attrLeft.trim(), attrRight.trim(), opt)
			asyncMark
		) if opt.babel
		content = content.replace(/<!--\s*include\s+(['"])([^'"]+)\.(less|scss|es6|coffee|css|js|inc\.html)\1\s*(.*?)\s*-->/mg, (full, quote, incName, ext, params) ->
			params = getParams params
			asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>'
			resolvedBaseDir = params.baseDir && path.resolve(fileDir, params.baseDir) || baseDir && path.resolve(fileDir, baseDir) || opt.baseDir && path.resolve(process.cwd(), opt.baseDir)
			if resolvedBaseDir and incName.indexOf('.') isnt 0
				incFilePath = path.join resolvedBaseDir, incName + '.' + ext
			else
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
		)
		content = content.replace(/<!--\s*require\s+(['"])([^'"]+)\1\s*(.*?)\s*-->/mg, (full, quote, amdName, params) ->
			params = getParams params
			return full if opt.optimizeRequire is 'ifAlways' and not params.alwaysOptimize
			asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>'
			resolvedBaseDir = params.baseDir && path.resolve(fileDir, params.baseDir) || baseDir && path.resolve(fileDir, baseDir) || opt.baseDir && path.resolve(process.cwd(), opt.baseDir)
			if resolvedBaseDir and amdName.indexOf('.') isnt 0
				amdFilePath = path.join resolvedBaseDir, amdName
			else
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
			asyncList.push compileAmd(amdFile, baseFile, resolvedBaseDir, params, opt)
			asyncMark
		) if opt.optimizeRequire isnt false
		Q.all(asyncList).then(
			(results) ->
				results.forEach (incFile, i) ->
					content = content.replace '<INC_PROCESS_ASYNC_MARK_' + i + '>', () ->
						incFile.contents.toString()
				htmlBase64img(content, path.dirname(file.path), opt).then(
					(content) ->
						file.contents = new Buffer content
						if not (/\.inc\.html$/).test(file.path)
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
