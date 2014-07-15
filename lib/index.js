(function() {
  var EOL, Q, amdBundler, coffee, compile, compileAmd, compileCoffee, compileCss, compileJs, compileLess, fs, getProperty, gutil, less, path, replaceProperties, through;

  Q = require('q');

  fs = require('fs');

  path = require('path');

  less = require('gulp-less');

  gutil = require('gulp-util');

  through = require('through2');

  coffee = require('gulp-coffee');

  amdBundler = require('gulp-amd-bundler');

  EOL = '\n';

  compileLess = function(file, lessOpt) {
    return Q.Promise(function(resolve, reject) {
      var lessStream;
      lessStream = less(lessOpt);
      lessStream.pipe(through.obj(function(file, enc, next) {
        file.contents = new Buffer(['<style type="text/css">', file.contents.toString(), '</style>'].join(EOL));
        resolve(file);
        return next();
      }));
      return lessStream.end(file);
    });
  };

  compileCoffee = function(file, coffeeOpt, plainId) {
    return Q.Promise(function(resolve, reject) {
      var coffeeStream;
      coffeeStream = coffee(coffeeOpt);
      coffeeStream.pipe(through.obj(function(file, enc, next) {
        file.contents = new Buffer([plainId ? '<script type="text/html" id="' + plainId + '">' : '<script type="text/javascript">', file.contents.toString(), '</script>'].join(EOL));
        resolve(file);
        return next();
      }));
      return coffeeStream.end(file);
    });
  };

  compileCss = function(file) {
    return Q.Promise(function(resolve, reject) {
      file.contents = new Buffer(['<style type="text/css">', file.contents.toString(), '</style>'].join(EOL));
      return resolve(file);
    });
  };

  compileJs = function(file, plainId) {
    return Q.Promise(function(resolve, reject) {
      file.contents = new Buffer([plainId ? '<script type="text/html" id="' + plainId + '">' : '<script type="text/javascript">', file.contents.toString(), '</script>'].join(EOL));
      return resolve(file);
    });
  };

  compileAmd = function(file, baseFile, beautifyTemplate, plainId) {
    return Q.Promise(function(resolve, reject) {
      return amdBundler.bundle(file, {
        baseFile: baseFile,
        inline: true,
        beautifyTemplate: beautifyTemplate
      }).then(function(file) {
        file.contents = new Buffer([plainId ? '<script type="text/html" id="' + plainId + '">' : '<script type="text/javascript">', file.contents.toString(), /\brequire-plugin\b/.test(file.path) ? 'require.processDefQueue();' : 'require.processDefQueue(\'\', require.PAGE_BASE_URL, require.getBaseUrlConfig(require.PAGE_BASE_URL));', '</script>'].join(EOL));
        return resolve(file);
      }, function(err) {
        return reject(err);
      });
    });
  };

  compile = function(file, baseFile, opt) {
    return Q.Promise(function(resolve, reject) {
      var asyncList, content;
      content = file.contents.toString();
      content = replaceProperties(content, {
        _lang_: file._lang_
      });
      asyncList = [];
      content = content.replace(/<!--\s*include\s+(['"])([^'"]+)\.(inc\.html|less|coffee|js)\1(?:\s+plain-id:([\w-]+))?\s*-->/mg, function(full, quote, incName, ext, plainId) {
        var asyncMark, incFile, incFilePath;
        asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
        incFilePath = path.resolve(path.dirname(file.path), incName + '.' + ext);
        incFile = new gutil.File({
          base: file.base,
          cwd: file.cwd,
          path: incFilePath,
          contents: fs.readFileSync(incFilePath)
        });
        incFile._lang_ = file._lang_;
        if (ext === 'inc.html') {
          asyncList.push(compile(incFile, baseFile, opt));
        }
        if (ext === 'less') {
          asyncList.push(compileLess(incFile, opt.lessOpt));
        }
        if (ext === 'coffee') {
          asyncList.push(compileCoffee(incFile, opt.coffeeOpt, plainId));
        }
        if (ext === 'css') {
          asyncList.push(compileCss(incFile));
        }
        if (ext === 'js') {
          asyncList.push(compileJs(incFile, plainId));
        }
        return asyncMark;
      }).replace(/<!--\s*require\s+(['"])([^'"]+)\1(?:\s+plain-id:([\w-]+))?\s*-->/mg, function(full, quote, amdName, plainId) {
        var amdFile, amdFilePath, asyncMark;
        asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
        amdFilePath = path.resolve(path.dirname(file.path), amdName);
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
        asyncList.push(compileAmd(amdFile, baseFile, opt.beautifyTemplate, plainId));
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
      return compile(file, file, opt).then((function(_this) {
        return function(file) {
          file.path = file.path.replace(/\.src\.html$/, '\.html');
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
