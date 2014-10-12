(function() {
  var EOL, Q, amdBundler, coffee, compile, compileAmd, compileCoffee, compileCss, compileJs, compileLess, compileSass, fs, getParams, getProperty, gutil, less, path, replaceProperties, sass, through, _;

  _ = require('lodash');

  Q = require('q');

  fs = require('fs');

  path = require('path');

  less = require('gulp-less');

  sass = require('gulp-sass');

  gutil = require('gulp-util');

  through = require('through2');

  coffee = require('gulp-coffee');

  amdBundler = require('gulp-amd-bundler');

  EOL = '\n';

  compileLess = function(file, opt) {
    return Q.Promise(function(resolve, reject) {
      var lessStream, trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      lessStream = less(opt.lessOpt);
      lessStream.pipe(through.obj(function(file, enc, next) {
        file.contents = new Buffer([trace + '<style type="text/css">', file.contents.toString(), '</style>'].join(EOL));
        resolve(file);
        return next();
      }));
      return lessStream.end(file);
    });
  };

  compileSass = function(file, opt) {
    return Q.Promise(function(resolve, reject) {
      var sassStream, trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      sassStream = sass(opt.sassOpt);
      sassStream.on('data', function(file) {
        file.contents = new Buffer([trace + '<style type="text/css">', file.contents.toString(), '</style>'].join(EOL));
        return resolve(file);
      });
      return sassStream.write(file);
    });
  };

  compileCoffee = function(file, plainId, opt) {
    return Q.Promise(function(resolve, reject) {
      var coffeeStream, trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      coffeeStream = coffee(opt.coffeeOpt);
      coffeeStream.pipe(through.obj(function(file, enc, next) {
        file.contents = new Buffer([plainId ? trace + '<script type="text/html" id="' + plainId + '">' : trace + '<script type="text/javascript">', file.contents.toString(), '</script>'].join(EOL));
        resolve(file);
        return next();
      }));
      return coffeeStream.end(file);
    });
  };

  compileCss = function(file, opt) {
    return Q.Promise(function(resolve, reject) {
      var trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      file.contents = new Buffer([trace + '<style type="text/css">', file.contents.toString(), '</style>'].join(EOL));
      return resolve(file);
    });
  };

  compileJs = function(file, plainId, opt) {
    return Q.Promise(function(resolve, reject) {
      var trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      file.contents = new Buffer([plainId ? trace + '<script type="text/html" id="' + plainId + '">' : trace + '<script type="text/javascript">', file.contents.toString(), '</script>'].join(EOL));
      return resolve(file);
    });
  };

  compileAmd = function(file, baseFile, baseDir, params, opt) {
    return Q.Promise(function(resolve, reject) {
      var trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      return amdBundler.bundle(file, {
        baseFile: baseFile,
        baseDir: baseDir || path.dirname(baseFile.path),
        inline: true,
        beautifyTemplate: opt.beautifyTemplate,
        trace: opt.trace
      }).then(function(file) {
        var define, exp, factory;
        if (params.render && /\.tpl\.html\.js$/.test(file.path)) {
          define = function(id, deps, factory) {
            return factory;
          };
          factory = null;
          eval('factory = ' + file.contents.toString());
          exp = {};
          factory(null, exp, null);
          file.contents = new Buffer(trace + exp.render(params));
        } else {
          file.contents = new Buffer([params.plainId ? trace + '<script type="text/html" id="' + params.plainId + '">' : trace + '<script type="text/javascript">', file.contents.toString(), baseDir || /\brequire-plugin\b/.test(file.path) ? 'require.processDefQueue();' : 'require.processDefQueue(\'\', require.PAGE_BASE_URL, require.getBaseUrlConfig(require.PAGE_BASE_URL));', '</script>'].join(EOL));
        }
        return resolve(file);
      }, function(err) {
        return reject(err);
      });
    });
  };

  getParams = function(params) {
    var m, r, res;
    res = {};
    if (!params) {
      return res;
    }
    r = /([\w\-]+)=(['"])([^'"]*)\2/g;
    while (m = r.exec(params)) {
      res[m[1]] = m[3];
    }
    return res;
  };

  compile = function(file, baseFile, properties, opt) {
    return Q.Promise(function(resolve, reject) {
      var asyncList, baseDir, content, fileDir;
      content = file.contents.toString();
      content = replaceProperties(content, _.extend({}, properties, {
        _lang_: file._lang_
      }));
      asyncList = [];
      fileDir = path.dirname(file.path);
      baseDir = '';
      content = content.replace(/<!--\s*require-base-dir\s+(['"])([^'"]+)\1\s*-->/mg, function(full, quote, base) {
        baseDir = base;
        return '';
      }).replace(/<!--\s*include\s+(['"])([^'"]+)\.(inc\.html|less|scss|coffee|css|js)\1\s*(.*?)\s*-->/mg, function(full, quote, incName, ext, params) {
        var asyncMark, incFile, incFilePath, trace;
        params = getParams(params);
        asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
        incFilePath = path.resolve(fileDir, incName + '.' + ext);
        incFile = new gutil.File({
          base: file.base,
          cwd: file.cwd,
          path: incFilePath,
          contents: fs.readFileSync(incFilePath)
        });
        incFile._lang_ = file._lang_;
        if (ext === 'inc.html') {
          if (opt.trace) {
            trace = '<!-- trace:' + path.relative(process.cwd(), incFile.path) + ' -->' + EOL;
            incFile.contents = new Buffer(trace + incFile.contents.toString());
          }
          asyncList.push(compile(incFile, baseFile, params, opt));
        }
        if (ext === 'less') {
          asyncList.push(compileLess(incFile, opt));
        }
        if (ext === 'scss') {
          asyncList.push(compileSass(incFile, opt));
        }
        if (ext === 'coffee') {
          asyncList.push(compileCoffee(incFile, params.plainId, opt));
        }
        if (ext === 'css') {
          asyncList.push(compileCss(incFile, opt));
        }
        if (ext === 'js') {
          asyncList.push(compileJs(incFile, params.plainId, opt));
        }
        return asyncMark;
      }).replace(/<!--\s*require\s+(['"])([^'"]+)\1\s*(.*?)\s*-->/mg, function(full, quote, amdName, params) {
        var amdFile, amdFilePath, asyncMark;
        params = getParams(params);
        asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
        amdFilePath = path.resolve(fileDir, amdName);
        if (fs.existsSync(amdFilePath)) {
          amdFilePath = amdFilePath;
        } else if (fs.existsSync(amdFilePath + '.coffee')) {
          amdFilePath = amdFilePath + '.coffee';
        } else {
          amdFilePath = amdFilePath + '.js';
        }
        amdFile = new gutil.File({
          base: file.base,
          cwd: file.cwd,
          path: amdFilePath,
          contents: fs.readFileSync(amdFilePath)
        });
        asyncList.push(compileAmd(amdFile, baseFile, params.baseDir && path.resolve(fileDir, params.baseDir) || baseDir && path.resolve(fileDir, baseDir) || opt.requireBaseDir && path.resolve(process.cwd(), opt.requireBaseDir), params, opt));
        return asyncMark;
      });
      return Q.all(asyncList).then(function(results) {
        results.forEach(function(incFile, i) {
          return content = content.replace('<INC_PROCESS_ASYNC_MARK_' + i + '>', incFile.contents.toString());
        });
        file.contents = new Buffer(content);
        return resolve(file);
      }, function(err) {
        return reject(err);
      }).done();
    });
  };

  getProperty = function(propName, properties) {
    var res, tmp;
    tmp = propName.split('.');
    res = properties;
    while (tmp.length && res) {
      res = res[tmp.shift()];
    }
    return res;
  };

  replaceProperties = function(content, properties) {
    if (!properties) {
      return content;
    }
    return content.replace(/%{{([\w-\.]+)}}%/g, function(full, propName) {
      var res;
      res = getProperty(propName, properties);
      if (typeof res === 'string') {
        return res;
      } else {
        return full;
      }
    });
  };

  module.exports = function(opt) {
    if (opt == null) {
      opt = {};
    }
    return through.obj(function(file, enc, next) {
      if (file.isNull()) {
        return this.emit('error', new gutil.PluginError('gulp-html-optimizer', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new gutil.PluginError('gulp-html-optimizer', 'Streams not supported'));
      }
      return compile(file, file, null, opt).then((function(_this) {
        return function(file) {
          var content;
          if (/\.src\.html$/.test(file.path)) {
            if (opt.trace) {
              content = file.contents.toString().replace(/(<body[^>]*>)/i, '$1' + EOL + '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->');
              file.contents = new Buffer(content);
            }
            file.path = file.path.replace(/\.src\.html$/, '\.html');
          }
          _this.push(file);
          return next();
        };
      })(this), (function(_this) {
        return function(err) {
          return _this.emit('error', new gutil.PluginError('gulp-html-optimizer', err));
        };
      })(this)).done();
    });
  };

}).call(this);
