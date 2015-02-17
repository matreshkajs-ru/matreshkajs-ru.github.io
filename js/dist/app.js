/**
 * @license almond 0.3.0 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("lib/almond", function(){});

/*
	Matreshka v0.2.0 (2015-02-17)
	JavaScript Framework by Andrey Gubanov
	Released under the MIT license
	More info: http://finom.github.io/matreshka/
*/
!function(a,b){"function"==typeof define&&define.amd?define("xclass",b):a.Class=b()}(this,function(){var a=function(a){return!!a&&("[object Arguments]"===a.toString()||"object"==typeof a&&null!==a&&"length"in a&&"callee"in a)},b=function(){var a,b,c=-1;return"Microsoft Internet Explorer"==navigator.appName&&(a=navigator.userAgent,b=new RegExp("MSIE ([0-9]{1,}[.0-9]{0,})"),null!=b.exec(a)&&(c=parseFloat(RegExp.$1))),c}(),c=document.documentMode,d=8===c,e="Internet Explorer "+b+" doesn't support Class function";if(~b&&8>b)throw Error(e);if(8>c)throw Error(e+'. Switch your "Document Mode" to "Standards"');var f=function(b){var c=i=b.constructor!==Object?b.constructor:function(){},e=b["extends"]=b["extends"]||b.extend,g=e&&e.prototype,h=b["implements"]=b["implements"]||b.implement,i=c,j={};if(delete b.extend,delete b.implement,g){for(var k in g)j[k]="function"==typeof g[k]?function(b){return function(c,d){return d=a(d)?d:Array.prototype.slice.call(arguments,1),b.apply(c,d)}}(g[k]):g[k];j.constructor=function(b){return function(c,d){return d=a(d)?d:Array.prototype.slice.call(arguments,1),b.apply(c,d)}}(g.constructor)}return d?(b.prototype=null,b.constructor=null,c=function(){if(this instanceof c){var a=new XDomainRequest;for(var b in c.prototype)"constructor"!==b&&(a[b]=c.prototype[b]);return a.hasOwnProperty=c.prototype.hasOwnProperty,i.apply(a,arguments),a}i.apply(this,arguments)},b.constructor=c,c.prototype=b,c.parent=j,e&&f.IEInherits(c,e)):(b.constructor=c,c.prototype=b,c.parent=j,e&&f.inherits(c,e)),h&&h.validate(c.prototype),c.same=function(){return function(){return c.apply(this,arguments)}},this instanceof f?new c:c};return f.inherits=function(a,b){var c=a.prototype,d=function(){};d.prototype=b.prototype,a.prototype=new d,a.prototype.constructor=a;for(var e in c)a.prototype[e]=c[e];a.prototype.instanceOf=function(a){return this instanceof a}},f.IEInherits=function(a,b){for(var c,d=a.prototype.hasOwnProperty,e=a.prototype.constructor,f=Object.prototype.hasOwnProperty;b;)c=c||b.prototype.hasOwnProperty,a.prototype=function(a,b){var c,d={};for(c in a)d[c]=a[c];for(c in b)d[c]=b[c];return d}(b.prototype,a.prototype),b=b.prototype&&b.prototype["extends"]&&b.prototype["extends"].prototype;d!==f?a.prototype.hasOwnProperty=d:c!==f&&(a.prototype.hasOwnProperty=c),a.prototype.constructor=e,a.prototype.instanceOf=function(b){for(var c=a;c;){if(c===b)return!0;c=c.prototype["extends"]}return!1}},f.Interface=function g(a,b){var c,d={},e=function(a){return"object"==typeof a&&null!==a&&"length"in a};if(a instanceof g){for(var f in a.propsMap)d[f]=1;c=e(b)?b:[].slice.call(arguments,1)}else c=e(a)?a:arguments;for(f=0;f<c.length;f++)d[c[f]]=1;this.propsMap=d,this.validate=function(a){for(var b in this.propsMap)if("function"!=typeof a[b])throw Error('[Class.Interface] Method "'+b+'" is not implemented in '+(a.constructor.name||a.name||"given")+" prototype")}},f.isXDR=d,f}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/polyfills/addeventlistener",b):b()}(this,function(){!function(a,b,c,d){b[c]||(Element.prototype[c]=a[c]=b[c]=function(b,c,d){return(d=this).attachEvent("on"+b,function(b){var b=b||a.event;b.target=b.target||b.srcElement,b.preventDefault=b.preventDefault||function(){b.returnValue=!1},b.stopPropagation=b.stopPropagation||function(){b.cancelBubble=!0},b.which=b.button?2===b.button?3:4===b.button?2:b.button:b.keyCode,c.call(d,b)})},Element.prototype[d]=a[d]=b[d]=function(a,b){return this.detachEvent("on"+a,b)})}(window,document,"addEventListener","removeEventListener")}),function(a,b){"function"==typeof define&&define.amd?define("balalaika",["matreshka_dir/polyfills/addeventlistener"],b):a.$b=b()}(this,function(){return function(a,b,c,d,e,f,g,h,i,j,k,l){return l=function(a,b){return new l.i(a,b)},l.i=function(d,e){c.push.apply(this,d?d.nodeType||d==a?[d]:""+d===d?/</.test(d)?((h=b.createElement(e||"div")).innerHTML=d,h.children):(e&&l(e)[0]||b).querySelectorAll(d):/f/.test(typeof d)?/c/.test(b.readyState)?d():l(b).on("DOMContentLoaded",d):d:c)},l.i[k="prototype"]=(l.extend=function(a){for(j=arguments,h=1;h<j.length;h++)if(k=j[h])for(i in k)a[i]=k[i];return a})(l.fn=l[k]=c,{on:function(a,b){return a=a.split(d),this.map(function(c){(d[h=a[0]+(c.b$=c.b$||++e)]=d[h]||[]).push([b,a[1]]),c["add"+f](a[0],b)}),this},off:function(a,b){return a=a.split(d),k="remove"+f,this.map(function(c){if(j=d[a[0]+c.b$],h=j&&j.length)for(;i=j[--h];)b&&b!=i[0]||a[1]&&a[1]!=i[1]||(c[k](a[0],i[0]),j.splice(h,1));else!a[1]&&c[k](a[0],b)}),this},is:function(a){return h=this[0],i=!!h&&(h.matches||h["webkit"+g]||h["moz"+g]||h["ms"+g]),!!i&&i.call(h,a)}}),l}(window,document,[],/\.(.+)/,0,"EventListener","MatchesSelector")}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/polyfills/classlist",b):b()}(this,function(){function a(a){this.el=a;for(var b=a.className.replace(/^\s+|\s+$/g,"").split(/\s+/),c=0;c<b.length;c++)f.call(this,b[c])}function b(a,b,c){Object.defineProperty?Object.defineProperty(a,b,{get:c}):a.__defineGetter__(b,c)}var c=function(a,b){return"boolean"==typeof b?this[b?"add":"remove"](a):this[this.contains(a)?"remove":"add"](a),this.contains(a)};if(window.DOMTokenList){var d=document.createElement("a");d.classList.toggle("x",!1),d.className&&(window.DOMTokenList.prototype.toggle=c)}if(!("undefined"==typeof window.Element||"classList"in document.documentElement)){var e=Array.prototype,f=e.push,g=e.splice,h=e.join;a.prototype={add:function(a){this.contains(a)||(f.call(this,a),this.el.className=this.toString())},contains:function(a){return-1!=this.el.className.indexOf(a)},item:function(a){return this[a]||null},remove:function(a){if(this.contains(a)){for(var b=0;b<this.length&&this[b]!=a;b++);g.call(this,b,1),this.el.className=this.toString()}},toString:function(){return h.call(this," ")},toggle:c},window.DOMTokenList=a,b(Element.prototype,"classList",function(){return new a(this)})}}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/balalaika-extended",["balalaika","matreshka_dir/polyfills/classlist"],b):b(a.$b)}(this,function(a){var b,c,d="classList";if(!a)throw new Error("Balalaika is missing");return b=a.fn.on,c=a.fn.off,a.extend(a.fn,{on:function(a,c){return a.split(/\s/).forEach(function(a){b.call(this,a,c)},this),this},off:function(a,b){return a.split(/\s/).forEach(function(a){c.call(this,a,b)},this),this},hasClass:function(a){return!!this[0]&&this[0][d].contains(a)},addClass:function(a){return this.forEach(function(b){var c=b[d];c.add.apply(c,a.split(/\s/))}),this},removeClass:function(a){return this.forEach(function(b){var c=b[d];c.remove.apply(c,a.split(/\s/))}),this},toggleClass:function(a,b){return this.forEach(function(c){var e=c[d];"boolean"!=typeof b&&(b=!e.contains(a)),e[b?"add":"remove"].apply(e,a.split(/\s/))}),this},add:function(b){var c=a(this),d=function(a,b){for(var c=0;c<a.length;c++)if(a[c]===b)return c};b=a(b).slice(),[].push.apply(c,b);for(var e=c.length-b.length;e<c.length;e++)([].indexOf?c.indexOf(c[e]):d(c,c[e]))!==e&&c.splice(e--,1);return c},find:function(b){var c=a();return this.forEach(function(d){c=c.add(a(b,d))}),c}}),a.parseHTML=function(b){var c,d,e=document.createElement("div"),f={option:[1,"<select multiple='multiple'>","</select>"],legend:[1,"<fieldset>","</fieldset>"],thead:[1,"<table>","</table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],col:[2,"<table><tbody></tbody><colgroup>","</colgroup></table>"],area:[1,"<map>","</map>"],_:[0,"",""]};for(b=b.replace(/^\s+|\s+$/g,""),f.optgroup=f.option,f.tbody=f.tfoot=f.colgroup=f.caption=f.thead,f.th=f.td,c=f[/<([\w:]+)/.exec(b)[1]]||f._,e.innerHTML=c[1]+b+c[2],d=c[0];d--;)e=e.children[0];return a(e.children)},a.create=function(b,c){var d=document.createElement(b);if(c)for(var e in c)d[e]&&"object"==typeof c?a.extend(d[e],c[e]):d[e]=c[e];return d},function(a,b,c,d,e,f){return a.documentMode<9&&(f=b.i[d="prototype"],b.i=function(g,h){for(e=g?g&&g.nodeType||g===window?[g]:""+g===g?/</.test(g)?((c=a.createElement("div")).innerHTML=g,c.children):(h&&b(h)[0]||a).querySelectorAll(g):/f/.test(typeof g)?/c/.test(a.readyState)?g():!function i(b){/in/(a.readyState)?setTimeout(i,9,b):b()}(g):g:f,d=[],c=e?e.length:0;c--;d[c]=e[c]);f.push.apply(this,d)},b.i[d]=f,f.is=function(a){var b,c=this[0],d=c.parentNode.querySelectorAll(a);for(b=0;b<d.length;b++)if(d[b]===c)return!0;return!1}),b}(document,a),a}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/dollar-lib",["matreshka_dir/balalaika-extended"],b):a.__DOLLAR_LIB=b(a.$b)}(this,function(a){var b,c=["on","off","is","hasClass","addClass","removeClass","toggleClass","add","find"],d=["parseHTML"],e=function(){return this}().$,f=!0;if("function"==typeof e){for(b=0;b<c.length;b++)if(!e.prototype[c[b]]){f=!1;break}for(b=0;b<d.length;b++)if(!e[d[b]]){f=!1;break}}else f=!1;return f?e:a}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/polyfills/number.isnan",b):b()}(this,function(){Number.isNaN=Number.isNaN||function(a){return"number"==typeof a&&isNaN(a)}}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/matreshka-core",["xclass","balalaika","matreshka_dir/dollar-lib","matreshka_dir/polyfills/number.isnan"],b):a.MK=a.Matreshka=b(a.Class,a.$b,a.__DOLLAR_LIB)}(this,function(a,b,c){if(!a)throw new Error("Class function is missing");if(![].forEach)throw Error("If you're using Internet Explorer 8 you should use es5-shim: https://github.com/kriskowal/es5-shim");var d,e={list:{},add:function(a){a.on&&("function"==typeof a.on?a.on.call(a.el,a.handler):c(a.el).on(a.on.split(/\s/).join(".mk ")+".mk",a.handler)),(this.list[a.instance.__id]=this.list[a.instance.__id]||[]).push(a)},rem:function(a){var b,d=this.list[a.instance.__id];if(d)for(var e=0;e<d.length;e++)b=d[e],b.el===a.el&&(a.instance.off("__beforechange:"+a.key,b.mkHandler),c(a.el).off(b.on+".mk",b.handler),this.list[a.instance.__id].splice(e--,1))}},f=function(a,b){window.console&&console.warn&&!f[a]&&(console.warn("Method Matreshka"+a+" is deprecated. Please use Matreshka"+b+" instead."),f[a]=!0)},g=d=a({isMK:!0,isMKInitialized:!1,on:function(a,b,c,d,e){if(!b)throw Error('callback is not function for event(s) "'+a+'"');var f,g=this;a=a.replace(/\s+/g," ").replace(/^\s+|\s+$/g,"").split(/\s(?![^(]*\))/g),"boolean"!=typeof c&&"undefined"!=typeof c&&(f=d,d=c,c=f);for(var h=0;h<a.length;h++)g._on(a[h],b,d,e);return c===!0&&b.call(d||g,{triggeredOnInit:!0}),g},_on:function(a,b,d,e){var f,g,i,j,k,l,m,n,o=a.indexOf("@"),p=this,q=d||p;return~o?(i=a.slice(0,o),a=a.slice(o+1),j=function(c){var e=p[i];e&&e.isMK&&e.on(a,b,q),c&&c.previousValue&&c.previousValue.isMK&&c.previousValue.off(a,b,d)},j._callback=b,p.on("change:"+i,j,!0,p,a)):(f=p.__events[a]||(p.__events[a]=[]),g={callback:b,context:d,ctx:q,xtra:e},f.some(function(a){return a.callback===g.callback&&a.callback._callback===g.callback&&a.context===g.context})||(f.push(g),0===a.indexOf("change:")&&p.makeSpecial(a.replace("change:","")),m=a.split("::"),n=m[0],i=m[1],i&&(l=function(){var b=[].slice.call(arguments);h(b[0],{self:p,element:this,elements:c(this),key:i}),b.unshift(a),p.trigger.apply(p,b)},j=function(a){var b=a&&a.elements||p.__special[i]&&p.__special[i].elements,c=n+"."+p.__id+i;b&&b.on(c,l)},k=function(a){a.elements&&a.elements.off(n+"."+p.__id+i,l)},j._callback=k._callback=b,p.on("bind:"+i,j,!0),p.on("unbind:"+i,k)))),p},once:function(a,b,c){if(!b)throw Error('callback is not function for event "'+a+'"');var d=this,e=function(a){var b,c=!1;return function(){return c?b:(c=!0,b=a.apply(this,arguments),a=null,b)}};a=a.split(/\s/);for(var f=0;f<a.length;f++)!function(a){var f=e(function(){d.off(a,f),b.apply(this,arguments)});f._callback=b,d.on(a,f,c)}(a[f]);return this},off:function(a,b,c){if(!a&&!b&&!c)return this.events={},this;a=a.replace(/\s+/g," ").replace(/^\s+|\s+$/g,"").split(/\s(?![^(]*\))/g);for(var d=0;d<a.length;d++)this._off(a[d],b,c)},_off:function(a,b,c){var d,e,f,g,h,i,j=a.indexOf("@"),k=this;if(~j){if(g=a.slice(0,j),a=a.slice(j+1),b)k.off("change:"+g,b,c);else{f=k.__events["change:"+g]||[];for(var l=0;l<f.length;l++)f[l].xtra===a&&k.off("change:"+g,f[l].callback)}k[g]&&k[g].isMK&&k[g].off(a,b,c)}else if(f=k.__events[a]){if(k.__events[a]=d=[],b||c)for(var m=0;m<f.length;m++)e=f[m],(b&&b!==e.callback&&b!==e.callback._callback||c&&c!==e.context)&&d.push(e);d.length||delete k.__events[a],h=a.split("::"),i=h[0],g=h[1],g&&k.__special[g]&&(k.__special[g].elements.off(i+"."+k.__id+g),k.off("bind:"+g,b),k.off("unbind:"+g,b))}return k},trigger:function(a){var b,c=Array.prototype.slice.call(arguments,1),d=this.__events.all,e=function(a,b){for(var c,d=-1,e=a.length;++d<e;)(c=a[d]).callback.apply(c.ctx,b||[])};if(a){a=a.split(/\s/);for(var f=0;f<a.length;f++)b=this.__events[a[f]],b&&e(b,c);d&&a[0].indexOf("__")&&e(d,c)}return this},lookForBinder:function(a){for(var b,c=g.defaultBinders,d=0;d<c.length;d++)if(b=c[d].call(a,a))return b;return{}},bindElement:function(a,b,d,f){var i,j,k,l=this,m=a in this;if(this.eq(a)&&(a="__this__"),a instanceof Array){for(k=0;k<a.length;k++)this.bindElement(a[k][0],a[k][1],a[k][2]||f,b);return this}if("string"==typeof a&&(j=a.split(/\s/),j.length>1)){for(k=0;k<j.length;k++)this.bindElement(j[k],b,d,f);return this}if("object"==typeof a){for(k in a)a.hasOwnProperty(k)&&this.bindElement(k,a[k],b,d);return this}if(this.makeSpecial(a),i=c(b),!i.length)throw Error('Matreshka.js Error: Bound Element is missing for key "'+a+'"');return this.__special[a].elements=this.__special[a].elements.add(i),g.each(i,function(b){var c,f=null!==d?h("__this__"===a?{}:l.lookForBinder(b),d):{},g={self:l,key:a,elements:i,element:b};f.initialize&&f.initialize.call(b,g),f.setValue&&(c=function(){var c=l[a];f.setValue.call(b,c,h({value:c},g))},l.on("__beforechange:"+a,c),!m&&f.getValue?l.__special[a].value=f.getValue.call(b,g):m&&c()),f.getValue&&f.on&&e.add({el:b,on:f.on,instance:l,key:a,mkHandler:c,handler:function(c){var d=l[a],e=f.getValue.call(b,h({value:d,event:c},g));e!==d&&l.set(a,e,{fromElement:!0})}})}),f&&f.silent||this.trigger("bind:"+a,h({key:a,elements:i,element:i[0]||null},f)),this},unbindElement:function(a,b,d){var f,i;if(this.eq(a)&&(a="__this__"),a instanceof Array){for(var j=0;j<a.length;j++)d=b,this.unbindElement(a[j][0],a[j][1]||d,d);return this}if("string"==typeof a&&(i=a.split(/\s/),i.length>1)){for(j=0;j<i.length;j++)this.unbindElement(i[j],b,d);return this}if("object"==typeof a&&null!==a){for(var j in a)a.hasOwnProperty(j)&&this.unbindElement(j,a[j],b);return this}if(null===a){for(a in this.__special)this.__special.hasOwnProperty(a)&&this.unbindElement(a,b,d);return this}return b?(f=c(b),g.each(f,function(a){e.rem({el:a,instance:this})},this),d&&d.silent||this.trigger("unbind:"+a,h({key:a,elements:f,element:f[0]||null},d)),this):this.__special[a]&&this.__special[a].elements?this.unbindElement(a,this.__special[a].elements,d):this},boundAll:function(a){var b,d,e=this.__special;if(a=a!==this&&a?a:"__this__",b="string"==typeof a?a.split(/\s/):a,b.length<=1)return b[0]in e?e[b[0]].elements:c();d=c();for(var f=0;f<b.length;f++)d=d.add(e[b[f]].elements);return d},$bound:function(a){return this.boundAll(a)},bound:function(a){var b,c=this.__special;if(a=a!==this&&a?a:"__this__",b="string"==typeof a?a.split(/\s/):a,b.length<=1)return b[0]in c?c[b[0]].elements[0]:null;for(var d=0;d<b.length;d++)if(b[d]in c&&c[b[d]].elements.length)return c[b[d]].elements[0];return null},$el:function(a){return f("#$el","#boundAll"),this.boundAll(a)},el:function(a){return f("#el","#bound"),this.bound(a)},selectAll:function(a){return this.boundAll().find(a)},$:function(a){return this.selectAll(a)},select:function(a){var b=this.bound();return b&&b.querySelector(a)},makeSpecial:function(a){var b=this.__special[a];return b||(b=this.__special[a]={elements:c(),value:this[a],getter:function(){return b.value},setter:function(b){this.set(a,b,{fromSetter:!0})},mediator:null},Object.defineProperty(this,a,{configurable:!0,get:function(){return b.getter.call(this)},set:function(a){b.setter.call(this,a)}})),b},eq:function(a){return"object"==typeof a&&null!==a&&this.__id===a.__id},defineGetter:function(a,b){if("object"==typeof a){for(var c in a)a.hasOwnProperty(c)&&this.defineGetter(c,a[c]);return this}var d=this.makeSpecial(a);return d.getter=function(){return b.call(this,{value:d.value,key:a,self:this})}.bind(this),this},defineSetter:function(a,b){if("object"==typeof a){for(var c in a)a.hasOwnProperty(c)&&this.defineSetter(c,a[c]);return this}return this.makeSpecial(a).setter=function(c){return b.call(this,c,{value:c,key:a,self:this})}.bind(this),this},setMediator:function(a,b){var c=this;if("object"==typeof a&&!(a instanceof Array)){for(var d in a)a.hasOwnProperty(d)&&this.setMediator(d,a[d]);return c}a="string"==typeof a?a.split(/\s/):a;for(var d=0;d<a.length;d++)(function(a){var d=c.makeSpecial(a);d.mediator=function(e){return b.call(c,e,d.value,a,c)},d.value=d.mediator(d.value)})(a[d]);return c},addDependency:function(a,b,c,d){var e,f,b="string"==typeof b?b.split(/\s/):b,g=function(d){var g=[],j=d._protect=d._protect||d.key+this.__id;if(j!==a+i.__id){if("object"==typeof b[0])for(var k=0;k<b.length;k+=2)e=b[k],f=b[k+1],g.push(e[f]);else for(var k=0;k<b.length;k++)f=b[k],e=i,g.push(e[f]);i.set(a,c.apply(i,g),h({},d,{fromDependency:!0}))}},i=this;if(c=c||function(a){return a},"object"==typeof b[0])for(var j=0;j<b.length;j+=2)e=b[j],f=b[j+1],e.makeSpecial(f),e.on("__afterchange:"+f,g);else for(var j=0;j<b.length;j++)f=b[j],e=this,e.makeSpecial(f),e.on("__afterchange:"+f,g);return d!==!1&&g.call("object"==typeof b[0]?b[0]:this,{key:"object"==typeof b[0]?b[1]:b[0]}),this},addDependence:function(){return f("#addDependence","#addDependency"),this.addDependency.apply(this,arguments)},get:function(a){return this[a]},set:function(a,b,c){if("undefined"==typeof a)return this;if("object"==typeof a&&a!==this){for(var d in a)a.hasOwnProperty(d)&&this.set(d,a[d],b);return this}if(!this.__special||!this.__special[a])return this[a]=b,this;var e,f=this.__special[a],g=f.value;return c=c||{},e=f.mediator&&b!==g&&!c.skipMediator?f.mediator.call(this,b,g,a,this):b,f.value=e,e===b||Number.isNaN(e)||this.set(a,e,{silent:!0,forceHTML:!0,skipMediator:!0}),(e!==g||c.force||c.forceHTML)&&(c=h({},c,{value:e,previousValue:g,key:a,element:f.elements[0]||null,elements:f.elements,self:this}),this.trigger("__beforechange:"+a,c)),e===g&&!c.force||c.silent||this.trigger("change:"+a,c).trigger("change",c),(e!==g||c.force||c.forceHTML)&&this.trigger("__afterchange:"+a,c),this},remove:function(a,b){var c,d=String(a).split(/\s/);b=h({keys:d},b);for(var e=0;e<d.length;e++)if(c=d[e]in this){b.key=d[e],b.value=this[d[e]],this.unbindElement(d[e]).off("change:"+d[e]),delete this.__special[d[e]];try{delete this[d[e]]}catch(f){}b&&b.silent||this.trigger("delete",b).trigger("delete:"+d[e],b)}return this},define:function(a,b){if("object"==typeof a){for(var c in a)this.define(c,a[c]);return this}return Object.defineProperty(this,a,b),this},defineNotEnum:function(a,b){if("object"==typeof a){for(var c in a)this.defineNotEnum(c,a[c]);return this}return g.isXDR?Object.defineProperty(this,a,{get:function(){return b},set:function(a){b=a},configurable:!0}):Object.defineProperty(this,a,{value:b,enumerable:!1,writable:!0,configurable:!0}),this},initMK:function(){return this.isMKInitialized||(this.defineNotEnum({__id:"mk"+(new Date).getTime()+Math.random(),__events:{},__special:{}}),this.isMKInitialized=!0),this},toString:function(){return"[object Matreshka]"},constructor:function(){this.initMK()}}),h=g.extend=function(a,b){for(var c=1;c<arguments.length;c++){b=arguments[c];for(var d in b)b.hasOwnProperty(d)&&(a[d]=b[d])}return a};return h(g,{Class:a,$:c,$b:b,useAs$:function(a){return g.$=c=a},useBalalaika:function(){f(".useBalalaika",".useAsDOMLib"),g.$=c=b},usejQuery:function(){f(".usejQuery",".useAsDOMLib"),g.$=c=jQuery},isXDR:a.isXDR,defaultBinders:g.elementProcessors=[],htmlp:{setValue:function(a){f(".htmlp",".binders.innerHTML"),this.innerHTML=null===a?"":a}},classp:function(a){var b=!a.indexOf("!");return b&&(a=a.replace("!","")),f(".classp",".binders.className"),{setValue:function(d){c(this).toggleClass(a,b?!d:!!d)}}},noop:function(){},each:function(a,b,c){if(a){if("length"in a)[].forEach.call(a,b,c);else for(var d in a)a.hasOwnProperty(d)&&b.call(c,a[d],d,a);return a}},procrastinate:function(a,b,c){var d;return"number"!=typeof b&&(c=b,b=0),function(){var e=arguments,f=this;clearTimeout(d),d=setTimeout(function(){a.apply(c||f,e)},b||0)}}}),g.defaultBinders.push(function(a){return"INPUT"===a.tagName&&"checkbox"===a.type?{on:"click keyup",getValue:function(){return this.checked},setValue:function(a){this.checked=a}}:"INPUT"===a.tagName&&"radio"===a.type?{on:"click keyup",getValue:function(){return this.value},setValue:function(a){this.checked=this.value==a}}:"INPUT"===a.tagName||"TEXTAREA"===a.tagName?{on:"keyup paste",getValue:function(){return this.value},setValue:function(a){this.value=a}}:"SELECT"===a.tagName?{on:"change",getValue:function(){return this.value},setValue:function(a){if(this.value=a,!a)for(var b=this.options.length-1;b>=0;b--)this.options[b].value===a&&(this.options[b].selected=!0)}}:void 0}),d}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/matreshka-object",["matreshka_dir/matreshka-core"],b):b(a.MK)}(this,function(a){var b;if(!a)throw new Error("Matreshka is missing");return a.Object=a.Class({"extends":a,isMKObject:!0,constructor:function(a){this.initMK(),a&&this.jset(a)},keys:function(){var a=[];for(var b in this._keys)this._keys.hasOwnProperty(b)&&a.push(b);return a},initMK:function(){return a.Object.parent.initMK(this,arguments),this.defineNotEnum("_keys",{}).on("remove",function(a){a&&a.silent||this.trigger("modify",a)}).on("change",function(a){a&&a.key in this._keys&&!a.silent&&this.trigger("modify",a)})},_on:function(b,c,d,e){var f,g=this;return 0===b.indexOf("@")?(b=b.slice(1),f=function(a){var e=g[a.key];e&&e.isMK&&a&&a.key in g._keys&&e.on(b,c,!1,d||g)},g.each(function(a){a.isMK&&a.on(b,c,!1,d||g)},g),f._callback=c,g.on("change",f,g,!0,b)):a.prototype._on.call(g,b,c,d,e),this},_off:function(b,c,d){var e=this;if(0===b.indexOf("@")){if(b=b.slice(1),c)e.off("change",c,d);else{events=e.__events.change||[];for(var f=0;f<events.length;f++)events[f].xtra===b&&e.off("change",events[f].callback)}e.each(function(a){a.isMK&&a.off(b,c,d)},e)}else a.prototype._off.call(e,b,c,d);return this},hasOwnProperty:function(a){return this._keys.hasOwnProperty(a)},toObject:function(){var a={},b=this._keys;for(var c in b)b.hasOwnProperty(c)&&(a[c]=this[c]);return a},toNative:function(){return this.toObject()},toJSON:function(){var a={},b=this._keys;for(var c in b)b.hasOwnProperty(c)&&(a[c]=this[c]&&this[c].toJSON?this[c].toJSON():this[c]);return a},keyOf:function(a){var b=this._keys;for(var c in b)if(b.hasOwnProperty(c)&&a===b[c])return c;return null},jset:function(a,c,d){if("undefined"==typeof a)return this;if("object"==typeof a){for(b in a)this.jset(b,a[b],c);return this}return this._keys[a]=1,this.makeSpecial(a),this.set(a,c,d)},remove:function(b,c){return this.removeJSONKeys(b),a.Object.parent.remove(this,b,c)},addJSONKeys:function(a){if(!arguments.length)return this;for(a=arguments.length>1?arguments:a instanceof Array?a:String(a).split(/\s/),b=0;b<a.length;b++)this._keys[a[b]]=1,this.makeSpecial(a[b]);return this},removeJSONKeys:function(a){if(!arguments.length)return this;for(a=arguments.length>1?arguments:a instanceof Array?a:String(a).split(/\s/),b=0;b<a.length;b++)delete this._keys[a[b]];return this},each:function(a,b){for(var c in this._keys)this._keys.hasOwnProperty(c)&&a.call(b,this[c],c,this);return this}})}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/matreshka-array",["matreshka_dir/matreshka-core"],b):b(a.MK)}(this,function(a){if(!a)throw new Error("Matreshka is missing");var b,c=Array.prototype,d=1,e=2,f=3,g=4,h=5,i=6,j=function(j,k,l){return c[k]?j===d?function(){var a=this.toArray();return c[k].apply(a,arguments),this}:j===e?function(){var b=this.toArray(),d=c[k].apply(b,arguments);return(new a.Array).silentCreateFrom(d)}:j===f?function(){var a=this.toArray();return c[k].apply(a,arguments)}:j===g?function(){var a,b=[].slice.call(arguments),d=this.toArray();if("function"==typeof this._itemMediator&&("unshift"===k||"push"===k))for(var e=0;e<b.length;e++)b[e]=this._itemMediator.call(this,b[e],e);return a=c[k].apply(d,b),this.silentCreateFrom(d),l||this.trigger(k,{returns:a,args:b,originalArgs:[].slice.call(arguments),method:k}),this}:j===h?function(){var a=this.toArray(),b=c[k].apply(a,arguments);return this.silentCreateFrom(a),l||this.trigger(k,{returns:b,args:[].slice.call(arguments),method:k}),b}:j===i?function(){var d,e=[].slice.call(arguments),f=this.toArray();if("function"==typeof this._itemMediator)for(b=2;b<e.length;b++)e[b]=this._itemMediator.call(this,e[b],b);return d=c[k].apply(f,e),this.silentCreateFrom(f),l||this.trigger(k,{returns:d,args:e,originalArgs:[].slice.call(arguments),method:k}),(new a.Array).silentCreateFrom(d)}:void 0:function(){throw Error("There no such method: "+k+". If you're using Internet Explorer 8 you should use es5-shim: https://github.com/kriskowal/es5-shim")}};return a.Array=a.Class({"extends":a,isMKArray:!0,length:0,itemRenderer:null,Model:null,constructor:function(a){this.initMK();var b=arguments.length;if(1===b&&"number"==typeof a)this.length=a;else{for(var c=0;b>c;c++)this[c]=arguments[c];this.length=arguments.length}},setItemMediator:function(a){this._itemMediator=a;for(var b=0;b<this.length;b++)this[b]=a.call(this,this[b],b);return this},_on:function(b,c,d,e){var f,g=this;return 0===b.indexOf("@")?(b=b.slice(1),f=function(a){(a&&a.added?a.added:g).forEach(function(a){a.isMK&&a.on(b,c,!1,d||g)},g)},f._callback=c,g.on("add",f,g,!0,b)):a.prototype._on.call(g,b,c,d,e),this},_off:function(b,c,d){var e,f=this;if(0===b.indexOf("@")){if(b=b.slice(1),c)f.off("add",c,d);else{e=f.__events.add||[];for(var g=0;g<e.length;g++)e[g].xtra===b&&f.off("add",e[g].callback)}f.forEach(function(a){a.isMK&&a.off(b,c,d)},f)}else a.prototype._off.call(f,b,c,d);return this},createFrom:function(a){var b={createdFrom:a=a||[],was:this.toNative()};return this.silentCreateFrom(a).trigger("recreate",b)},silentCreateFrom:function(a){var b,c=this.length-a.length;if(this._itemMediator){b=[];for(var d=0;d<a.length;d++)b[d]=this._itemMediator.call(this,a[d],d);a=b}for(d=0;d<a.length;d++)this[d]=a[d];for(d=0;c>d;d++)this.remove(d+a.length,{silent:!0});return this.length=a.length,this},toArray:function(){try{return c.slice.call(this)}catch(a){for(var b=[],d=0;d<this.length;d++)b[d]=this[d];return b}},toNative:function(){return this.toArray()},initMK:function(){var c=this,d="container";return c.Model&&c.setItemMediator(function(a){return a&&a.isMK&&a.instanceOf(c.Model)?a:new c.Model(a,this)}),a.prototype.initMK.call(c).on("pull pop shift splice",function(b){b&&b.returns&&("splice"===b.method?b.returns.length&&c.trigger("remove",a.extend({removed:b.returns},b)):c.trigger("remove",a.extend({removed:[b.returns]},b)))}).on("push unshift splice",function(b){var d;b&&b.args&&b.args.length&&("splice"===b.method?(d=[].slice.call(b.args,2),d&&d.length&&c.trigger("add",a.extend({added:d},b))):c.trigger("add",a.extend({added:b.args},b)))}).on("recreate",function(b){var c,e,f,g,h,i=this;if((g=b&&b.was)&&(f=this.toNative(),g.length&&(e=g.filter(function(a){return!~f.indexOf(a)}),e.length&&i.trigger("remove",a.extend({removed:e},b))),f.length&&(c=f.filter(function(a){return!~g.indexOf(a)}),c.length&&i.trigger("add",a.extend({added:c},b)))),i.itemRenderer&&(h=i.bound(d)||i.bound())){if(e)for(var j=0;j<e.length;j++)h.removeChild(e[j].bound(i.__id)),i.killDOMItem(e[j]);for(j=0;j<i.length;j++)h.appendChild(i.initDOMItem(i[j]).bound(i.__id))}}).on("add remove sort reverse",function(a){c.trigger("modify",a)}).on("push",function(a){var e;if(c.itemRenderer&&a&&(e=c.bound(d)||c.bound()))for(b=c.length-a.args.length;b<c.length;b++)e.appendChild(c.initDOMItem(c[b]).bound(c.__id))}).on("pull pop shift",function(a){var b;c.itemRenderer&&a&&a.returns&&(b=a.returns.bound(c.__id))&&(b.parentNode.removeChild(b),c.killDOMItem(a.returns))}).on("unshift",function(a){var e,f;if(c.itemRenderer&&a&&(e=c.bound(d)||c.bound()))for(b=a.args.length-1;b+1;b--)f=c.initDOMItem(c[b]).bound(c.__id),e.children?e.insertBefore(f,e.firstChild):e.appendChild(f)}).on("sort reverse",function(){var a,b;if(c.itemRenderer&&(a=c.bound(d)||c.bound()))for(var e=0;e<c.length;e++)(b=c[e].bound(c.__id))&&a.appendChild(b)}).on("splice",function(a){var b,e;if(c.itemRenderer&&a&&a.returns&&(b=c.bound(d)||c.bound())){for(var f=0;f<a.returns.length;f++)(e=a.returns[f].bound(c.__id))&&(e.parentNode.removeChild(e),c.killDOMItem(a.returns[f]));for(f=0;f<this.length;f++)b.appendChild(c.initDOMItem(c[f]).bound(c.__id))}})},initDOMItem:function(b){var c,d,e=this,f=e.__id;return b[f]||(b[f]=e),e.itemRenderer&&!b.bound(f)&&(d=e.itemRenderer(b),c="string"==typeof d?a.$.parseHTML(d.replace(/^\s+|\s+$/g,"")):a.$(d),b.bindElement(f,c).trigger("render",{element:c[0],elements:c}),e.trigger("itemrender",{element:c[0],elements:c,item:b})),b},killDOMItem:function(a){return a.remove(this.__id,{silent:!0})},initializeSmartArray:function(){var a,b=this;if(b.itemRenderer&&(a=b.bound("container")||b.bound()))for(var c=0;c<b.length;c++)a.appendChild(b.initDOMItem(b[c]).bound(b.__id));return b},hasOwnProperty:function(a){return"length"===a||a<this.length&&a>=0},toJSON:function(){for(var a=[],b=0;b<this.length;b++)a.push(this[b]&&this[b].toJSON?this[b].toJSON():this[b]);return a},concat:function(){for(var b,c=arguments,d=this.toArray(),e=0;e<c.length;e++)if(b=c[e],b instanceof Array||b&&b.instanceOf&&b.instanceOf(a.Array))for(var f=0;f<b.length;f++)d.push(b[e]);return(new a.Array).createFrom(d)},pull:function(a){var b=this.silentPull(a);return this.trigger("pull",{returns:b,method:"pull",args:[a]}),b},silentPull:function(a){var b=this.toArray(),c=b.splice(a,1)[0];return this.silentCreateFrom(b),c},push:j(g,"push"),pop:j(h,"pop"),unshift:j(g,"unshift"),shift:j(h,"shift"),sort:j(g,"sort"),reverse:j(g,"reverse"),splice:j(i,"splice"),silentPush:j(g,"push",!0),silentPop:j(h,"pop",!0),silentUnshift:j(g,"unshift",!0),silentShift:j(h,"shift",!0),silentSort:j(g,"sort",!0),silentReverse:j(g,"reverse",!0),silentSplice:j(i,"splice",!0),map:j(e,"map"),filter:j(e,"filter"),slice:j(e,"slice"),every:j(f,"every"),some:j(f,"some"),reduce:j(f,"reduce"),reduceRight:j(f,"reduceRight"),forEach:j(d,"forEach"),each:j(d,"forEach"),toString:j(f,"toString"),indexOf:j(f,"indexOf"),lastIndexOf:j(f,"lastIndexOf"),join:j(f,"join")})}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/matreshka-binders",["matreshka_dir/matreshka-core"],b):b(a.MK)}(this,function(a){if(!a)throw new Error("Matreshka is missing");var b=function(a){return{on:null,getValue:null,setValue:a}};return a.binders={innerHTML:function(){return b(function(a){this.innerHTML=null===a?"":a})},className:function(c){var d=!c.indexOf("!");return d&&(c=c.replace("!","")),b(function(b){a.$(this).toggleClass(c,d?!b:!!b)})},switchClassName:function(c,d){return b(function(b){var e=a.$(this);e.toggleClass(d,!b),e.toggleClass(c,!!b)})},property:function(a){return b(function(b){this[a]=b})},switchProperty:function(a,c,d){return b(function(b){this[a]=b?c:d})},attribute:function(a){return b(function(b){this.setAttribute(a,b)})},switchAttribute:function(a,c,d){return b(function(b){this.setAtteibute(a,b?c:d)})}}}),"function"==typeof define&&define.amd&&define("matreshka",["matreshka_dir/matreshka-core","matreshka_dir/matreshka-object","matreshka_dir/matreshka-array","matreshka_dir/matreshka-binders"],function(a){return a}),"function"==typeof define&&define.amd&&define('matreshka',["matreshka"],function(a){return a});
define('app/article.class',[
	'globals',
	'matreshka',
	'balalaika'
], function( g, MK, $ ) {
	
	return MK.Class({
		'extends': MK.Object,
		constructor: function( data ) {
			this
				.set( data )
				.bindNode( 'sandbox', 'article[id="'+this.id+'"]' )
				.bindNode( 'menuItem', 'nav a[href="#'+this.id+'"]' )
				.bindNode( 'isActive', ':bound(menuItem)', MK.binders.className( 'active' ) )
				.bindNode( 'expanded', ':bound(menuItem)', MK.binders.className( 'expanded' ) )
				.bindOptionalNode( 'submenu', 'nav ul[data-submenu="'+this.id+'"]' )
				.bindOptionalNode( 'comment', ':sandbox .comments' )
				.bindNode( 'pagination', this.bound().appendChild( $( g.app.select( '#pagination-template' ).innerHTML )[0] ) )
				.bindNode( 'name', ':bound(menuItem)', {
					getValue: function() {
						return this.dataset.name || this.textContent;
					}
				})
				.bindNode({
					nextId: ':bound(pagination) .next-page',
					previousId: ':bound(pagination) .previous-page'
				}, {
					setValue: function( v ) {
						this.href = '#' + v;
					}
				})
				.bindNode({
					nextHeader: ':bound(pagination) .next-page',
					previousHeader: ':bound(pagination) .previous-page'
				}, MK.binders.innerHTML() )
				.bindOptionalNode( 'header', ':sandbox h2', {
					getValue: function() {
						return this.innerHTML.replace( /<wbr>/g, '' );
					}
				})
				.on( 'click::menuItem(.expand)', function( evt ) {
					this.expanded = !this.expanded;
					evt.preventDefault();
				})
				.on( 'change:expanded', function() {
					var submenu = this.bound( 'submenu' );
					if( submenu ) {
						if( !this.expanded ) {
							submenu.style.marginTop = -44 * this.selectAll( ':bound(submenu) a' ).length + 'px';
						} else {
							submenu.style.marginTop = 0;
							submenu.style.display = 'block';
						}
					}
				}, true )
				.on( 'change:isActive', function() {
					var node = this.bound( 'menuItem' );
					
					while( node = node.parentNode ) {
						$( '.submenu-wrapper' ).filter( function( wrapper ) {
							return wrapper.contains( node );
						}).map( function( wrapper ) {
							return wrapper.previousElementSibling;
						}).map( function( menuItem ) {
							return menuItem.querySelector( '.hidden-active-child' );
						}).forEach( function( menuItem ) {
							menuItem.innerHTML = this.isActive ? this.name : ''
						}, this );
						break;
					}
				})
				.on( 'click::comment', function() {
					var url = document.location.origin + document.location.pathname + '#' + this.id,
						identifier = '_' + this.id,
						threadDiv = g.app.bound( 'commentsBlock' );
						
					if( this.bound().contains( g.app.bound( 'commentsBlock' ) ) ) {
						if( g.app.commentsShown = !g.app.commentsShown ) {
							setTimeout( function() {
								window.scrollTo( window.pageXOffset, threadDiv.offsetTop - 60 );
							}, 0 );
						}
						return;
					} else {
						g.app.commentsShown = true;
						this.bound().appendChild( g.app.bound( 'commentsBlock' ) );
					}
					
					location.hash = this.id;					
					
					
					if( !window.DISQUS ) {
						MK.extend( window, {
							//disqus_shortname: 'xxx', 
							disqus_developer: 1, 
							disqus_identifier: identifier,
							disqus_title: this.bound( 'comment' ).dataset.title,
							disqus_url: url
						});
						$( 'head' )[0].appendChild( $.create( 'script', {
							async: true,
							src: '//' + window.disqus_shortname + '.disqus.com/embed.js'					
						}));
					} else {
						DISQUS.reset({
							reload: true,
							config: function () {  
								this.page.identifier = identifier;
								this.page.url = identifier;
								this.page.title = title;
							}
						});
					}
					
					setTimeout( function() {
						window.scrollTo( window.pageXOffset, threadDiv.offsetTop - 60 );
					}, 500 );
				})
				.linkProps( 'previousId', 'previous', function( previous ) {
					return previous ? previous.id : '';
				})
				.linkProps( 'nextId', 'next', function( next ) {
					return next ? next.id : '';
				})
				.linkProps( 'previousHeader', 'previous', function( previous ) {
					return previous ? previous.name : '';
				})
				.linkProps( 'nextHeader', 'next', function( next ) {
					return next ? next.name : '';
				})
			;
		}
	});
});

define('app/articles.class',[
	'globals',
	'matreshka',
	'balalaika',
	'app/article.class'
], function( g, MK, $, Article ) {
	
	return MK.Class({
		'extends': MK.Array,
		Model: Article,
		constructor: function() {
			
			$( 'article:not([data-typedef])' ).forEach( function( node ) {
				if( node.id ) {
					this.push({
						id: node.id
					});
				}
			}, this );
			
			this.forEach( function( article, index ) {
				article.previous = this[ index - 1 ];
				article.next = this[ index + 1 ];
			}, this );
						
			this
				.bindNode( 'header', 'header .inner', MK.binders.innerHTML() )
				.bindNode( 'win', window )
				.on( 'hashchange::win', function() {
					var active;
					for( var i = 0; i < this.length; i++ ) {
						if( this[i].id === location.hash.replace('#','') ) {
							active = this[i];
							break;
						}
					}
					if( this.active ) {
						this.active.isActive = false;
					}
					
					if( this.active = active ) {
						this.active.isActive = true;
					}
				}, true )
				.linkProps( 'header', 'active', function( active ) {
					return active ? active.header || g.app.mainTitle : g.app.mainTitle;
				})
			;
		}
	});
});
define('app/typedef.class',[
	'matreshka',
	'balalaika'
], function( MK, $ ) {
	
	return MK.Class({
		'extends': MK.Object,
		constructor: function( data ) {
			this
				.set( data )
				.bindNode( 'sandbox', 'article[data-typedef="'+data.typedef+'"]' )
				.bindNode( 'isShown', ':sandbox', MK.binders.className( 'shown' ) )
			;
		}
	});
});
define('app/typedefs.class',[
	'globals',
	'matreshka',
	'balalaika',
	'app/typedef.class'
], function( g, MK, $, Typedef ) {
	
	return MK.Class({
		'extends': MK.Array,
		Model: Typedef,
		constructor: function() {
			
			$( 'article[data-typedef]' ).forEach( function( node ) {
				this.push({
					typedef: node.dataset.typedef
				});
			}, this );
			
			this
				.bindNode( 'sandbox', 'body' )
				.bindNode( 'overlay', '.typedef-overlay', MK.binders.className( '!hide' ) )
				.bindNode( 'overlayOpaque', ':bound(overlay)', {
					setValue: function( v ) {
						this.style.opacity = v ? .5 : 0;
					}
				})
				.on( 'click::([data-type])', function( evt ) {
					this.forEach( function( typedef ) {
						typedef.isShown = typedef.typedef === evt.target.dataset.type;
					});
				})
				.on( '@change:isShown', function( evt ) {
					if( evt.value ) {
						if( this.shown ) {
							this.shown.isShown = false;
						}
						
						this.overlay = true;
						
						this.overlayOpaque = false;
						
						this.delay( function() {
							this.overlayOpaque = true;
						});
						
						this.shown = evt.self;
					}
				})
				.on( 'click::overlay @click::(.close-modal)', this.close )
			;
			
			g.app.on( 'keydown::sandbox', function( evt ) {
				if( evt.which === 27 ) {
					this.close();
				}
			}, this );
		},
		close: function() {
			this.overlayOpaque = false;
			
			this.once( 'transitionend::overlay', function() {
				this.overlay = false;
			});
			
			if( this.shown ) {
				this.shown.isShown = false;
			}
			
			this.shown = null;
		}
	});
});
define('app/typo.class',[
	'globals',
	'matreshka',
	'balalaika'
], function( g, MK, $ ) {
	
	return MK.Class({
		'extends': MK.Object,
		constructor: function( data ) {
			this
				.set({
					formURL: '//docs.google.com/forms/d/1lCplFvSZfwDU_zr4WsK0fSCo5ktBOnox0od_BPx40xk/formResponse',
					selectionName: 'entry.1972481987',
					commentName: 'entry.1777335671',
					pageName: 'entry.339184258'
				})
				.bindNode( 'sandbox', 'form.typo' )
				.bindNode( 'shown', ':sandbox', MK.binders.className( 'shown' ) )
				.bindNode({
					selection: ':sandbox input.selection',
					comment: ':sandbox textarea.comment',
					page: ':sandbox input.page'
				})
				.bindNode({
					selectionName: ':bound(selection)',
					commentName: ':bound(comment)',
					pageName: ':bound(page)',
				}, {
					on: null,
					getValue: null,
					setValue: function( v ) {
						this.name = v;
					}
				}) 
				.bindNode( 'overlay', '.typo-overlay', MK.binders.className( '!hide' ) )
				.bindNode( 'overlayOpaque', ':bound(overlay)', {
					setValue: function( v ) {
						this.style.opacity = v ? .5 : 0;
					}
				})
				.bindNode( 'formURL', ':sandbox', {
					setValue: function( v ) {
						this.action = v;
					}
				})
				.bindNode( 'selection', ':sandbox p.selection', MK.binders.innerHTML() )
				.on( 'submit::sandbox', function( evt ) {
					this.shown = false;
				})
				.on( 'change:shown', function( evt ) {
					if( evt.value ) {
						this.overlay = true;
						this.delay( function() {
							this.overlayOpaque = true;
						});
					} else {
						this.overlayOpaque = false;
						
						this.once( 'transitionend::overlay', function() {
							this.overlay = false;
						});
					}
				})
				.on( 'click::overlay click::(.cancel) click::(.close-modal)', function( evt ) {
					this.shown = false;
					evt.preventDefault();
				})
			;
		
			g.app.on( 'keydown::sandbox', function( evt ) {
				if( 13 === evt.which && ( evt.domEvent.ctrlKey || evt.domEvent.metaKey ) ) {
					var selectionText = window.getSelection().toString();
					if( selectionText ) {
						this.comment = '';
						this.selection = selectionText;
						this.page = location.href;
						this.shown = true;
					}
				}

				if( evt.which === 27 ) {
					this.shown = false;
				}
			}, this );
		}
	});
});

define('app/search.class',[
	'globals',
	'matreshka',
	'balalaika'
], function( g, MK, $ ) {
	
	return MK.Class({
		'extends': MK.Array,
		Model: MK.Object,
		itemRenderer: '<li>',
		constructor: function( data ) {
			var UP_KEY = 38,
				DOWN_KEY = 40,
				TAB_KEY = 9,
				ENTER_KEY = 13;
			this
				.set( data )
				.bindNode( 'sandbox', 'header' )
				.bindNode( 'container', ':sandbox .search-results-dropdown' )
				.bindNode( 'searchMode', ':sandbox', MK.binders.className( 'search-mode' ) )
				.bindNode( 'search', ':sandbox .search' )
				.on( 'click::(.show-search)', function() {
					this.searchMode = true;
					this.bound( 'search' ).focus();
				})
				.on( 'click::(.back)', function() {
					this.searchMode = false;
					this.search = '';
				})
				.on( '@render', function( evt ) {
					evt.self
						//.bindNode( 'name', ':sandbox a', MK.binders.innerHTML() )
						//.bindNode( 'url', ':sandbox a', MK.binders.property( 'href' ) )
						.bindNode( 'header', ':sandbox', MK.binders.innerHTML() )
						.bindNode( 'isActive', ':sandbox', MK.binders.className( 'active' ) );
					;
				})
				.on( '@click::sandbox', function() {
					this.searchMode = false;
					this.search = '';
					document.location.hash = this.active.id;
				})
				.on( '@mouseover::sandbox', function( evt ) {
					this.forEach( function( item ) {
						item.isActive = item.eq( evt.self );
					});
				})
				.on( 'keydown::search', function( evt ) {
					var activeIndex;
					if( this.length ) {
						if( evt.which === UP_KEY || evt.which === DOWN_KEY ) {
							activeIndex = this.indexOf( this.active );
							
							if( evt.which === UP_KEY ) {
								activeIndex = activeIndex - 1;
							} else if( evt.which === DOWN_KEY ) {
								activeIndex = activeIndex + 1;
							}
							
							activeIndex = activeIndex < 0 ? this.length + activeIndex : activeIndex;
							activeIndex %= this.length;
							this.forEach( function( item, index ) {
								item.isActive = index === activeIndex;
							});
							
							evt.preventDefault();
						} else if( evt.which === ENTER_KEY ) {
							document.location.hash = this.active.id;
							this.search = '';
							this.searchMode = false;
						}
					}
				})
				.on( '@change:isActive', function( evt ) {
					this.active = evt.self.isActive ? evt.self : this.active;
				})
				.on( 'change:search', function() {
					var search = this.search;
					if( search ) {
						search = search.toLowerCase();
						this.recreate( g.app.articles
							.toNative()
							.filter( function( article ) {
								search.toLowerCase()
								return ~article.name.toLowerCase().indexOf( search ) ||
									~article.id.toLowerCase().indexOf( search );
							}).map( function( article ) {
								return {
									header: article.header,
									name: article.name,
									article: article,
									id: article.id
								};
							})
							.slice(0,5) )
						;
						
						if( this.length ) {
							this[0].isActive = true;
						}
					} else {
						this.recreate();
					}
				})
				
			;
		}
	});
});
/*
		By Osvaldas Valutis, www.osvaldas.info
		Available for use under the MIT License
	*/

	
	;( function ( document, window, index )
	{
		

		var elSelector		= 'header',
			elClassHidden	= 'hidden',
			throttleTimeout	= 500,
			element			= document.querySelector( elSelector );

		if( !element ) return true;

		var dHeight			= 0,
			wHeight			= 0,
			wScrollCurrent	= 0,
			wScrollBefore	= 0,
			wScrollDiff		= 0,

			hasElementClass		= function( element, className ){ return element.classList ? element.classList.contains( className ) : new RegExp( '(^| )' + className + '( |$)', 'gi' ).test( element.className ); },
			addElementClass		= function( element, className ){ element.classList ? element.classList.add( className ) : element.className += ' ' + className; },
			removeElementClass	= function( element, className ){ element.classList ? element.classList.remove( className ) : element.className = element.className.replace( new RegExp( '(^|\\b)' + className.split( ' ' ).join( '|' ) + '(\\b|$)', 'gi' ), ' ' ); },

			throttle = function( delay, fn )
			{
				var last, deferTimer;
				return function()
				{
					var context = this, args = arguments, now = +new Date;
					if( last && now < last + delay )
					{
						clearTimeout( deferTimer );
						deferTimer = setTimeout( function(){ last = now; fn.apply( context, args ); }, delay );
					}
					else
					{
						last = now;
						fn.apply( context, args );
					}
				};
			};

		window.addEventListener( 'scroll', throttle( throttleTimeout, function()
		{
			dHeight			= document.body.offsetHeight;
			wHeight			= window.innerHeight;
			wScrollCurrent	= window.pageYOffset;
			wScrollDiff		= wScrollBefore - wScrollCurrent;

			if( wScrollCurrent <= 0 ) // scrolled to the very top; element sticks to the top
				removeElementClass( element, elClassHidden );

			else if( wScrollDiff > 0 && hasElementClass( element, elClassHidden ) ) // scrolled up; element slides in
				removeElementClass( element, elClassHidden );

			else if( wScrollDiff < 0 ) // scrolled down
			{
				if( wScrollCurrent + wHeight >= dHeight && hasElementClass( element, elClassHidden ) ) // scrolled to the very bottom; element slides in
					removeElementClass( element, elClassHidden );

				else // scrolled down; element slides out
					addElementClass( element, elClassHidden );
			}

			wScrollBefore = wScrollCurrent;
		}));

	}( document, window, 0 ));
define("lib/header-hider", function(){});

!function(){var q=null;window.PR_SHOULD_USE_CONTINUATION=!0;
(function(){function S(a){function d(e){var b=e.charCodeAt(0);if(b!==92)return b;var a=e.charAt(1);return(b=r[a])?b:"0"<=a&&a<="7"?parseInt(e.substring(1),8):a==="u"||a==="x"?parseInt(e.substring(2),16):e.charCodeAt(1)}function g(e){if(e<32)return(e<16?"\\x0":"\\x")+e.toString(16);e=String.fromCharCode(e);return e==="\\"||e==="-"||e==="]"||e==="^"?"\\"+e:e}function b(e){var b=e.substring(1,e.length-1).match(/\\u[\dA-Fa-f]{4}|\\x[\dA-Fa-f]{2}|\\[0-3][0-7]{0,2}|\\[0-7]{1,2}|\\[\S\s]|[^\\]/g),e=[],a=
b[0]==="^",c=["["];a&&c.push("^");for(var a=a?1:0,f=b.length;a<f;++a){var h=b[a];if(/\\[bdsw]/i.test(h))c.push(h);else{var h=d(h),l;a+2<f&&"-"===b[a+1]?(l=d(b[a+2]),a+=2):l=h;e.push([h,l]);l<65||h>122||(l<65||h>90||e.push([Math.max(65,h)|32,Math.min(l,90)|32]),l<97||h>122||e.push([Math.max(97,h)&-33,Math.min(l,122)&-33]))}}e.sort(function(e,a){return e[0]-a[0]||a[1]-e[1]});b=[];f=[];for(a=0;a<e.length;++a)h=e[a],h[0]<=f[1]+1?f[1]=Math.max(f[1],h[1]):b.push(f=h);for(a=0;a<b.length;++a)h=b[a],c.push(g(h[0])),
h[1]>h[0]&&(h[1]+1>h[0]&&c.push("-"),c.push(g(h[1])));c.push("]");return c.join("")}function s(e){for(var a=e.source.match(/\[(?:[^\\\]]|\\[\S\s])*]|\\u[\dA-Fa-f]{4}|\\x[\dA-Fa-f]{2}|\\\d+|\\[^\dux]|\(\?[!:=]|[()^]|[^()[\\^]+/g),c=a.length,d=[],f=0,h=0;f<c;++f){var l=a[f];l==="("?++h:"\\"===l.charAt(0)&&(l=+l.substring(1))&&(l<=h?d[l]=-1:a[f]=g(l))}for(f=1;f<d.length;++f)-1===d[f]&&(d[f]=++x);for(h=f=0;f<c;++f)l=a[f],l==="("?(++h,d[h]||(a[f]="(?:")):"\\"===l.charAt(0)&&(l=+l.substring(1))&&l<=h&&
(a[f]="\\"+d[l]);for(f=0;f<c;++f)"^"===a[f]&&"^"!==a[f+1]&&(a[f]="");if(e.ignoreCase&&m)for(f=0;f<c;++f)l=a[f],e=l.charAt(0),l.length>=2&&e==="["?a[f]=b(l):e!=="\\"&&(a[f]=l.replace(/[A-Za-z]/g,function(a){a=a.charCodeAt(0);return"["+String.fromCharCode(a&-33,a|32)+"]"}));return a.join("")}for(var x=0,m=!1,j=!1,k=0,c=a.length;k<c;++k){var i=a[k];if(i.ignoreCase)j=!0;else if(/[a-z]/i.test(i.source.replace(/\\u[\da-f]{4}|\\x[\da-f]{2}|\\[^UXux]/gi,""))){m=!0;j=!1;break}}for(var r={b:8,t:9,n:10,v:11,
f:12,r:13},n=[],k=0,c=a.length;k<c;++k){i=a[k];if(i.global||i.multiline)throw Error(""+i);n.push("(?:"+s(i)+")")}return RegExp(n.join("|"),j?"gi":"g")}function T(a,d){function g(a){var c=a.nodeType;if(c==1){if(!b.test(a.className)){for(c=a.firstChild;c;c=c.nextSibling)g(c);c=a.nodeName.toLowerCase();if("br"===c||"li"===c)s[j]="\n",m[j<<1]=x++,m[j++<<1|1]=a}}else if(c==3||c==4)c=a.nodeValue,c.length&&(c=d?c.replace(/\r\n?/g,"\n"):c.replace(/[\t\n\r ]+/g," "),s[j]=c,m[j<<1]=x,x+=c.length,m[j++<<1|1]=
a)}var b=/(?:^|\s)nocode(?:\s|$)/,s=[],x=0,m=[],j=0;g(a);return{a:s.join("").replace(/\n$/,""),d:m}}function H(a,d,g,b){d&&(a={a:d,e:a},g(a),b.push.apply(b,a.g))}function U(a){for(var d=void 0,g=a.firstChild;g;g=g.nextSibling)var b=g.nodeType,d=b===1?d?a:g:b===3?V.test(g.nodeValue)?a:d:d;return d===a?void 0:d}function C(a,d){function g(a){for(var j=a.e,k=[j,"pln"],c=0,i=a.a.match(s)||[],r={},n=0,e=i.length;n<e;++n){var z=i[n],w=r[z],t=void 0,f;if(typeof w==="string")f=!1;else{var h=b[z.charAt(0)];
if(h)t=z.match(h[1]),w=h[0];else{for(f=0;f<x;++f)if(h=d[f],t=z.match(h[1])){w=h[0];break}t||(w="pln")}if((f=w.length>=5&&"lang-"===w.substring(0,5))&&!(t&&typeof t[1]==="string"))f=!1,w="src";f||(r[z]=w)}h=c;c+=z.length;if(f){f=t[1];var l=z.indexOf(f),B=l+f.length;t[2]&&(B=z.length-t[2].length,l=B-f.length);w=w.substring(5);H(j+h,z.substring(0,l),g,k);H(j+h+l,f,I(w,f),k);H(j+h+B,z.substring(B),g,k)}else k.push(j+h,w)}a.g=k}var b={},s;(function(){for(var g=a.concat(d),j=[],k={},c=0,i=g.length;c<i;++c){var r=
g[c],n=r[3];if(n)for(var e=n.length;--e>=0;)b[n.charAt(e)]=r;r=r[1];n=""+r;k.hasOwnProperty(n)||(j.push(r),k[n]=q)}j.push(/[\S\s]/);s=S(j)})();var x=d.length;return g}function v(a){var d=[],g=[];a.tripleQuotedStrings?d.push(["str",/^(?:'''(?:[^'\\]|\\[\S\s]|''?(?=[^']))*(?:'''|$)|"""(?:[^"\\]|\\[\S\s]|""?(?=[^"]))*(?:"""|$)|'(?:[^'\\]|\\[\S\s])*(?:'|$)|"(?:[^"\\]|\\[\S\s])*(?:"|$))/,q,"'\""]):a.multiLineStrings?d.push(["str",/^(?:'(?:[^'\\]|\\[\S\s])*(?:'|$)|"(?:[^"\\]|\\[\S\s])*(?:"|$)|`(?:[^\\`]|\\[\S\s])*(?:`|$))/,
q,"'\"`"]):d.push(["str",/^(?:'(?:[^\n\r'\\]|\\.)*(?:'|$)|"(?:[^\n\r"\\]|\\.)*(?:"|$))/,q,"\"'"]);a.verbatimStrings&&g.push(["str",/^@"(?:[^"]|"")*(?:"|$)/,q]);var b=a.hashComments;b&&(a.cStyleComments?(b>1?d.push(["com",/^#(?:##(?:[^#]|#(?!##))*(?:###|$)|.*)/,q,"#"]):d.push(["com",/^#(?:(?:define|e(?:l|nd)if|else|error|ifn?def|include|line|pragma|undef|warning)\b|[^\n\r]*)/,q,"#"]),g.push(["str",/^<(?:(?:(?:\.\.\/)*|\/?)(?:[\w-]+(?:\/[\w-]+)+)?[\w-]+\.h(?:h|pp|\+\+)?|[a-z]\w*)>/,q])):d.push(["com",
/^#[^\n\r]*/,q,"#"]));a.cStyleComments&&(g.push(["com",/^\/\/[^\n\r]*/,q]),g.push(["com",/^\/\*[\S\s]*?(?:\*\/|$)/,q]));if(b=a.regexLiterals){var s=(b=b>1?"":"\n\r")?".":"[\\S\\s]";g.push(["lang-regex",RegExp("^(?:^^\\.?|[+-]|[!=]=?=?|\\#|%=?|&&?=?|\\(|\\*=?|[+\\-]=|->|\\/=?|::?|<<?=?|>>?>?=?|,|;|\\?|@|\\[|~|{|\\^\\^?=?|\\|\\|?=?|break|case|continue|delete|do|else|finally|instanceof|return|throw|try|typeof)\\s*("+("/(?=[^/*"+b+"])(?:[^/\\x5B\\x5C"+b+"]|\\x5C"+s+"|\\x5B(?:[^\\x5C\\x5D"+b+"]|\\x5C"+
s+")*(?:\\x5D|$))+/")+")")])}(b=a.types)&&g.push(["typ",b]);b=(""+a.keywords).replace(/^ | $/g,"");b.length&&g.push(["kwd",RegExp("^(?:"+b.replace(/[\s,]+/g,"|")+")\\b"),q]);d.push(["pln",/^\s+/,q," \r\n\t\u00a0"]);b="^.[^\\s\\w.$@'\"`/\\\\]*";a.regexLiterals&&(b+="(?!s*/)");g.push(["lit",/^@[$_a-z][\w$@]*/i,q],["typ",/^(?:[@_]?[A-Z]+[a-z][\w$@]*|\w+_t\b)/,q],["pln",/^[$_a-z][\w$@]*/i,q],["lit",/^(?:0x[\da-f]+|(?:\d(?:_\d+)*\d*(?:\.\d*)?|\.\d\+)(?:e[+-]?\d+)?)[a-z]*/i,q,"0123456789"],["pln",/^\\[\S\s]?/,
q],["pun",RegExp(b),q]);return C(d,g)}function J(a,d,g){function b(a){var c=a.nodeType;if(c==1&&!x.test(a.className))if("br"===a.nodeName)s(a),a.parentNode&&a.parentNode.removeChild(a);else for(a=a.firstChild;a;a=a.nextSibling)b(a);else if((c==3||c==4)&&g){var d=a.nodeValue,i=d.match(m);if(i)c=d.substring(0,i.index),a.nodeValue=c,(d=d.substring(i.index+i[0].length))&&a.parentNode.insertBefore(j.createTextNode(d),a.nextSibling),s(a),c||a.parentNode.removeChild(a)}}function s(a){function b(a,c){var d=
c?a.cloneNode(!1):a,e=a.parentNode;if(e){var e=b(e,1),g=a.nextSibling;e.appendChild(d);for(var i=g;i;i=g)g=i.nextSibling,e.appendChild(i)}return d}for(;!a.nextSibling;)if(a=a.parentNode,!a)return;for(var a=b(a.nextSibling,0),d;(d=a.parentNode)&&d.nodeType===1;)a=d;c.push(a)}for(var x=/(?:^|\s)nocode(?:\s|$)/,m=/\r\n?|\n/,j=a.ownerDocument,k=j.createElement("li");a.firstChild;)k.appendChild(a.firstChild);for(var c=[k],i=0;i<c.length;++i)b(c[i]);d===(d|0)&&c[0].setAttribute("value",d);var r=j.createElement("ol");
r.className="linenums";for(var d=Math.max(0,d-1|0)||0,i=0,n=c.length;i<n;++i)k=c[i],k.className="L"+(i+d)%10,k.firstChild||k.appendChild(j.createTextNode("\u00a0")),r.appendChild(k);a.appendChild(r)}function p(a,d){for(var g=d.length;--g>=0;){var b=d[g];F.hasOwnProperty(b)?D.console&&console.warn("cannot override language handler %s",b):F[b]=a}}function I(a,d){if(!a||!F.hasOwnProperty(a))a=/^\s*</.test(d)?"default-markup":"default-code";return F[a]}function K(a){var d=a.h;try{var g=T(a.c,a.i),b=g.a;
a.a=b;a.d=g.d;a.e=0;I(d,b)(a);var s=/\bMSIE\s(\d+)/.exec(navigator.userAgent),s=s&&+s[1]<=8,d=/\n/g,x=a.a,m=x.length,g=0,j=a.d,k=j.length,b=0,c=a.g,i=c.length,r=0;c[i]=m;var n,e;for(e=n=0;e<i;)c[e]!==c[e+2]?(c[n++]=c[e++],c[n++]=c[e++]):e+=2;i=n;for(e=n=0;e<i;){for(var p=c[e],w=c[e+1],t=e+2;t+2<=i&&c[t+1]===w;)t+=2;c[n++]=p;c[n++]=w;e=t}c.length=n;var f=a.c,h;if(f)h=f.style.display,f.style.display="none";try{for(;b<k;){var l=j[b+2]||m,B=c[r+2]||m,t=Math.min(l,B),A=j[b+1],G;if(A.nodeType!==1&&(G=x.substring(g,
t))){s&&(G=G.replace(d,"\r"));A.nodeValue=G;var L=A.ownerDocument,o=L.createElement("span");o.className=c[r+1];var v=A.parentNode;v.replaceChild(o,A);o.appendChild(A);g<l&&(j[b+1]=A=L.createTextNode(x.substring(t,l)),v.insertBefore(A,o.nextSibling))}g=t;g>=l&&(b+=2);g>=B&&(r+=2)}}finally{if(f)f.style.display=h}}catch(u){D.console&&console.log(u&&u.stack||u)}}var D=window,y=["break,continue,do,else,for,if,return,while"],E=[[y,"auto,case,char,const,default,double,enum,extern,float,goto,inline,int,long,register,short,signed,sizeof,static,struct,switch,typedef,union,unsigned,void,volatile"],
"catch,class,delete,false,import,new,operator,private,protected,public,this,throw,true,try,typeof"],M=[E,"alignof,align_union,asm,axiom,bool,concept,concept_map,const_cast,constexpr,decltype,delegate,dynamic_cast,explicit,export,friend,generic,late_check,mutable,namespace,nullptr,property,reinterpret_cast,static_assert,static_cast,template,typeid,typename,using,virtual,where"],N=[E,"abstract,assert,boolean,byte,extends,final,finally,implements,import,instanceof,interface,null,native,package,strictfp,super,synchronized,throws,transient"],
O=[N,"as,base,by,checked,decimal,delegate,descending,dynamic,event,fixed,foreach,from,group,implicit,in,internal,into,is,let,lock,object,out,override,orderby,params,partial,readonly,ref,sbyte,sealed,stackalloc,string,select,uint,ulong,unchecked,unsafe,ushort,var,virtual,where"],E=[E,"debugger,eval,export,function,get,null,set,undefined,var,with,Infinity,NaN"],P=[y,"and,as,assert,class,def,del,elif,except,exec,finally,from,global,import,in,is,lambda,nonlocal,not,or,pass,print,raise,try,with,yield,False,True,None"],
Q=[y,"alias,and,begin,case,class,def,defined,elsif,end,ensure,false,in,module,next,nil,not,or,redo,rescue,retry,self,super,then,true,undef,unless,until,when,yield,BEGIN,END"],W=[y,"as,assert,const,copy,drop,enum,extern,fail,false,fn,impl,let,log,loop,match,mod,move,mut,priv,pub,pure,ref,self,static,struct,true,trait,type,unsafe,use"],y=[y,"case,done,elif,esac,eval,fi,function,in,local,set,then,until"],R=/^(DIR|FILE|vector|(de|priority_)?queue|list|stack|(const_)?iterator|(multi)?(set|map)|bitset|u?(int|float)\d*)\b/,
V=/\S/,X=v({keywords:[M,O,E,"caller,delete,die,do,dump,elsif,eval,exit,foreach,for,goto,if,import,last,local,my,next,no,our,print,package,redo,require,sub,undef,unless,until,use,wantarray,while,BEGIN,END",P,Q,y],hashComments:!0,cStyleComments:!0,multiLineStrings:!0,regexLiterals:!0}),F={};p(X,["default-code"]);p(C([],[["pln",/^[^<?]+/],["dec",/^<!\w[^>]*(?:>|$)/],["com",/^<\!--[\S\s]*?(?:--\>|$)/],["lang-",/^<\?([\S\s]+?)(?:\?>|$)/],["lang-",/^<%([\S\s]+?)(?:%>|$)/],["pun",/^(?:<[%?]|[%?]>)/],["lang-",
/^<xmp\b[^>]*>([\S\s]+?)<\/xmp\b[^>]*>/i],["lang-js",/^<script\b[^>]*>([\S\s]*?)(<\/script\b[^>]*>)/i],["lang-css",/^<style\b[^>]*>([\S\s]*?)(<\/style\b[^>]*>)/i],["lang-in.tag",/^(<\/?[a-z][^<>]*>)/i]]),["default-markup","htm","html","mxml","xhtml","xml","xsl"]);p(C([["pln",/^\s+/,q," \t\r\n"],["atv",/^(?:"[^"]*"?|'[^']*'?)/,q,"\"'"]],[["tag",/^^<\/?[a-z](?:[\w-.:]*\w)?|\/?>$/i],["atn",/^(?!style[\s=]|on)[a-z](?:[\w:-]*\w)?/i],["lang-uq.val",/^=\s*([^\s"'>]*(?:[^\s"'/>]|\/(?=\s)))/],["pun",/^[/<->]+/],
["lang-js",/^on\w+\s*=\s*"([^"]+)"/i],["lang-js",/^on\w+\s*=\s*'([^']+)'/i],["lang-js",/^on\w+\s*=\s*([^\s"'>]+)/i],["lang-css",/^style\s*=\s*"([^"]+)"/i],["lang-css",/^style\s*=\s*'([^']+)'/i],["lang-css",/^style\s*=\s*([^\s"'>]+)/i]]),["in.tag"]);p(C([],[["atv",/^[\S\s]+/]]),["uq.val"]);p(v({keywords:M,hashComments:!0,cStyleComments:!0,types:R}),["c","cc","cpp","cxx","cyc","m"]);p(v({keywords:"null,true,false"}),["json"]);p(v({keywords:O,hashComments:!0,cStyleComments:!0,verbatimStrings:!0,types:R}),
["cs"]);p(v({keywords:N,cStyleComments:!0}),["java"]);p(v({keywords:y,hashComments:!0,multiLineStrings:!0}),["bash","bsh","csh","sh"]);p(v({keywords:P,hashComments:!0,multiLineStrings:!0,tripleQuotedStrings:!0}),["cv","py","python"]);p(v({keywords:"caller,delete,die,do,dump,elsif,eval,exit,foreach,for,goto,if,import,last,local,my,next,no,our,print,package,redo,require,sub,undef,unless,until,use,wantarray,while,BEGIN,END",hashComments:!0,multiLineStrings:!0,regexLiterals:2}),["perl","pl","pm"]);p(v({keywords:Q,
hashComments:!0,multiLineStrings:!0,regexLiterals:!0}),["rb","ruby"]);p(v({keywords:E,cStyleComments:!0,regexLiterals:!0}),["javascript","js"]);p(v({keywords:"all,and,by,catch,class,else,extends,false,finally,for,if,in,is,isnt,loop,new,no,not,null,of,off,on,or,return,super,then,throw,true,try,unless,until,when,while,yes",hashComments:3,cStyleComments:!0,multilineStrings:!0,tripleQuotedStrings:!0,regexLiterals:!0}),["coffee"]);p(v({keywords:W,cStyleComments:!0,multilineStrings:!0}),["rc","rs","rust"]);
p(C([],[["str",/^[\S\s]+/]]),["regex"]);var Y=D.PR={createSimpleLexer:C,registerLangHandler:p,sourceDecorator:v,PR_ATTRIB_NAME:"atn",PR_ATTRIB_VALUE:"atv",PR_COMMENT:"com",PR_DECLARATION:"dec",PR_KEYWORD:"kwd",PR_LITERAL:"lit",PR_NOCODE:"nocode",PR_PLAIN:"pln",PR_PUNCTUATION:"pun",PR_SOURCE:"src",PR_STRING:"str",PR_TAG:"tag",PR_TYPE:"typ",prettyPrintOne:D.prettyPrintOne=function(a,d,g){var b=document.createElement("div");b.innerHTML="<pre>"+a+"</pre>";b=b.firstChild;g&&J(b,g,!0);K({h:d,j:g,c:b,i:1});
return b.innerHTML},prettyPrint:D.prettyPrint=function(a,d){function g(){for(var b=D.PR_SHOULD_USE_CONTINUATION?c.now()+250:Infinity;i<p.length&&c.now()<b;i++){for(var d=p[i],j=h,k=d;k=k.previousSibling;){var m=k.nodeType,o=(m===7||m===8)&&k.nodeValue;if(o?!/^\??prettify\b/.test(o):m!==3||/\S/.test(k.nodeValue))break;if(o){j={};o.replace(/\b(\w+)=([\w%+\-.:]+)/g,function(a,b,c){j[b]=c});break}}k=d.className;if((j!==h||e.test(k))&&!v.test(k)){m=!1;for(o=d.parentNode;o;o=o.parentNode)if(f.test(o.tagName)&&
o.className&&e.test(o.className)){m=!0;break}if(!m){d.className+=" prettyprinted";m=j.lang;if(!m){var m=k.match(n),y;if(!m&&(y=U(d))&&t.test(y.tagName))m=y.className.match(n);m&&(m=m[1])}if(w.test(d.tagName))o=1;else var o=d.currentStyle,u=s.defaultView,o=(o=o?o.whiteSpace:u&&u.getComputedStyle?u.getComputedStyle(d,q).getPropertyValue("white-space"):0)&&"pre"===o.substring(0,3);u=j.linenums;if(!(u=u==="true"||+u))u=(u=k.match(/\blinenums\b(?::(\d+))?/))?u[1]&&u[1].length?+u[1]:!0:!1;u&&J(d,u,o);r=
{h:m,c:d,j:u,i:o};K(r)}}}i<p.length?setTimeout(g,250):"function"===typeof a&&a()}for(var b=d||document.body,s=b.ownerDocument||document,b=[b.getElementsByTagName("pre"),b.getElementsByTagName("code"),b.getElementsByTagName("xmp")],p=[],m=0;m<b.length;++m)for(var j=0,k=b[m].length;j<k;++j)p.push(b[m][j]);var b=q,c=Date;c.now||(c={now:function(){return+new Date}});var i=0,r,n=/\blang(?:uage)?-([\w.]+)(?!\S)/,e=/\bprettyprint\b/,v=/\bprettyprinted\b/,w=/pre|xmp/i,t=/^code$/i,f=/^(?:pre|code|xmp)$/i,
h={};g()}};typeof define==="function"&&define.amd&&define("google-code-prettify",[],function(){return Y})})();}()
;
define("lib/prettify", function(){});

define('lib/embed-jsbin',[],function () {


  function getQuery(querystring) {
    var query = {};

    var pairs = querystring.split('&'),
        length = pairs.length,
        keyval = [],
        i = 0;

    for (; i < length; i++) {
      keyval = pairs[i].split('=', 2);
      try {
        keyval[0] = decodeURIComponent(keyval[0]); // key
        keyval[1] = decodeURIComponent(keyval[1]); // value
      } catch (e) {}

      if (query[keyval[0]] === undefined) {
        query[keyval[0]] = keyval[1];
      } else {
        query[keyval[0]] += ',' + keyval[1];
      }
    }

    return query;
  }


  // ---- here begins the jsbin embed - based on the embedding doc: https://github.com/jsbin/jsbin/blob/master/docs/embedding.md

  var innerText = document.createElement('i').innerText === undefined ? 'textContent' : 'innerText';

  // 1. find all links with class=jsbin
  function getLinks() {
    var links = [], alllinks, i = 0, length;
    alllinks = document.getElementsByTagName('a');
    length = alllinks.length;
    for (; i < length; i++) {
      if ((' ' + alllinks[i].className).indexOf(' jsbin-') !== -1) {
        links.push(alllinks[i]);
      }
    }

    return links;
  }

  function findCodeInParent(element) {
    var match = element;

    while (match = match.previousSibling) {
      if (match.nodeName === 'PRE') {
        break;
      }
      if (match.getElementsByTagName) {
        match = match.getElementsByTagName('pre');
        if (match.length) {
          match = match[0]; // only grabs the first
          break;
        }
      }
    }

    if (match) return match;

    match = element.parentNode.getElementsByTagName('pre');

    if (!match.length) {
      if (element.parentNode) {
        return findCodeInParent(element.parentNode);
      } else {
        return null;
      }
    }

    return match[0];
  }

  function findCode(link) {
    var rel = link.rel,
        query = link.search.substring(1),
        element,
        code,
        panels = [];

    if (rel && (element = document.getElementById(rel.substring(1)))) {
      code = element[innerText];
    // else - try to support multiple targets for each panel...
    // } else if (query.indexOf('=') !== -1) {
    //   // assumes one of the panels points to an ID
    //   query.replace(/([^,=]*)=([^,=]*)/g, function (all, key, value) {
    //     code = document.getElementById(value.substring(1))[innerText];

    //   });
    } else {
      // go looking through it's parents
      element = findCodeInParent(link);
      if (element) {
        code = element[innerText];
      }
    }

    return code;
  }

  function detectLanguage(code) {
    var htmlcount = (code.split("<").length - 1),
        csscount = (code.split("{").length - 1),
        jscount = (code.split(".").length - 1);

    if (htmlcount > csscount && htmlcount > jscount) {
      return 'html';
    } else if (csscount > htmlcount && csscount > jscount) {
      return 'css';
    } else {
      return 'javascript';
    }
  }

  function scoop(link) {
    var code = findCode(link),
        language = detectLanguage(code),
        query = link.search.substring(1);

    if (language === 'html' && code.toLowerCase().indexOf('<html') === -1) {
      // assume this is an HTML fragment - so try to insert in the %code% position
      language = 'code';
    }

    if (query.indexOf(language) === -1) {
      query += ',' + language + '=' + encodeURIComponent(code);
    } else {
      query = query.replace(language, language + '=' + encodeURIComponent(code));
    }

    link.search = '?' + query;
  }

  function embed(link) {
    var iframe = document.createElement('iframe'),
        resize = document.createElement('div'),
        url = link.href.replace(/edit/, 'embed');
    iframe.src = url.split('&')[0];
    iframe._src = url.split('&')[0]; // support for google slide embed
    iframe.className = link.className; // inherit all the classes from the link
    iframe.id = link.id; // also inherit, giving more style control to the user
    iframe.style.border = '1px solid #aaa';

    var query = getQuery(link.search);
    iframe.style.width = query.width || '100%';
    iframe.style.minHeight = query.height || '500px';
    if (query.height) {
      iframe.style.maxHeight = query.height;
    }
    //link.parentNode.replaceChild(iframe, link);
	link.nextSibling ? link.parentNode.insertBefore(iframe, link.nextSibling) : link.parentNode.appendChild(iframe);
	link.classList.add( 'embedded' );
	
    var onmessage = function (event) {
      event || (event = window.event);
      // * 1 to coerse to number, and + 2 to compensate for border
      iframe.style.height = (event.data.height * 1 + 2) + 'px';
    };

    if (window.addEventListener) {
      window.addEventListener('message', onmessage, false);
    } else {
      window.attachEvent('onmessage', onmessage);
    }
  }

  function readLinks() {
    var links = getLinks(),
        i = 0,
        length = links.length,
        className = '';

    for (; i < length; i++) {
      className = ' ' + links[i].className + ' ';
      if (className.indexOf(' jsbin-scoop ') !== -1) {
        scoop(links[i]);
      } else if (className.indexOf(' jsbin-embed ') !== -1) {
        console.log('embed', links[i]);
        links[i].className = links[i].className.replace(/jsbin\-embed/, '');
        embed(links[i]);
      }
    }

  }

  var useDOMReady = true,
      scripts = document.getElementsByTagName('script'),
      last = scripts[scripts.length - 1],
      link;

  return embed;
	
});
define('app/main.class',[
	'globals',
	'matreshka',
	'balalaika',
	'app/articles.class',
	'app/typedefs.class',
	'app/typo.class',
	'app/search.class',
	'lib/header-hider',
	'lib/prettify',
	'lib/embed-jsbin'
], function( g, MK, $, Articles, Typedefs, Typo, Search, __1, __2, embed ) {
	
	return MK.Class({
		'extends': MK.Object,
		constructor: function() {
			g.app = this;
			
			this
				.bindNode( 'sandbox', 'body' )
				.bindNode( 'mainTitle', 'title', {
					getValue: function() {
						return this.innerHTML;
					}
				})
				.set({
					view: localStorage.view || 'all',
					hideTypoBadge: localStorage.hideTypoBadge,
					isMobile: /mobile|android/i.test( navigator.userAgent ),
					articles: new Articles,
					typedefs: new Typedefs,
					typo: new Typo,
					search: new Search
				})
				.bindNode( 'win', window )
				.bindNode( 'navShown', 'body', MK.binders.className( 'nav-shown' ) )
				.bindNode( 'isMobile', ':sandbox', MK.binders.className( 'mobile' ) )
				.bindNode( 'loading', '.loader', MK.binders.className( '!hide' ) )
				.bindNode( 'navOverlay', '.nav-overlay', MK.binders.className( '!hide' ) )
				.bindNode( 'commentsBlock', '<div id="disqus_thread"></div>' )
				.bindNode( 'commentsShown', ':bound(commentsBlock)', MK.binders.className( '!hide' ) )
				.bindNode( 'typeBadge', ':sandbox .typo-badge' )
				.bindNode( 'hideTypoBadge', ':bound(typeBadge)', MK.binders.className( 'hide' ) )
				.bindNode( 'hashValue', window, {
					on: 'hashchange',
					getValue: function() {
						return location.hash.replace( '#', '' );
					}
				})
				.bindNode( 'view', 'nav .view-switcher', {
					on: 'click',
					getValue: function() {
						return this.querySelector( '.checked' ).getAttribute( 'data-value' );
					},
					setValue: function( v ) {
						MK.$b( this.children ).forEach( function( item ) {
							item.classList.toggle( 'checked', item.getAttribute( 'data-value' ) === v );
						});
					},
					initialize: function() {
						this.addEventListener( 'mousedown', function( evt ) {
							if( evt.target !== this ) MK.$b( this.children ).forEach( function( item ) {
								item.classList.toggle( 'checked', evt.target === item );
							});
						});
					}
				})
				.bindNode( 'view', 'body', MK.binders.attribute( 'data-view' ) )
				.on( 'scroll::win', function() {
					if( this.view === 'all' ) {
						var fromTop = window.pageYOffset,
							fromLeft = window.pageXOffset,
							cur = this.articles.filter(function( article ){
								return article.bound().offsetTop < fromTop + 50;
							});
						cur = cur[cur.length-1];
						location.hash = cur ? cur.id : "";
						scrollTo( fromLeft, fromTop );
					}
				})
				.on( 'change:view', function() {
					var	fromLeft = window.pageXOffset,
						fromTop;
					
					localStorage.view = this.view;
					
					if( this.view === 'all' ) {
						fromTop = this.articles.active ? this.articles.active.bound().offsetTop : 0;
					} else {
						fromTop = 0;
					}
					
					scrollTo( fromLeft, fromTop );
				})
				.on( 'click::(.show-nav)', function() {
					this.navOverlay = true;
					
					this.delay( function() {
						this.navShown = true;
					});
				})
				.on( 'click::navOverlay', function() {
					this.once( 'transitionend::navOverlay', function() {
						this.navOverlay = false;
					});
					
					this.navShown = false;
				})
				.on( 'click::([href*="jsbin.com"])', function( evt ) {
					if( evt.target.classList.contains( 'embedded' ) ) {
						evt.target.nextSibling.classList.toggle( 'hide' );
					} else {
						embed( evt.target );
					}
					
					evt.preventDefault();
				})
				.on( 'click::typeBadge(.close)', function() {
					localStorage.hideTypoBadge = this.hideTypoBadge = true;
				})
			;
			
			
			location.hash = location.hash || 'home';
			this.loading = false;
			
			prettyPrint();
		}
	});
	
	
});



require.config({
	baseUrl: "js/",
	paths: {
		matreshka: 'matreshka.min',
		balalaika: 'matreshka.min'
	}
});
define( 'globals', {} )
require(['app/main.class'], function( Main ) { window.app = new Main; });
/*[].slice.call(document.querySelectorAll('[data-type]')).map( function(item) { return item.dataset.type}).filter(function(value, index, self) { return self.indexOf(value) === index; }).forEach(function(type) { var el = document.createElement('span'); el.dataset.type = el.innerHTML = type; document.querySelector('main').appendChild(el)})*/;
define("app", function(){});

