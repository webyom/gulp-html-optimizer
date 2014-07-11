gulp = require 'gulp'
coffee = require 'gulp-coffee'

gulp.task 'compile', ->
	gulp.src('src/**/*.coffee')
		.pipe coffee()
		.pipe gulp.dest('lib')

gulp.task 'example', ->
	htmlOptimizer = require './lib/index'
	through = require 'through2'
	gulp.src('example/src/**/*.src.html')
		.pipe htmlOptimizer
			properties:
				version: '1.0.1'
				author:
					name: 'Gary'
		.pipe gulp.dest('example/dest')

gulp.task 'default', ['compile']