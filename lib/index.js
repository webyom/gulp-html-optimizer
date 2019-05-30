(function() {
  var CleanCSS, EOL, PluginError, Q, UglifyJS, Vinyl, _, amdBundler, coffee, compile, compileAmd, compileBabel, compileCoffee, compileCss, compileExtendFile, compileJs, compileLess, compileSass, cssBase64img, cssSprite, extend, extendCache, fs, getDefaultValue, getParams, getProperty, gulpCssSprite, htmlBase64img, interpolateTemplate, less, minifyCSS, minifyJS, path, replaceProperties, safeAccess, sass, sus, through;

  _ = require('lodash');

  Q = require('q');

  fs = require('fs');

  path = require('path');

  less = require('gulp-less');

  sass = require('gulp-sass');

  Vinyl = require('vinyl');

  PluginError = require('plugin-error');

  through = require('through2');

  coffee = require('gulp-coffee');

  amdBundler = require('gulp-amd-bundler');

  sus = require('gulp-sus');

  gulpCssSprite = require('gulp-img-css-sprite');

  CleanCSS = require('clean-css');

  UglifyJS = require('uglify-es');

  EOL = '\n';

  getDefaultValue = function(defaultValue) {
    if (typeof defaultValue === 'function') {
      return defaultValue();
    }
    return defaultValue;
  };

  safeAccess = function(obj, props, defaultValue, canBeNull) {
    var i, j, k, len1, propsArr;
    if (!obj) {
      return getDefaultValue(defaultValue);
    }
    if (typeof obj[props] !== 'undefined') {
      if (obj[props] === null && !canBeNull) {
        return getDefaultValue(defaultValue);
      }
      return obj[props];
    }
    props = props.replace(/\[(\w+)\]/g, '.$1');
    props = props.replace(/^\./, '');
    propsArr = props.split('.');
    for (i = j = 0, len1 = propsArr.length; j < len1; i = ++j) {
      k = propsArr[i];
      if (obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, k) && (obj[k] !== null || canBeNull)) {
        obj = obj[k];
      } else {
        return getDefaultValue(defaultValue);
      }
    }
    return obj;
  };

  interpolateTemplate = function(tpl, data, opt) {
    if (opt == null) {
      opt = {};
    }
    if (!opt.open || !opt.close) {
      opt.open = '{{';
      opt.close = '}}';
    }
    if (opt.open === opt.close) {
      throw new Error('gulp-html-optimizer: open tag and close tag must not be same!');
    }
    return tpl.split(opt.open).map(function(part, i) {
      var _getDefaultValue, item, len, parts;
      if (i === 0) {
        return part;
      }
      parts = part.split(opt.close);
      len = parts.length;
      item = '';
      _getDefaultValue = function() {
        if (typeof opt.defaultValue === 'function') {
          return opt.defaultValue(item.trim());
        } else if (typeof opt.defaultValue !== 'undefined') {
          return String(opt.defaultValue);
        } else {
          return opt.open + item + opt.close;
        }
      };
      if (len === 1) {
        return opt.open + part;
      } else if (len === 2) {
        item = parts[0];
        return safeAccess(data, item.trim(), _getDefaultValue) + parts[1];
      } else {
        item = parts.shift();
        return safeAccess(data, item.trim(), _getDefaultValue) + parts.join(opt.close);
      }
    }).join('');
  };

  minifyJS = function(content, file, opt) {
    var res;
    content = content.toString();
    if (opt.minifyJS) {
      res = UglifyJS.minify(content, _.extend({}, opt.minifyJS));
      if (res.error) {
        res.error.filename = file.path;
        console.log(res.error);
        throw new PluginError('gulp-html-optimizer', 'minifyJS error with file: ' + file.path);
      }
      content = res.code;
    }
    return content;
  };

  minifyCSS = function(content, file, opt) {
    var res;
    content = content.toString();
    if (opt.minifyCSS) {
      res = new CleanCSS(_.extend({}, opt.minifyCSS)).minify(res);
      if (res.errors && res.errors.length) {
        console.log(res.errors);
        throw new PluginError('gulp-html-optimizer', 'minifyCSS error with file: ' + file.path);
      }
      content = res.styles;
    }
    return content;
  };

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
        return Q.Promise(function(resolve, reject) {
          if (opt.postcss) {
            return opt.postcss(file, 'less').then(resolve, reject);
          } else {
            return resolve({
              css: file.contents.toString()
            });
          }
        }).then(function(res) {
          var content;
          content = res.css;
          return cssSprite(content, file.path, opt).then(function(content) {
            return cssBase64img(content, file.path, opt);
          }).then(function(content) {
            file.contents = new Buffer([trace + '<style>', minifyCSS(content, file, opt), '</style>'].join(EOL));
            resolve(file);
            return next();
          }, function(err) {
            return reject(err);
          }).done();
        }, function(err) {
          return reject(err);
        });
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
        return Q.Promise(function(resolve, reject) {
          if (opt.postcss) {
            return opt.postcss(file, 'scss').then(resolve, reject);
          } else {
            return resolve({
              css: file.contents.toString()
            });
          }
        }).then(function(res) {
          var content;
          content = res.css;
          return cssSprite(content, file.path, opt).then(function(content) {
            return cssBase64img(content, file.path, opt);
          }).then(function(content) {
            file.contents = new Buffer([trace + '<style>', minifyCSS(content, file, opt), '</style>'].join(EOL));
            return resolve(file);
          }, function(err) {
            return reject(err);
          }).done();
        }, function(err) {
          return reject(err);
        });
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
      var trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      return Q.Promise(function(resolve, reject) {
        if (opt.postcss) {
          return opt.postcss(file, 'css').then(resolve, reject);
        } else {
          return resolve({
            css: file.contents.toString()
          });
        }
      }).then(function(res) {
        var content;
        content = res.css;
        return cssSprite(content, file.path, opt).then(function(content) {
          return cssBase64img(content, file.path, opt);
        }).then(function(content) {
          file.contents = new Buffer([trace + '<style>', minifyCSS(content, file, opt), '</style>'].join(EOL));
          return resolve(file);
        }, function(err) {
          return reject(err);
        }).done();
      }, function(err) {
        return reject(err);
      });
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
        file.contents = new Buffer([plainId ? trace + '<script type="text/html" id="' + plainId + '">' : trace + '<script>', minifyJS(file.contents.toString(), file, opt), '</script>'].join(EOL));
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
      file.contents = new Buffer([plainId ? trace + '<script type="text/html" id="' + plainId + '">' : trace + '<script>', minifyJS(file.contents.toString(), file, opt), '</script>'].join(EOL));
      return resolve(file);
    });
  };

  compileBabel = function(file, attrLeft, attrRight, opt) {
    return Q.Promise(function(resolve, reject) {
      return opt.babel(file).then(function(file) {
        if (attrLeft) {
          attrLeft = ' ' + attrLeft;
        }
        if (attrRight) {
          attrRight = ' ' + attrRight;
        }
        file.contents = new Buffer(['<script' + attrLeft + attrRight + '>', minifyJS(file.contents.toString(), file, opt), '</script>'].join(EOL));
        return resolve(file);
      }, reject);
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
        postcss: opt.postcss,
        generateDataUri: opt.generateDataUri,
        cssSprite: opt.cssSprite,
        beautifyTemplate: opt.beautifyTemplate,
        strictModeTemplate: opt.strictModeTemplate,
        conservativeCollapseTemplate: opt.conservativeCollapseTemplate,
        babel: opt.babel,
        trace: opt.trace,
        markedOptions: opt.markedOptions,
        isRelativeDependency: opt.isRelativeDependency,
        cssModuleClassNameGenerator: opt.cssModuleClassNameGenerator,
        cssModuleClassNamePlaceholder: opt.cssModuleClassNamePlaceholder,
        useExternalCssModuleHelper: opt.useExternalCssModuleHelper
      }).then(function(file) {
        var define, err, exp, factory, mod, outPath, processDefQueue, ref, ref1, src;
        if (params.render) {
          define = function(id, deps, factory) {
            return factory;
          };
          factory = null;
          try {
            eval('factory = ' + file.contents.toString().replace(/[\s\S]*\bdefine\(/, 'define('));
          } catch (error) {
            err = error;
            console.log(file.path);
            throw err;
          }
          exp = {};
          mod = {};
          factory(function() {}, exp, mod);
          if (/\.tpl\.html\.js$/.test(file.path)) {
            file.contents = new Buffer(trace + exp.render(params));
          } else if (/\.md\.js$/.test(file.path)) {
            file.contents = new Buffer(trace + interpolateTemplate(mod.exports, params, opt.interpolate));
          } else {
            throw new PluginError('gulp-html-optimizer', 'Unsupported inline render file type: ' + file.path);
          }
        } else {
          if ((ref = params.process) === 'no' || ref === 'false' || ref === '0') {
            processDefQueue = '';
          } else if (baseDir || /\brequire-plugin\b/.test(file.path)) {
            processDefQueue = 'require.processDefQueue();';
          } else {
            processDefQueue = 'require.processDefQueue(\'\', require.PAGE_BASE_URL, require.getBaseUrlConfig(require.PAGE_BASE_URL));';
          }
          if ((ref1 = params.inline) === 'yes' || ref1 === 'true' || ref1 === '1') {
            file.contents = new Buffer([params.plainId ? trace + '<script type="text/html" id="' + params.plainId + '">' : trace + '<script>', minifyJS(file.contents.toString() + EOL + processDefQueue, file, opt), '</script>'].join(EOL));
          } else {
            if (params.out) {
              outPath = path.resolve(path.dirname(baseFile.path), params.out);
            } else {
              outPath = file.path.slice(0, file.path.lastIndexOf(path.extname(file.path))) + '.js';
            }
            src = params.src;
            if (!src) {
              src = path.relative(baseDir || path.dirname(baseFile.path), file.path);
            }
            if (baseDir && src.indexOf('.') !== 0) {
              src = '/' + src;
            }
            if (!processDefQueue || file.contents.toString().slice(-processDefQueue.length) === processDefQueue) {
              fs.writeFileSync(outPath, file.contents.toString());
            } else {
              fs.writeFileSync(outPath, [file.contents.toString(), processDefQueue].join(EOL));
            }
            file.contents = new Buffer(trace + '<script src="' + src + '"></script>');
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
        extendFile = new Vinyl({
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
            if (opt.cacheExtend !== false) {
              if (extendCache[cate] == null) {
                extendCache[cate] = {};
              }
              extendCache[cate][extendFile.path] = extendFile;
            }
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
      content = content.replace(/<!--\s*base-dir\s+(['"])([^'"]+)\1\s*-->/mg, function(full, quote, base) {
        baseDir = base;
        return '';
      });
      if (opt.babel) {
        content = content.replace(/<script ([^>]*)type="text\/babel"([^>]*)>\s*([\s\S]*?)\s*<\/script>/mg, function(full, attrLeft, attrRight, script) {
          var asyncMark, babelFile, babelFilePath;
          asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
          babelFilePath = path.resolve(fileDir, '__inline_babel_' + asyncList.length + '__.js');
          babelFile = new Vinyl({
            base: file.base,
            cwd: file.cwd,
            path: babelFilePath,
            contents: new Buffer(script)
          });
          asyncList.push(compileBabel(babelFile, attrLeft.trim(), attrRight.trim(), opt));
          return asyncMark;
        });
      }
      content = content.replace(/<!--\s*include\s+(['"])([^'"]+)\.(less|scss|es6|coffee|css|js|inc\.html)\1\s*(.*?)\s*-->/mg, function(full, quote, incName, ext, params) {
        var asyncMark, incFile, incFilePath, resolvedBaseDir, trace;
        params = getParams(params);
        asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
        resolvedBaseDir = params.baseDir && path.resolve(fileDir, params.baseDir) || baseDir && path.resolve(fileDir, baseDir) || opt.baseDir && path.resolve(process.cwd(), opt.baseDir);
        if (resolvedBaseDir && incName.indexOf('.') !== 0) {
          incFilePath = path.join(resolvedBaseDir, incName + '.' + ext);
        } else {
          incFilePath = path.resolve(fileDir, incName + '.' + ext);
        }
        incFile = new Vinyl({
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
      });
      if (opt.optimizeRequire !== false) {
        content = content.replace(/<!--\s*require\s+(['"])([^'"]+)\1\s*(.*?)\s*-->/mg, function(full, quote, amdName, params) {
          var amdFile, amdFilePath, asyncMark, resolvedBaseDir;
          params = getParams(params);
          if (opt.optimizeRequire === 'ifAlways' && !params.alwaysOptimize) {
            return full;
          }
          asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
          resolvedBaseDir = params.baseDir && path.resolve(fileDir, params.baseDir) || baseDir && path.resolve(fileDir, baseDir) || opt.baseDir && path.resolve(process.cwd(), opt.baseDir);
          if (resolvedBaseDir && amdName.indexOf('.') !== 0) {
            amdFilePath = path.join(resolvedBaseDir, amdName);
          } else {
            amdFilePath = path.resolve(fileDir, amdName);
          }
          if (fs.existsSync(amdFilePath)) {
            amdFilePath = amdFilePath;
          } else if (fs.existsSync(amdFilePath + '.coffee')) {
            amdFilePath = amdFilePath + '.coffee';
          } else {
            amdFilePath = amdFilePath + '.js';
          }
          amdFile = new Vinyl({
            base: file.base,
            cwd: file.cwd,
            path: amdFilePath,
            contents: fs.readFileSync(amdFilePath)
          });
          asyncList.push(compileAmd(amdFile, baseFile, resolvedBaseDir, params, opt));
          return asyncMark;
        });
      }
      return Q.all(asyncList).then(function(results) {
        results.forEach(function(incFile, i) {
          return content = content.replace('<INC_PROCESS_ASYNC_MARK_' + i + '>', function() {
            return incFile.contents.toString();
          });
        });
        return htmlBase64img(content, path.dirname(file.path), opt).then(function(content) {
          file.contents = new Buffer(content);
          if (!/\.inc\.html$/.test(file.path)) {
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
        return this.emit('error', new PluginError('gulp-html-optimizer', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new PluginError('gulp-html-optimizer', 'Streams not supported'));
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
          return _this.emit('error', new PluginError('gulp-html-optimizer', err));
        };
      })(this)).done();
    });
  };

}).call(this);
