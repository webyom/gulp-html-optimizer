gulp = require 'gulp'
coffee = require 'gulp-coffee'
postcss = require 'postcss'
postcssImport = require 'postcss-import'
autoprefixer = require 'autoprefixer-core'

gulp.task 'compile', ->
	gulp.src('src/**/*.coffee')
		.pipe coffee()
		.pipe gulp.dest('lib')

gulp.task 'example', ->
	htmlOptimizer = require './lib/index'
	gulp.src('example/src/**/*.src.html')
		.pipe htmlOptimizer
			beautifyTemplate: true
			trace: true
			postcss: (file) ->
				res = postcss()
					.use postcssImport()
					.use autoprefixer browsers: ['last 2 version']
					.process file.contents.toString(),
						from: file.path
				res.css
		.pipe gulp.dest('example/dest')

gulp.task 'default', ['compile']