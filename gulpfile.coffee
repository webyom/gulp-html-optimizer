gulp = require 'gulp'
coffee = require 'gulp-coffee'
postcss = require 'postcss'
postcssImport = require 'postcss-import'
autoprefixer = require 'autoprefixer'
imgCssSprite = require 'gulp-img-css-sprite'

gulp.task 'compile', ->
	gulp.src('src/**/*.coffee')
		.pipe coffee()
		.pipe gulp.dest('lib')

gulp.task 'sprite', ->
	gulp.src('example/src/**/*.+(jpg|png)')
		.pipe imgCssSprite.imgStream
			padding: 2
		.pipe gulp.dest('example/dest')

gulp.task 'example', ['sprite'], ->
	htmlOptimizer = require './lib/index'
	gulp.src('example/src/**/*.src.html')
		.pipe htmlOptimizer
			generateDataUri: true
			cssSprite: 
				base: 
					url: '//webyom.org'
					dir: 'example/src'
			beautifyTemplate: true
			conservativeCollapseTemplate: true
			trace: true
			postcss: (file, type) ->
				postcss([postcssImport(), autoprefixer browsers: ['last 2 version']])
					.process file.contents.toString(),
						from: file.path
			isRelativeDependency: (dep, isRelative) ->
				if dep is './mod-b'
					false
				else
					isRelative
		.pipe gulp.dest('example/dest')

gulp.task 'default', ['compile']