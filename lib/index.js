(function() {
  var EOL, Q, _, amdBundler, coffee, compile, compileAmd, compileCoffee, compileCss, compileEs6, compileExtendFile, compileJs, compileLess, compileSass, cssBase64img, cssSprite, extend, extendCache, fs, getParams, getProperty, gulpCssSprite, gutil, htmlBase64img, less, path, replaceProperties, sass, sus, through, traceur;

  _ = require('lodash');

  Q = require('q');

  fs = require('fs');

  path = require('path');

  less = require('gulp-less');

  sass = require('gulp-sass');

  gutil = require('gulp-util');

  through = require('through2');

  traceur = require('traceur');

  coffee = require('gulp-coffee');

  amdBundler = require('gulp-amd-bundler');

  sus = require('gulp-sus');

  gulpCssSprite = require('gulp-img-css-sprite');

  EOL = '\n';

  htmlBase64img = function(data, base, opt) {
    return Q.Promise(function(resolve, reject) {
      if (opt.generateDataUri) {
        data = data.replace(/<img\s([^>]*)src="([^"]+)"/ig, function(full, extra, imgPath) {
          if (!/^data:|\/\//i.test(imgPath)) {
            imgPath = path.resolve(base, imgPath);
            if (fs.existsSync(imgPath)) {
              return '<img ' + extra + 'src="data:image/' + path.extname(imgPath).replace(/^\./, '') + ';base64,' + fs.readFileSync(imgPath, 'base64') + '"';
            } else {
              return full;
            }
          } else {
            return full;
          }
        });
        return resolve(data);
      } else {
        return resolve(data);
      }
    });
  };

  cssBase64img = function(content, filePath, opt) {
    return Q.Promise(function(resolve, reject) {
      if (opt.generateDataUri) {
        return sus.cssContent(content, filePath).then(function(content) {
          return resolve(content);
        }, function(err) {
          return reject(err);
        }).done();
      } else {
        return resolve(content);
      }
    });
  };

  cssSprite = function(content, filePath, opt) {
    return Q.Promise(function(resolve, reject) {
      if (opt.cssSprite) {
        return gulpCssSprite.cssContent(content, filePath, opt.cssSprite).then(function(content) {
          return resolve(content);
        }, function(err) {
          return reject(err);
        }).done();
      } else {
        return resolve(content);
      }
    });
  };

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
        var content;
        content = opt.postcss ? opt.postcss(file, 'less') : file.contents.toString();
        return cssSprite(content, file.path, opt).then(function(content) {
          return cssBase64img(content, file.path, opt);
        }).then(function(content) {
          file.contents = new Buffer([trace + '<style type="text/css">', content, '</style>'].join(EOL));
          resolve(file);
          return next();
        }, function(err) {
          return reject(err);
        }).done();
      }));
      lessStream.on('error', function(e) {
        console.log('gulp-html-optimizer Error:', e.message);
        console.log('file:', file.path);
        return console.log('line:', e.line);
      });
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
        var content;
        content = opt.postcss ? opt.postcss(file, 'scss') : file.contents.toString();
        return cssSprite(content, file.path, opt).then(function(content) {
          return cssBase64img(content, file.path, opt);
        }).then(function(content) {
          file.contents = new Buffer([trace + '<style type="text/css">', content, '</style>'].join(EOL));
          return resolve(file);
        }, function(err) {
          return reject(err);
        }).done();
      });
      sassStream.on('error', function(e) {
        console.log('gulp-html-optimizer Error:', e.message);
        return console.log('file:', file.path);
      });
      return sassStream.write(file);
    });
  };

  compileCss = function(file, opt) {
    return Q.Promise(function(resolve, reject) {
      var content, trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      content = opt.postcss ? opt.postcss(file, 'css') : file.contents.toString();
      return cssSprite(content, file.path, opt).then(function(content) {
        return cssBase64img(content, file.path, opt);
      }).then(function(content) {
        file.contents = new Buffer([trace + '<style type="text/css">', content, '</style>'].join(EOL));
        return resolve(file);
      }, function(err) {
        return reject(err);
      }).done();
    });
  };

  compileEs6 = function(file, plainId, opt) {
    return Q.Promise(function(resolve, reject) {
      var trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      file.contents = new Buffer([plainId ? trace + '<script type="text/html" id="' + plainId + '">' : trace + '<script type="text/javascript">', traceur.compile(file.contents.toString(), opt.traceurOpt), '</script>'].join(EOL));
      return resolve(file);
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
      coffeeStream.on('error', function(e) {
        console.log('gulp-html-optimizer Error:', e.message);
        console.log('file:', file.path);
        return console.log(e.stack);
      });
      return coffeeStream.end(file);
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
        baseDir: baseDir,
        inline: true,
        findVendor: opt.findVendor,
        traceurOpt: opt.traceurOpt,
        reactOpt: opt.reactOpt,
        riotOpt: opt.riotOpt,
        postcss: opt.postcss,
        generateDataUri: opt.generateDataUri,
        cssSprite: opt.cssSprite,
        beautifyTemplate: opt.beautifyTemplate,
        trace: opt.trace,
        isRelativeDependency: opt.isRelativeDependency
      }).then(function(file) {
        var define, exp, factory, outPath, processDefQueue, ref, src;
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
          processDefQueue = baseDir || /\brequire-plugin\b/.test(file.path) ? 'require.processDefQueue();' : 'require.processDefQueue(\'\', require.PAGE_BASE_URL, require.getBaseUrlConfig(require.PAGE_BASE_URL));';
          if (params.out) {
            if ((ref = params.out) === 'yes' || ref === 'true' || ref === '1') {
              outPath = file.path.slice(0, file.path.lastIndexOf(path.extname(file.path))) + '.js';
            } else {
              outPath = path.resolve(path.dirname(baseFile.path), params.out);
            }
            src = params.src;
            if (!src) {
              src = path.relative(path.dirname(baseFile.path), file.path);
              src = src.slice(0, src.lastIndexOf(path.extname(src))) + '.js';
            }
            if (file.contents.toString().slice(-processDefQueue.length) === processDefQueue) {
              fs.writeFileSync(outPath, file.contents.toString());
            } else {
              fs.writeFileSync(outPath, [file.contents.toString(), processDefQueue].join(EOL));
            }
            file.contents = new Buffer(trace + '<script type="text/javascript" src="' + src + '"></script>');
          } else {
            file.contents = new Buffer([params.plainId ? trace + '<script type="text/html" id="' + params.plainId + '">' : trace + '<script type="text/javascript">', file.contents.toString(), processDefQueue, '</script>'].join(EOL));
          }
        }
        return resolve(file);
      }, function(err) {
        return reject(err);
      }).done();
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

  extendCache = {};

  compileExtendFile = function(file, baseFile, extendFilePath, opt) {
    return Q.Promise(function(resolve, reject) {
      var cate, extendFile, ref;
      cate = file._lang_ || 'misc';
      extendFile = (ref = extendCache[cate]) != null ? ref[extendFilePath] : void 0;
      if (!extendFile) {
        extendFile = new gutil.File({
          base: file.base,
          cwd: file.cwd,
          path: extendFilePath,
          contents: fs.readFileSync(extendFilePath)
        });
        if (file._lang_) {
          extendFile._lang_ = file._lang_;
        }
      }
      if (extendFile._compiled_) {
        return resolve(extendFile);
      } else {
        return compile(extendFile, baseFile, null, opt).then((function(_this) {
          return function(extendFile) {
            extendFile._compiled_ = true;
            if (extendCache[cate] == null) {
              extendCache[cate] = {};
            }
            extendCache[cate][extendFile.path] = extendFile;
            return resolve(extendFile);
          };
        })(this), (function(_this) {
          return function(err) {
            return reject(err);
          };
        })(this)).done();
      }
    });
  };

  extend = function(file, baseFile, opt) {
    return Q.Promise(function(resolve, reject) {
      var content, extendFilePath, fileDir;
      content = file.contents.toString();
      fileDir = path.dirname(file.path);
      extendFilePath = '';
      content.replace(/<!--\s*extend\s+(['"])([^'"]+)\1\s*-->/mg, function(full, quote, extendFileName) {
        return extendFilePath = path.resolve(fileDir, extendFileName);
      });
      if (extendFilePath) {
        return compileExtendFile(file, baseFile, extendFilePath, opt).then((function(_this) {
          return function(extendFile) {
            var sectionMap, trace;
            sectionMap = {};
            content.replace(/<!--\s*section\s+(['"])([^'"]+)\1\s*-->([\s\S]*?)<!--\s*\/section\s*-->/mg, function(full, quote, sectionName, sectionContent) {
              return sectionMap[sectionName] = sectionContent;
            });
            content = extendFile.contents.toString();
            content = content.replace(/<!--\s*yield\s+(['"])([^'"]+)\1\s*-->([\s\S]*?)<!--\s*\/yield\s*-->/mg, function(full, quote, yieldName, yieldContent) {
              return sectionMap[yieldName] || yieldContent;
            });
            if (opt.trace) {
              trace = '<!-- trace:' + path.relative(process.cwd(), extendFile.path) + ' -->';
              if (/(<body[^>]*>)/i.test(content)) {
                content = content.replace(/(<body[^>]*>)/i, '$1' + EOL + trace);
              } else {
                content = trace + EOL + content;
              }
            }
            file.contents = new Buffer(content);
            return resolve(file);
          };
        })(this), (function(_this) {
          return function(err) {
            return reject(err);
          };
        })(this)).done();
      } else {
        return resolve(file);
      }
    });
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
      }).replace(/<!--\s*include\s+(['"])([^'"]+)\.(less|scss|es6|coffee|css|js|inc\.[^'"]+)\1\s*(.*?)\s*-->/mg, function(full, quote, incName, ext, params) {
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
        if (ext === 'less') {
          asyncList.push(compileLess(incFile, opt));
        } else if (ext === 'scss') {
          asyncList.push(compileSass(incFile, opt));
        } else if (ext === 'es6') {
          asyncList.push(compileEs6(incFile, params.plainId, opt));
        } else if (ext === 'coffee') {
          asyncList.push(compileCoffee(incFile, params.plainId, opt));
        } else if (ext === 'css') {
          asyncList.push(compileCss(incFile, opt));
        } else if (ext === 'js') {
          asyncList.push(compileJs(incFile, params.plainId, opt));
        } else {
          if (opt.trace) {
            trace = '<!-- trace:' + path.relative(process.cwd(), incFile.path) + ' -->' + EOL;
            incFile.contents = new Buffer(trace + incFile.contents.toString());
          }
          asyncList.push(compile(incFile, baseFile, params, opt));
        }
        return asyncMark;
      }).replace(/<!--\s*require\s+(['"])([^'"]+)\1\s*(.*?)\s*-->/mg, function(full, quote, amdName, params) {
        var amdFile, amdFilePath, asyncMark;
        params = getParams(params);
        asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
        amdFilePath = path.resolve(fileDir, amdName);
        if (fs.existsSync(amdFilePath)) {
          amdFilePath = amdFilePath;
        } else if (fs.existsSync(amdFilePath + '.es6')) {
          amdFilePath = amdFilePath + '.es6';
        } else if (fs.existsSync(amdFilePath + '.coffee')) {
          amdFilePath = amdFilePath + '.coffee';
        } else if (fs.existsSync(amdFilePath + '.tag')) {
          amdFilePath = amdFilePath + '.tag';
        } else if (fs.existsSync(amdFilePath + '.riot.html')) {
          amdFilePath = amdFilePath + '.riot.html';
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
          return content = content.replace('<INC_PROCESS_ASYNC_MARK_' + i + '>', function() {
            return incFile.contents.toString();
          });
        });
        return htmlBase64img(content, path.dirname(file.path), opt).then(function(content) {
          file.contents = new Buffer(content);
          if (!/\.inc\./.test(file.path)) {
            return extend(file, baseFile, opt).then(function(file) {
              return resolve(file);
            }, function(err) {
              return reject(err);
            }).done();
          } else {
            return resolve(file);
          }
        }, function(err) {
          return reject(err);
        }).done();
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
          var content, trace;
          if (/\.src\..+$/.test(file.path)) {
            file.path = file.path.replace(/\.src\.(.+)$/, '\.$1');
          }
          if (opt.trace) {
            trace = '<!-- trace:' + path.relative(process.cwd(), file._originPath_ || file.path) + ' -->';
            content = file.contents.toString();
            if (/(<body[^>]*>)/i.test(content)) {
              content = content.replace(/(<body[^>]*>)/i, '$1' + EOL + trace);
            } else {
              content = trace + EOL + content;
            }
            file.contents = new Buffer(content);
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
