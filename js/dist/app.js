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
	Matreshka v1.0.4 (2015-04-11)
	JavaScript Framework by Andrey Gubanov
	Released under the MIT license
	More info: http://matreshka.io
*/

!function(a,b){"function"==typeof define&&define.amd?define("xclass",b):a.Class=b()}(this,function(){var a=function(a){return!!a&&("[object Arguments]"===a.toString()||"object"==typeof a&&null!==a&&"length"in a&&"callee"in a)},b=function(){var a,b,c=-1;return"Microsoft Internet Explorer"==navigator.appName&&(a=navigator.userAgent,b=new RegExp("MSIE ([0-9]{1,}[.0-9]{0,})"),null!=b.exec(a)&&(c=parseFloat(RegExp.$1))),c}(),c=document.documentMode,d=8===c,e="Internet Explorer "+b+" doesn't support Class function";if(~b&&8>b)throw Error(e);if(8>c)throw Error(e+'. Switch your "Document Mode" to "Standards"');var f=function(b){var c=i=b.constructor!==Object?b.constructor:function(){},e=b["extends"]=b["extends"]||b.extend,g=e&&e.prototype,h=b["implements"]=b["implements"]||b.implement,i=c,j={};if(delete b.extend,delete b.implement,g){for(var k in g)j[k]="function"==typeof g[k]?function(b){return function(c,d){return d=a(d)?d:Array.prototype.slice.call(arguments,1),b.apply(c,d)}}(g[k]):g[k];j.constructor=function(b){return function(c,d){return d=a(d)?d:Array.prototype.slice.call(arguments,1),b.apply(c,d)}}(g.constructor)}return d?(b.prototype=null,b.constructor=null,c=function(){if(this instanceof c){var a=new XDomainRequest;for(var b in c.prototype)"constructor"!==b&&(a[b]=c.prototype[b]);return a.hasOwnProperty=c.prototype.hasOwnProperty,i.apply(a,arguments),a}i.apply(this,arguments)},b.constructor=c,c.prototype=c.fn=b,c.parent=j,e&&f.IEInherits(c,e)):(b.constructor=c,c.prototype=c.fn=b,c.parent=j,e&&f.inherits(c,e)),h&&h.validate(c.prototype),c.same=function(){return function(){return c.apply(this,arguments)}},this instanceof f?new c:c};return f.inherits=function(a,b){var c=a.prototype,d=function(){};d.prototype=b.prototype,a.prototype=new d,a.prototype.constructor=a;for(var e in c)a.prototype[e]=c[e];"undefined"!=typeof Symbol&&c[Symbol.iterator]&&(a.prototype[Symbol.iterator]=c[Symbol.iterator]),a.prototype.instanceOf=function(a){return this instanceof a}},f.IEInherits=function(a,b){for(var c,d=a.prototype.hasOwnProperty,e=a.prototype.constructor,f=Object.prototype.hasOwnProperty;b;)c=c||b.prototype.hasOwnProperty,a.prototype=function(a,b){var c,d={};for(c in a)d[c]=a[c];for(c in b)d[c]=b[c];return d}(b.prototype,a.prototype),b=b.prototype&&b.prototype["extends"]&&b.prototype["extends"].prototype;d!==f?a.prototype.hasOwnProperty=d:c!==f&&(a.prototype.hasOwnProperty=c),a.prototype.constructor=e,a.prototype.instanceOf=function(b){for(var c=a;c;){if(c===b)return!0;c=c.prototype["extends"]}return!1}},f.Interface=function g(a,b){var c,d={},e=function(a){return"object"==typeof a&&null!==a&&"length"in a};if(a instanceof g){for(var f in a.propsMap)d[f]=1;c=e(b)?b:[].slice.call(arguments,1)}else c=e(a)?a:arguments;for(f=0;f<c.length;f++)d[c[f]]=1;this.propsMap=d,this.validate=function(a){for(var b in this.propsMap)if("function"!=typeof a[b])throw Error('Interface error: Method "'+b+'" is not implemented in '+(a.constructor.name||a.name||"given")+" prototype")}},f.isXDR=d,f}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/polyfills/addeventlistener",b):b()}(this,function(){!function(a,b,c,d){b[c]||(Element.prototype[c]=a[c]=b[c]=function(b,c,d){return(d=this).attachEvent("on"+b,function(b){var b=b||a.event;b.target=b.target||b.srcElement,b.preventDefault=b.preventDefault||function(){b.returnValue=!1},b.stopPropagation=b.stopPropagation||function(){b.cancelBubble=!0},b.which=b.button?2===b.button?3:4===b.button?2:b.button:b.keyCode,c.call(d,b)})},Element.prototype[d]=a[d]=b[d]=function(a,b){return this.detachEvent("on"+a,b)})}(window,document,"addEventListener","removeEventListener")}),function(a,b){"function"==typeof define&&define.amd?define("balalaika",["matreshka_dir/polyfills/addeventlistener"],b):a.$b=b()}(this,function(){return function(a,b,c,d,e,f,g,h,i,j,k,l){return l=function(a,b){return new l.i(a,b)},l.i=function(d,e){c.push.apply(this,d?d.nodeType||d==a?[d]:""+d===d?/</.test(d)?((h=b.createElement(e||"div")).innerHTML=d,h.children):(e&&l(e)[0]||b).querySelectorAll(d):/f/.test(typeof d)?/c/.test(b.readyState)?d():l(b).on("DOMContentLoaded",d):d:c)},l.i[k="prototype"]=(l.extend=function(a){for(j=arguments,h=1;h<j.length;h++)if(k=j[h])for(i in k)a[i]=k[i];return a})(l.fn=l[k]=c,{on:function(a,b){return a=a.split(d),this.map(function(c){(d[h=a[0]+(c.b$=c.b$||++e)]=d[h]||[]).push([b,a[1]]),c["add"+f](a[0],b)}),this},off:function(a,b){return a=a.split(d),k="remove"+f,this.map(function(c){if(j=d[a[0]+c.b$],h=j&&j.length)for(;i=j[--h];)b&&b!=i[0]||a[1]&&a[1]!=i[1]||(c[k](a[0],i[0]),j.splice(h,1));else!a[1]&&c[k](a[0],b)}),this},is:function(a){return h=this[0],i=!!h&&(h.matches||h["webkit"+g]||h["moz"+g]||h["ms"+g]),!!i&&i.call(h,a)}}),l}(window,document,[],/\.(.+)/,0,"EventListener","MatchesSelector")}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/polyfills/classlist",b):b()}(this,function(){function a(a){this.el=a;for(var b=a.className.replace(/^\s+|\s+$/g,"").split(/\s+/),c=0;c<b.length;c++)f.call(this,b[c])}function b(a,b,c){Object.defineProperty?Object.defineProperty(a,b,{get:c}):a.__defineGetter__(b,c)}var c=function(a,b){return"boolean"==typeof b?this[b?"add":"remove"](a):this[this.contains(a)?"remove":"add"](a),this.contains(a)};if(window.DOMTokenList){var d=document.createElement("a");d.classList.toggle("x",!1),d.className&&(window.DOMTokenList.prototype.toggle=c)}if(!("undefined"==typeof window.Element||"classList"in document.documentElement)){var e=Array.prototype,f=e.push,g=e.splice,h=e.join;a.prototype={add:function(a){this.contains(a)||(f.call(this,a),this.el.className=this.toString())},contains:function(a){return-1!=this.el.className.indexOf(a)},item:function(a){return this[a]||null},remove:function(a){if(this.contains(a)){for(var b=0;b<this.length&&this[b]!=a;b++);g.call(this,b,1),this.el.className=this.toString()}},toString:function(){return h.call(this," ")},toggle:c},window.DOMTokenList=a,b(Element.prototype,"classList",function(){return new a(this)})}}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/balalaika-extended",["balalaika","matreshka_dir/polyfills/classlist"],b):b(a.$b)}(this,function(a){var b,c,d="classList";if(!a)throw new Error("Balalaika is missing");return b=a.fn.on,c=a.fn.off,a.extend(a.fn,{on:function(a,c){return a.split(/\s/).forEach(function(a){b.call(this,a,c)},this),this},off:function(a,b){return a.split(/\s/).forEach(function(a){c.call(this,a,b)},this),this},hasClass:function(a){return!!this[0]&&this[0][d].contains(a)},addClass:function(a){return this.forEach(function(b){var c=b[d];c.add.apply(c,a.split(/\s/))}),this},removeClass:function(a){return this.forEach(function(b){var c=b[d];c.remove.apply(c,a.split(/\s/))}),this},toggleClass:function(a,b){return this.forEach(function(c){var e=c[d];"boolean"!=typeof b&&(b=!e.contains(a)),e[b?"add":"remove"].apply(e,a.split(/\s/))}),this},add:function(b){var c=a(this),d=function(a,b){for(var c=0;c<a.length;c++)if(a[c]===b)return c};b=a(b).slice(),[].push.apply(c,b);for(var e=c.length-b.length;e<c.length;e++)([].indexOf?c.indexOf(c[e]):d(c,c[e]))!==e&&c.splice(e--,1);return c},find:function(b){var c=a();return this.forEach(function(d){c=c.add(a(b,d))}),c}}),a.parseHTML=function(b){var c,d,e=document.createElement("div"),f={option:[1,"<select multiple='multiple'>","</select>"],legend:[1,"<fieldset>","</fieldset>"],thead:[1,"<table>","</table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],col:[2,"<table><tbody></tbody><colgroup>","</colgroup></table>"],area:[1,"<map>","</map>"],_:[0,"",""]};for(b=b.replace(/^\s+|\s+$/g,""),f.optgroup=f.option,f.tbody=f.tfoot=f.colgroup=f.caption=f.thead,f.th=f.td,c=f[/<([\w:]+)/.exec(b)[1]]||f._,e.innerHTML=c[1]+b+c[2],d=c[0];d--;)e=e.children[0];return a(e.children)},a.create=function(b,c){var d,e,f=document.createElement(b);if(c)for(d in c)if("attributes"==d&&"object"==typeof c[d])for(e in c[d])c[d].hasOwnProperty(e)&&f.setAttribute(e,c[d][e]);else f[d]=f[d]&&"object"==typeof c?a.extend(f[d]||{},c[d]):c[d];return f},function(a,b,c,d,e,f){var g,h=a.createElement("div").children;try{[].push.apply([],h)}catch(i){g=!0}return g=g||"function"==typeof h||a.documentMode<9,g&&(f=b.i[d="prototype"],b.i=function(g,h){for(e=g?g&&g.nodeType||g==window?[g]:"string"==typeof g?/</.test(g)?((c=a.createElement("div")).innerHTML=g,c.children):(h&&b(h)[0]||a).querySelectorAll(g):!/f/.test(typeof g)||g[0]||g[0].nodeType?g:/c/.test(a.readyState)?g():!function i(b){/in/(a.readyState)?setTimeout(i,9,b):b()}(g):f,d=[],c=e?e.length:0;c--;d[c]=e[c]);f.push.apply(this,d)},b.i[d]=f,f.is=function(a){var b,c=this[0],d=c.parentNode.querySelectorAll(a);for(b=0;b<d.length;b++)if(d[b]===c)return!0;return!1}),b}(document,a),a}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/dollar-lib",["matreshka_dir/balalaika-extended"],b):a.__DOLLAR_LIB=b(a.$b)}(this,function(a){var b,c="on off is hasClass addClass removeClass toggleClass add find".split(/\s+/),d="function"==typeof $?$:null,e=!0;if(d){for(b=0;b<c.length;b++)if(!d.prototype[c[b]]){e=!1;break}d.parseHTML||(e=!1)}else e=!1;return e?d:a}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/binders",b):a.__MK_BINDERS=b()}(this,function(){var a,b=function(a){return{on:null,getValue:null,setValue:a}};return a={innerHTML:function(){return b(function(a){this.innerHTML=null===a?"":a+""})},className:function(a){var c=!a.indexOf("!");return c&&(a=a.replace("!","")),b(function(b){this.classList.toggle(a,c?!b:!!b)})},property:function(a){return b(function(b){this[a]=b})},attribute:function(a){return b(function(b){this.setAttribute(a,b)})},textarea:function(){return a.input("text")},input:function(a){var b;switch(a){case"checkbox":return{on:"click keyup",getValue:function(){return this.checked},setValue:function(a){this.checked=a}};case"radio":return{on:"click keyup",getValue:function(){return this.value},setValue:function(a){this.checked=this.value==a}};case"submit":case"button":case"image":case"reset":return{};case"hidden":b="";break;case"text":case"email":case"password":case"tel":case"url":b="keyup paste";break;case"search":b="input paste";break;case"date":case"datetime":case"datetime-local":case"month":case"time":case"week":case"file":case"range":case"color":b="change";break;default:b="keyup paste change"}return{on:b,getValue:function(){return this.value},setValue:function(a){this.value!=a&&(this.value=a)}}},select:function(a){var b;return a?{on:"change",getValue:function(){return[].slice.call(this.options).filter(function(a){return a.selected}).map(function(a){return a.value})},setValue:function(a){for(a="string"==typeof a?[a]:a,b=this.options.length-1;b>=0;b--)this.options[b].selected=~a.indexOf(this.options[b].value)}}:{on:"change",getValue:function(){return this.value},setValue:function(a){var c,d=this;if(d.value=a,!a)for(c=d.options,b=c.length-1;b>=0;b--)c[b].value||(c[b].selected=!0)}}},visibility:function(a){return a="undefined"==typeof a?!0:a,b(function(b){this.style.display=a?b?"":"none":b?"none":""})}}}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/matreshka-core",["xclass","balalaika","matreshka_dir/dollar-lib","matreshka_dir/binders"],b):a.MK=a.Matreshka=b(a.Class,a.$b,a.__DOLLAR_LIB,a.__MK_BINDERS)}(this,function(a,b,c,d){if(!a)throw Error("Class function is missing");if(![].forEach)throw Error("If you're using Internet Explorer 8 you should use es5-shim: https://github.com/kriskowal/es5-shim");var e="v0.3-rc.37",f={list:{},add:function(a){a.node&&("function"==typeof a.on?a.on.call(a.node,a.handler):c(a.node).on(a.on.split(/\s/).join(".mk ")+".mk",a.handler)),(this.list[a.instance.__id]=this.list[a.instance.__id]||[]).push(a)},rem:function(a){var b,d,e=this.list[a.instance.__id];if(e)for(d=0;d<e.length;d++)b=e[d],b.node===a.node&&(b.mkHandler&&a.instance.off("_runbindings:"+a.key,b.mkHandler),c(a.node).off(b.on+".mk",b.handler),this.list[a.instance.__id].splice(d--,1))}},g=[].slice,h=function(a){return a.trim?a.trim():a.replace(/^\s+|\s+$/g,"")},i=function(a,b){var d,e,f,g=c();return b.replace(/:sandbox/g,":bound(sandbox)").split(",").forEach(function(b){(d=/:bound\(([^(]*)\)(.*)/.exec(h(b)))?(e=a.$bound(d[1]),(f=h(d[2]))?0==f.indexOf(">")?l(e,function(a){var b=j.randomString();a.setAttribute(b,b),g=g.add(c("["+b+'="'+b+'"]'+f,a)),a.removeAttribute(b)}):g=g.add(e.find(f)):g=g.add(e)):g=g.add(b)}),g},j=a({isMK:!0,isMKInitialized:!1,on:function(a,b,c,d,e){if(!b)throw Error('callback is not function for event(s) "'+a+'"');var f,g,i=this._initMK();for(a=a instanceof Array?a:h(a).replace(/\s+/g," ").split(/\s(?![^(]*\))/g),"boolean"!=typeof c&&"undefined"!=typeof c&&(f=d,d=c,c=f),g=0;g<a.length;g++)i._on(a[g],b,d,e);return c===!0&&b.call(d||i,{triggeredOnInit:!0}),i},onDebounce:function(a,b,c,d,e,f){var g;return"number"!=typeof c&&(f=e,e=d,d=c,c=0),g=j.debounce(b,c),g._callback=b,this.on(a,g,d,e,f)},_on:function(a,b,d,e){var f,g,h,i,j,k,l,m,n,o,p,q,r=a.indexOf("@"),s=this._initMK(),t=d||s,u=/^(.*?)\((.*)\)/;return~r?(k=a.slice(0,r),a=a.slice(r+1),l=function(c){var e,f=s[k];f&&f.isMK&&(e=function(a){a&&a.private||b.apply(this,arguments)},e._callback=b,f.on(a,e,t)),c&&c.previousValue&&c.previousValue.isMK&&c.previousValue.off(a,b,d)},l._callback=b,s.on("change:"+k,l,!0,s,a)):(a=a.replace("::(","::sandbox("),f=a.replace(/\(.+\)/,""),i=s.__events[f]||(s.__events[f]=[]),j={callback:b,context:d,ctx:t,xtra:e},i.some(function(a){return a.callback==j.callback&&a.callback._callback==j.callback&&a.context==j.context})||(i.push(j),a.indexOf("change:")||s.makeSpecial(a.replace("change:","")),p=a.split("::"),q=p[0],k=p[1],k&&((h=u.exec(k))&&(g=j.selector=h[2],k=h[1]),o=function(a){var d,e,f=this,h=c(f),i=function(){b.call(t,{self:s,node:f,$nodes:h,key:k,domEvent:a,originalEvent:a.originalEvent||a,preventDefault:function(){a.preventDefault()},stopPropagation:function(){a.stopPropagation()},which:a.which,target:a.target})};g?(e="x"+String(Math.random()).split(".")[1],f.setAttribute(e,e),d="["+e+'="'+e+'"] '+g,c(a.target).is(d+","+d+" *")&&i(),f.removeAttribute(e)):i()},m=function(a){var b=a&&a.$nodes||s.__special[k]&&s.__special[k].$nodes,c=q+"."+s.__id+k;b&&b.on(c,o)},n=function(a){a.$nodes&&a.$nodes.off(q+"."+s.__id+k,o)},m._callback=n._callback=b,s._on("bind:"+k,m),m(),s._on("unbind:"+k,n)))),s},once:function(a,b,c){if(!b)throw Error('callback is not function for event "'+a+'"');var d,e=this._initMK();for(a=a.split(/\s/),d=0;d<a.length;d++)!function(a){var d=function(a){var b,c=!1;return function(){return c?b:(c=!0,b=a.apply(this,arguments),a=null,b)}}(b);d._callback=b,e.on(a,d,c)}(a[d]);return this},off:function(a,b,c){var d,e=this._initMK();if(!a&&!b&&!c)return e.events={},e;for(a=h(a).replace(/\s+/g," ").split(/\s(?![^(]*\))/g),d=0;d<a.length;d++)e._off(a[d],b,c);return e},_off:function(a,b,c){var d,e,f,g,h,i,j,k,l,m=a.indexOf("@"),n=this._initMK(),o=/^(.*?)\((.*)\)/;if(~m){if(i=a.slice(0,m),a=a.slice(m+1),b)n.off("change:"+i,b,c);else for(h=n.__events["change:"+i]||[],l=0;l<h.length;l++)h[l].xtra===a&&n.off("change:"+i,h[l].callback);n[i]&&n[i].isMK&&n[i].off(a,b,c)}else if(h=n.__events[a]){if(n.__events[a]=f=[],b||c)for(l=0;l<h.length;l++)g=h[l],(b&&b!==g.callback&&b!==g.callback._callback||c&&c!==g.context)&&f.push(g);f.length||delete n.__events[a],j=a.split("::"),k=j[0],i=j[1],i&&n.__special[i]&&((e=o.exec(i))&&(d=g.selector=e[2],i=e[1]),n.__special[i].$nodes.off(k+"."+n.__id+i),n.off("bind:"+i,b),n.off("unbind:"+i,b))}return n},trigger:function(a){var b,c,d=this._initMK();if(a)for(b=g.call(arguments),a=a.split(/\s/),c=0;c<a.length;c++)b=b.slice(),b[0]=a[c],d._trigger.apply(d,b);return d},_trigger:function(a){var b,c,d=this._initMK(),e=d.__events[a];return a&&e&&(b=g.call(arguments,1),c=function(a,b){for(var c,d=-1,e=a.length;++d<e;)(c=a[d]).callback.apply(c.ctx,b||[])},c(e,b)),d},bindNode:function(a,b,c,d,e){var g,h,i,l,m=this._initMK(),n="undefined"==typeof m[a];if(a instanceof Array){for(i=0;i<a.length;i++)m.bindNode(a[i][0],a[i][1],a[i][2]||d,b);return m}if("string"==typeof a&&(h=a.split(/\s/),h.length>1)){for(i=0;i<h.length;i++)m.bindNode(h[i],b,c,d);return m}if("object"==typeof a){for(i in a)a.hasOwnProperty(i)&&m.bindNode(i,a[i],b,c,d);return m}if(d=d||{},l=m.makeSpecial(a),g=m._getNodes(b),!g.length){if(e)return m;throw Error('Missed bound element for key "'+a+'"')}return l.$nodes=l.$nodes.add(g),"sandbox"==a&&(m.$sandbox=l.$nodes,m.sandbox=l.$nodes[0]),j.each(g,function(b){var e,h=null!==c?k("sandbox"==a?{}:j.lookForBinder(b)||{},c):{},i={self:m,key:a,$nodes:g,node:b};h.initialize&&h.initialize.call(b,k({value:l.value},i)),h.setValue&&(e=function(c){var d=m[a];(c.changedNode!=b||c.onChangeValue!==d)&&h.setValue.call(b,d,k({value:d},i))},m.on("_runbindings:"+a,e,!n)),n&&h.getValue&&d.assignDefaultValue!==!1&&m.set(a,h.getValue.call(b,i),k({fromNode:!0},d)),h.getValue&&h.on&&f.add({node:b,on:h.on,instance:m,key:a,mkHandler:e,handler:function(c){var d=m[a],e=h.getValue.call(b,k({value:d,domEvent:c,originalEvent:c.originalEvent||c,preventDefault:function(){c.preventDefault()},stopPropagation:function(){c.stopPropagation()},which:c.which,target:c.target},i));e!==d&&m.set(a,e,{fromNode:!0,changedNode:b,onChangeValue:e})}})}),d.silent||m._trigger("bind:"+a,k({key:a,$nodes:g,node:g[0]||null},d)),m},bindOptionalNode:function(a,b,c,d){var e=this;return"object"==typeof a?e.bindNode(a,b,c,!0):e.bindNode(a,b,c,d,!0),e},unbindNode:function(a,b,c){var d,e,g,h=this._initMK(),i=typeof a;if(a instanceof Array){for(g=0;g<a.length;g++)c=b,h.unbindNode(a[g][0],a[g][1]||c,c);return h}if("string"==i&&(e=a.split(/\s/),e.length>1)){for(g=0;g<e.length;g++)h.unbindNode(e[g],b,c);return h}if("object"==i&&null!==a){for(g in a)a.hasOwnProperty(g)&&h.unbindNode(g,a[g],b);return h}if(null===a){for(a in h.__special)h.__special.hasOwnProperty(a)&&h.unbindNode(a,b,c);return h}return b?(d=h._getNodes(b),j.each(d,function(a){f.rem({node:a,instance:h})},h),c&&c.silent||h._trigger("unbind:"+a,k({key:a,$nodes:d,node:d[0]||null},c)),h):h.__special[a]&&h.__special[a].$nodes?h.unbindNode(a,h.__special[a].$nodes,c):h},boundAll:function(a){var b,d,e,f=this._initMK(),g=f.__special;if(a=a?a:"sandbox",b="string"==typeof a?a.split(/\s/):a,b.length<=1)return b[0]in g?g[b[0]].$nodes:c();for(d=c(),e=0;e<b.length;e++)d=d.add(g[b[e]].$nodes);return d},$bound:function(a){return this.boundAll(a)},bound:function(a){var b,c,d=this._initMK(),e=d.__special;if(a=a?a:"sandbox",b="string"==typeof a?a.split(/\s/):a,b.length<=1)return b[0]in e?e[b[0]].$nodes[0]||null:null;for(c=0;c<b.length;c++)if(b[c]in e&&e[b[c]].$nodes.length)return e[b[c]].$nodes[0];return null},selectAll:function(a){var b=this._initMK();return/:sandbox|:bound\(([^(]*)\)/.test(a)?i(b,a):b.$bound("sandbox").find(a)},$:function(a){return this.selectAll(a)},select:function(a){return this.selectAll(a)[0]||null},_getNodes:function(a){return"string"==typeof a&&!/</.test(a)&&/:sandbox|:bound\(([^(]*)\)/.test(a)?i(this._initMK(),a):c(a)},makeSpecial:function(a){var b=this._initMK(),d=b.__special[a];return d||(d=b.__special[a]={$nodes:c(),value:b[a],getter:function(){return d.value},setter:function(c){b.set(a,c,{fromSetter:!0})},mediator:null},Object.defineProperty(b,a,{configurable:!0,get:function(){return d.getter.call(b)},set:function(a){d.setter.call(b,a)}})),d},eq:function(a){return"object"==typeof a&&null!==a&&this.__id==a.__id},defineGetter:function(a,b){var c,d,e=this._initMK();if("object"==typeof a){for(d in a)a.hasOwnProperty(d)&&e.defineGetter(d,a[d]);return e}return c=e.makeSpecial(a),c.getter=function(){return b.call(e,{value:c.value,key:a,self:e})},e},defineSetter:function(a,b){var c,d=this._initMK();if("object"==typeof a){for(c in a)a.hasOwnProperty(c)&&d.defineSetter(c,a[c]);return d}return d.makeSpecial(a).setter=function(c){return b.call(d,c,{value:c,key:a,self:d})},d},mediate:function(a,b){var c,d,e=this._initMK(),f=typeof a;if("object"==f&&!(a instanceof Array)){for(c in a)a.hasOwnProperty(c)&&e.mediate(c,a[c]);return e}for(a="string"==f?a.split(/\s/):a,c=0;c<a.length;c++)(function(a){d=e.makeSpecial(a),d.mediator=function(c){return b.call(e,c,d.value,a,e)},e.set(a,d.mediator(d.value),{fromMediator:!0})})(a[c]);return e},linkProps:function(a,b,c,d){var e,f,g,h,i,b="string"==typeof b?b.split(/\s/):b,j=function(d){var j=[],m=d._protect=d._protect||d.key+this.__id;if(m!==a+l.__id){if("object"==typeof b[0])for(h=0;h<b.length;h+=2)for(e=b[h],g="string"==typeof b[h+1]?b[h+1].split(/\s/):b[h+1],i=0;i<g.length;i++)j.push(e[g[i]]);else for(h=0;h<b.length;h++)f=b[h],e=l,j.push(e[f]);l.set(a,c.apply(l,j),k({},d,{fromDependency:!0}))}},l=this._initMK();if(c=c||function(a){return a},"object"==typeof b[0])for(h=0;h<b.length;h+=2)for(e=b[h]._initMK(),g="string"==typeof b[h+1]?b[h+1].split(/\s/):b[h+1],i=0;i<g.length;i++)e.makeSpecial(g[i]),e.on("_rundependencies:"+g[i],j);else for(h=0;h<b.length;h++)f=b[h],e=this,e.makeSpecial(f),e.on("_rundependencies:"+f,j);return d!==!1&&j.call("object"==typeof b[0]?b[0]:this,{key:"object"==typeof b[0]?b[1]:b[0]}),this},get:function(a){return this[a]},set:function(a,b,c){var d,e,f,g,h=this,i=typeof a,j=Number.isNaN||function(a){return"number"==typeof a&&j(a)};if("undefined"==i)return h;if("object"==i){for(g in a)a.hasOwnProperty(g)&&h.set(g,a[g],b);return h}return h.__special&&h.__special[a]?(d=h.__special[a],e=d.value,c=c||{},f=!d.mediator||b===e||c.skipMediator||c.fromMediator?b:d.mediator.call(h,b,e,a,h),d.value=f,(f!==e||c.force||c.forceHTML||f!==b&&!j(f))&&(c=k({},c,{value:f,previousValue:e,key:a,node:d.$nodes[0]||null,$nodes:d.$nodes,self:h}),c.silentHTML||h._trigger("_runbindings:"+a,c)),f===e&&!c.force||c.silent||h._trigger("change:"+a,c)._trigger("change",c),f===e&&!c.force&&!c.forceHTML||c.skipLinks||h._trigger("_rundependencies:"+a,c),h):(h[a]=b,h)},remove:function(a,b){var c,d,e=this._initMK(),f=String(a).split(/\s/);for(b=k({keys:f},b),d=0;d<f.length;d++)if(c=f[d]in e){b.key=f[d],b.value=e[f[d]],e.unbindNode(f[d]).off("change:"+f[d]),delete e.__special[f[d]];try{delete e[f[d]]}catch(g){}b&&b.silent||e._trigger("delete",b)._trigger("delete:"+f[d],b)}return e},define:function(a,b){var c=this;if("object"==typeof a){for(var d in a)c.define(d,a[d]);return c}return Object.defineProperty(c,a,b),c},delay:function(a,b,c){var d=this;return"object"==typeof b&&(c=b,b=0),setTimeout(function(){a.call(c||d)},b||0),d},_parseBindings:function(a){var b=this._initMK(),d="string"==typeof a?j.$.parseHTML(a.replace(/^\s+|\s+$/g,"")):c(a),e=d.find("*").add(d);return j.each(e,function(a){!function b(a){"TEXTAREA"!==a.tagName&&j.each(a.childNodes,function(c){var d,e=c.previousSibling;3==c.nodeType&&~c.nodeValue.indexOf("{{")?(d=c.nodeValue.replace(/{{([^}]*)}}/g,'<mk-bind mk-html="$1"></mk-bind>'),e?e.insertAdjacentHTML("afterend",d):a.insertAdjacentHTML("afterbegin",d),a.removeChild(c)):1==c.nodeType&&b(c)})}(a)}),e=d.find("*").add(d),j.each(e,function(a){var c=a.getAttribute("mk-html");c&&(b.bindNode(c,a,j.binders.innerHTML()),a.removeAttribute("mk-html")),j.each(a.attributes,function(c){var d,e,f=h(c.value),g=c.name;~f.indexOf("{{")&&(d=f.match(/{{[^}]*}}/g).map(function(a){return a.replace(/{{(.*)}}/,"$1")}),1==d.length&&/^{{[^}]*}}$/g.test(f)?e=d[0]:(e=j.randomString(),b.linkProps(e,d,function(){var a=f;return d.forEach(function(c){a=a.replace(new RegExp("{{"+c+"}}","g"),b[c])}),a})),("value"==g&&"checkbox"!=a.type||"checked"==g&&"checkbox"==a.type)&&j.lookForBinder(a)?b.bindNode(e,a):b.bindNode(e,a,j.binders.attribute(g)))})},b),d},_initMK:function(){var a=this;return a.isMKInitialized||k(a,{isMKInitialized:!0,Matreshka:j,sandbox:null,__id:"mk"+j.randomString(),__events:{},__special:{}}),a},toString:function(){return"[object Matreshka]"},constructor:function(){this._initMK()},getAnswerToTheUltimateQuestionOfLifeTheUniverseAndEverything:function(){this.delay(function(){alert(42)},236682e12)}}),k=j.extend=function(a,b){var c,d;if(a)for(c=1;c<arguments.length;c++)if(b=arguments[c])for(d in b)b.hasOwnProperty(d)&&(a[d]=b[d]);return a},l=j.each=function(a,b,c){if(a){if("length"in a)[].forEach.call(a,b,c);else for(var d in a)a.hasOwnProperty(d)&&b.call(c,a[d],d,a);return a}};return k(j,{binders:d,version:e,defaultBinders:[],Class:a,$:c,$b:b,useAs$:function(a){return j.$=c=a},isXDR:a.isXDR,noop:function(){},debounce:function(a,b,c){var d;return"number"!=typeof b&&(c=b,b=0),function(){var e=arguments,f=this;clearTimeout(d),d=setTimeout(function(){a.apply(c||f,e)},b||0)}},randomString:function(){return((new Date).getTime()-new Date(2013,4,3).getTime()).toString(36)+Math.floor(1679616*Math.random()).toString(36)},lookForBinder:function(a){var b,c,d=j.defaultBinders;for(c=0;c<d.length;c++)if(b=d[c].call(a,a))return b}}),j.defaultBinders.push(function(a){var b;return"INPUT"==a.tagName?b=d.input(a.type):"TEXTAREA"==a.tagName?b=d.textarea():"SELECT"==a.tagName&&(b=d.select(a.multiple)),b}),j}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/matreshka-object",["matreshka_dir/matreshka-core"],b):b(a.MK)}(this,function(a){if(!a)throw new Error("Matreshka is missing");var b,c={"extends":a,isMKObject:!0,renderer:null,constructor:function(a){this.jset(a)},keys:function(){var a,b=this,c=[];for(a in b._keys)b._keys.hasOwnProperty(a)&&c.push(a);return c},_initMK:function(){var b=this;return b.isMKInitialized?b:(a.Object.parent._initMK(b,arguments),b.set("_keys",{})._on("delete",function(a){a&&a.silent||b._trigger("modify",a)})._on("change",function(a){a&&a.key in b._keys&&!a.silent&&b._trigger("modify",a)}))},_on:function(b,c,d,e){var f,g=this._initMK();return 0==b.indexOf("@")?(b=b.slice(1),f=function(a){var e=g[a.key];e&&e.isMK&&a&&a.key in g._keys&&e._on(b,c,d||g)},g.each(function(a){a&&a.isMK&&a._on(b,c,d||g)},g),f._callback=c,g._on("change",f,g,b)):a.prototype._on.call(g,b,c,d,e),this},_off:function(b,c,d){var e=this._initMK();if(0==b.indexOf("@")){if(b=b.slice(1),c)e.off("change",c,d);else{events=e.__events.change||[];for(var f=0;f<events.length;f++)events[f].xtra==b&&e.off("change",events[f].callback)}e.each(function(a){a.isMK&&a.off(b,c,d)},e)}else a.prototype._off.call(e,b,c,d);return this},hasOwnProperty:function(a){return this._initMK()._keys.hasOwnProperty(a)},toObject:function(){var a,b=this._initMK(),c={},d=b._keys;for(a in d)d.hasOwnProperty(a)&&(c[a]=b[a]);return c},toNative:function(){return this.toObject()},toJSON:function(){var a=this._initMK(),b={},c=a._keys;for(var d in c)c.hasOwnProperty(d)&&(b[d]=a[d]&&a[d].toJSON?a[d].toJSON():a[d]);return b},keyOf:function(a){var b,c=this._initMK(),d=c._keys;for(b in d)if(d.hasOwnProperty(b))if(a&&a.isMK){if(a.eq(c[b]))return b}else if(a===c[b])return b;return null},jset:function(a,c,d){var e=this._initMK(),f=typeof a;if("undefined"==f)return e;if("object"==f){a=a.toJSON?a.toJSON():a;for(b in a)e.jset(b,a[b],c);return e}return e._keys[a]=1,e.makeSpecial(a),e.set(a,c,d)},remove:function(b,c){return this.removeDataKeys(b),a.Object.parent.remove(this,b,c)},addDataKeys:function(a){var c=this._initMK();if(!arguments.length)return c;for(a=arguments.length>1?arguments:a instanceof Array?a:String(a).split(/\s/),b=0;b<a.length;b++)c._keys[a[b]]=1,c.makeSpecial(a[b]);return c},removeDataKeys:function(a){var c=this._initMK();if(!arguments.length)return c;for(a=arguments.length>1?arguments:a instanceof Array?a:String(a).split(/\s/),b=0;b<a.length;b++)delete c._keys[a[b]];return c},each:function(a,b){var c,d=this._initMK();for(c in d._keys)d._keys.hasOwnProperty(c)&&a.call(b,d[c],c,d);return d}};return c["undefined"!=typeof Symbol?Symbol.iterator:"@@iterator"]=function(){var a=this,b=a.keys(),c=0;return{next:function(){return c>b.length-1?{done:!0}:{done:!1,value:a[b[c++]]}}}},a.Object=a.Class(c)}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/matreshka-array",["matreshka_dir/matreshka-core"],b):b(a.MK)}(this,function(a){if(!a)throw new Error("Matreshka is missing");var b=Array.prototype,c=b.slice,d={silent:!0,dontRender:!0,skipMediator:!0},e=function(a,b,c,d){if(a.length!=b.length)return!1;for(c=0,d=a.length;d>c;c++)if(a[c]&&a[c].isMK?!a[c].eq(b[c]):a[c]!==b[c])return!1;return!0},f=a.isXDR?function(a){var b,c,d=this,e=a&&a.isMK;for(b=0;b<d.length;b++)if(c=d[b],e?a.eq(c):a===c)return b;return-1}:b.indexOf,g=a.isXDR?function(a){var b,c,d=this,e=a&&a.isMK;for(b=d.length-1;b>=0;b--)if(c=d[b],e?a.eq(c):a===c)return b;return-1}:b.lastIndexOf,h=function(a,b,c){if(a.__events.addone)for(c=0;c<b.length;c++)a._trigger("addone",{self:a,added:b[c]})},i=function(a,b,c){if(a.__events.removeone)for(c=0;c<b.length;c++)a._trigger("removeone",{self:a,removed:b[c]})},j=function(f,g){var j;switch(f){case"forEach":return function(){var c=this;return b[f].apply(a.isXDR?c.toArray():c,arguments),c};case"map":case"filter":case"slice":return function(){var c=this;return(new a.Array).recreate(b[f].apply(a.isXDR?c.toArray():c,arguments),d)};case"every":case"some":case"reduce":case"reduceRight":case"toString":case"join":return function(){var c=this;return b[f].apply(a.isXDR?c.toArray():c,arguments)};case"sort":case"reverse":return function(){var h=this,i=arguments,j=c.call(i,0,g?-1:i.length),k=g?i[i.length-1]||{}:{},l=h.toArray(),m=b[f].apply(l,j);return e(h,l)||(h.recreate(l,d),k=a.extend({returns:m,args:j,originalArgs:c.call(i),method:f,self:h,added:[],removed:[]},k),k.silent||h._trigger(f,k)._trigger("modify",k),k.dontRender||h.processRendering(k)),h};case"push":case"pop":case"unshift":case"shift":return function(){var k,l,m,n=this,o=arguments,p=c.call(o,0,g?-1:o.length),q=g?o[o.length-1]||{}:{},r=n.toArray();if(!q.skipMediator&&"function"==typeof n._itemMediator&&("unshift"==f||"push"==f))for(j=0;j<p.length;j++)p[j]=n._itemMediator.call(n,p[j],j);return k=b[f].apply(r,p),e(n,r)||(n.recreate(r,d),q=a.extend({returns:k,args:p,originalArgs:c.call(o),method:f,self:n,added:l="push"==f||"unshift"==f?p:[],removed:m="pop"==f||"shift"==f?[k]:[]},q),q.silent||(n._trigger(f,q),l.length&&(n._trigger("add",q),h(n,l)),m.length&&(n._trigger("remove",q),i(n,m)),n._trigger("modify",q)),q.dontRender||n.processRendering(q)),k};case"splice":return function(){var k,l,m,n=this,o=arguments,p=c.call(o,0,g?-1:o.length),q=g?o[o.length-1]||{}:{},r=n.toArray();if(!q.skipMediator&&"function"==typeof n._itemMediator)for(j=2;j<p.length;j++)p[j]=n._itemMediator.call(n,p[j],j);return k=b[f].apply(r,p),e(n,r)||(n.recreate(r,d),q=a.extend({returns:k,args:p,originalArgs:c.call(o),method:f,self:n,added:l=c.call(p,2),removed:m=k},q),q.silent||(n._trigger(f,q),l.length&&(n._trigger("add",q),h(n,l)),m.length&&(n._trigger("remove",q),i(n,m)),n._trigger("modify",q)),q.dontRender||n.processRendering(q)),(new a.Array).recreate(k,d)}}},k={"extends":a,isMKArray:!0,length:0,itemRenderer:null,renderIfPossible:!0,useBindingsParser:!1,Model:null,constructor:function(a){var b,c=this._initMK(),d=arguments.length;if(1==d&&"number"==typeof a)c.length=a;else{for(b=0;d>b;b++)c[b]=arguments[b];c.length=arguments.length}},mediateItem:function(a){var b,c=this;for(c._itemMediator=a,b=0;b<c.length;b++)c[b]=a.call(c,c[b],b);return c},_on:function(b,c,d,e){var f,g=this._initMK();return 0==b.indexOf("@")?(b=b.slice(1),f=function(a){(a&&a.added?a.added:g).forEach(function(a){a&&a.isMK&&a._on(b,c,d||g)})},f._callback=c,g._on("add",f,g,b),f.call(d||g)):a.prototype._on.call(g,b,c,d,e),g},_off:function(b,c,d){var e,f,g=this._initMK();if(0==b.indexOf("@")){if(b=b.slice(1),c)g.off("add",c,d);else for(e=g.__events.add||[],f=0;f<e.length;f++)e[f].xtra==b&&g.off("add",e[f].callback);g.forEach(function(a){a.isMK&&a.off(b,c,d)},g)}else a.prototype._off.call(g,b,c,d);return g},recreate:function(b,c){b=b||[];var d,e,g,j,k,l=this,m=l.length-b.length,n=l.toArray();if(c=c||{},l._itemMediator&&!c.skipMediator){for(d=[],e=0;e<b.length;e++)d[e]=l._itemMediator.call(l,b[e],e);b=d}for(e=0;e<b.length;e++)l[e]=b[e];for(e=0;m>e;e++)l.remove(e+b.length,{silent:!0});return l.length=b.length,c.silent&&c.dontRender?l:(k=l.toArray(),j=n.length?n.filter(function(a){return!~f.call(k,a)
}):[],g=k.length?k.filter(function(a){return!~f.call(n,a)}):[],c=a.extend({added:g,removed:j,was:n,now:k,method:"recreate",self:l},c),c.silent||(g.length&&(l._trigger("add",c),h(l,g)),j.length&&(l._trigger("remove",c),i(l,j)),(g.length||j.length)&&l._trigger("recreate",c)._trigger("modify",c)),c.dontRender||l.processRendering(c),l)},toArray:function(){var a,b,d=this;try{return c.call(d)}catch(e){for(a=[],b=0;b<d.length;b++)a[b]=d[b];return a}},toNative:function(){return this.toArray()},_initMK:function(){var b=this;return b.isMKInitialized?b:a.prototype._initMK.call(b).on("change:Model",function(){var a=b.Model;a&&b.mediateItem(function(c){return c&&c.isMK&&c.instanceOf(a)?c:new a(c&&c.toJSON?c.toJSON():c,b)})},!0)},_renderOne:function(b,c){var d,e,f=this,g=f.__id,h=b.renderer||f.itemRenderer,i=h===b.renderer?b:f,j=b.bound(g);if(b[g]||(b[g]=f),c.moveSandbox&&(j=b.bound("sandbox"))&&b.bindNode(g,j),!j){if("function"==typeof h&&(h=h.call(i,b)),"string"!=typeof h||~h.indexOf("<")||~h.indexOf("{{"))e=h;else{if(e=i._getNodes(h),!(e=e&&e[0]))throw Error("renderer node is missing: "+h);e=e.innerHTML}d=f.useBindingsParser?b._parseBindings(e):"string"==typeof e?a.$.parseHTML(e.replace(/^\s+|\s+$/g,"")):a.$(e),b.bindRenderedAsSandbox!==!1&&d.length&&b.bindNode("sandbox",d),b.bindNode(g,d),b._trigger("render",{node:d[0],$nodes:d,self:b,parentArray:f}),j=d[0]}return j},processRendering:function(a){var b,c,d=this,e=d.__id,f=f=d.bound("container")||d.bound(),g=function(a){if(a&&a.isMK){var b=a.bound(e);return a.remove(e,{silent:!0}),b}},h=function(b){return b&&b.isMK&&d.renderIfPossible&&f&&!a.dontRender&&(d.itemRenderer||b&&b.renderer)&&d._renderOne(b,a)};switch(a.method){case"push":for(c=d.length-a.added.length;c<d.length;c++)(b=h(d[c]))&&f.appendChild(b);break;case"unshift":for(c=a.added.length-1;c+1;c--)(b=h(d[c]))&&(f.children?f.insertBefore(b,f.firstChild):f.appendChild(b));break;case"pull":case"pop":case"shift":for(c=0;c<a.removed.length;c++)(b=g(a.removed[c]))&&f.removeChild(b);break;case"sort":case"reverse":for(c=0;c<d.length;c++)(b=d[c].bound(e))&&f.appendChild(b);break;case"rerender":for(c=0;c<d.length;c++)(b=h(d[c]))&&f.appendChild(b);break;case"recreate":case"splice":for(c=0;c<a.removed.length;c++)(b=g(a.removed[c]))&&f.removeChild(b);for(c=0;c<d.length;c++)(b=h(d[c]))&&f.appendChild(b)}return d},rerender:function(){return this.processRendering({method:"rerender"})},hasOwnProperty:function(a){return"length"==a||a<this.length&&a>=0},toJSON:function(){var a,b=this,c=[];for(a=0;a<b.length;a++)c.push(b[a]&&b[a].toJSON?b[a].toJSON():b[a]);return c},concat:function(){var b,c,d,e=arguments,f=this.toArray();for(c=0;c<e.length;c++)if(b=e[c],b instanceof Array||b&&b.instanceOf&&b.instanceOf(a.Array))for(d=0;d<b.length;d++)f.push(b[c]);return(new a.Array).recreate(f)},pull:function(b,c){var f,g,h=this,j=h.toArray(),k=b,l=typeof b;return"number"==l||"string"==l||(b=h.indexOf(b),~b)?(f=j.splice(b,1)[0]||null,e(j,h)||(c=c||{},h.recreate(j,d),c=a.extend({returns:f,args:[k],method:"pull",self:h,added:[],removed:g=f?[f]:[]},c),c.silent||(h._trigger("pull",c),h._trigger("remove",c),i(h,g),h._trigger("modify",c)),h.processRendering(c)),f):null},indexOf:f,lastIndexOf:g};return"push pop unshift shift sort reverse splice map filter slice every some reduce reduceRight forEach toString join".split(" ").forEach(function(a){k[a]=j(a)}),"push pop unshift shift sort reverse splice".split(" ").forEach(function(a){k[a+"_"]=j(a,1)}),k.each=k.forEach,k["undefined"!=typeof Symbol?Symbol.iterator:"@@iterator"]=function(){var a=this,b=0;return{next:function(){return b>a.length-1?{done:!0}:{done:!1,value:a[b++]}}}},a.Array=a.Class(k)}),"function"==typeof define&&define.amd&&define("matreshka",["matreshka_dir/matreshka-core","matreshka_dir/matreshka-object","matreshka_dir/matreshka-array"],function(a){return a}),"function"==typeof define&&define.amd?define('matreshka',["matreshka"],function(a){return a}):"object"==typeof exports&&(module.exports=Matreshka);
//# sourceMappingURL=matreshka.min.map;
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
				.set({
					commentsShown: false
				})
				.linkProps( 'ieVersion', [ g.app, 'ieVersion' ] )
				.bindNode( 'sandbox', 'article[id="'+this.id+'"]' )
				.bindOptionalNode( 'ieVersion', ':sandbox .comments', MK.binders.className( 'hide' ) )
				.bindNode( 'menuItem', 'nav a[href="#'+this.id+'"]' )
				.bindNode( 'isActive', ':bound(menuItem)', MK.binders.className( 'active' ) )
				.bindNode( 'expanded', ':bound(menuItem)', MK.binders.className( 'expanded' ) )
				.bindOptionalNode( 'commentsContainer', ':sandbox .comments-container' )
				.bindOptionalNode( 'commentsShown', ':bound(commentsContainer)', MK.binders.visibility() )
				.bindOptionalNode( 'submenu', 'nav ul[data-submenu="'+this.id+'"]' )
				.bindOptionalNode( 'comment', ':sandbox .comments' )
				.bindNode( 'pagination', this.bound().appendChild( $( g.app.select( '#pagination-template' ).innerHTML )[0] ) )
				.bindNode( 'name', ':bound(menuItem)', {
					getValue: function() {
						return this.getAttribute( 'data-name' ) || this.textContent;
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
						commentsContainer = this.bound( 'commentsContainer' );
						
					if( this.commentsShown = !this.commentsShown ) {
						commentsContainer.classList.add( 'muut' );
						g.app.muut();
					}
					
					
				})
				// This code is kept if we'll need to move back to facebook
				.on( 'click::comment___FACEBOOK', function() {
					var url = document.location.origin + document.location.pathname + '#' + this.id,
						//identifier = '__' + this.id,
						commentsContainer = this.bound( 'commentsContainer' );
						
					this.commentsShown = !this.commentsShown;
						
					/*if( this.bound().contains( g.app.bound( 'commentsBlock' ) ) ) {
						if( g.app.commentsShown = !g.app.commentsShown ) {
							setTimeout( function() {
								window.scrollTo( window.pageXOffset, threadDiv.offsetTop - 60 );
							}, 0 );
						}
						return;
					} else {
						g.app.commentsShown = true;
						this.bound().appendChild( g.app.bound( 'commentsBlock' ) );
					}*/
					
					
					//<div class="fb-comments" data-href="http://volodia.com" data-numposts="5" data-colorscheme="light"></div>
					
					location.hash = this.id;
					
					if( commentsContainer.getAttribute( 'fb-xfbml-state' ) !== 'rendered' ) {
						MK.each({
							href: url,
							numposts: 5,
							colorscheme: 'light'
						}, function( v, key ) {
							commentsContainer.setAttribute( 'data-' + key, v );
						})
						
						commentsContainer.classList.add( 'fb-comments' );
						
						if( !window.FB ) {
							window.fbAsyncInit = function() {
								FB.Event.subscribe('comment.create', function() {
									g.app.notifier.notify( 'comment.create', 'Comment is added' );
								});
								
								FB.Event.subscribe('comment.remove', function() {
									g.app.notifier.notify( 'comment.remove', 'Comment is removed' );
								});
							};
							
							(function(d, s, id) {
							var js, fjs = d.getElementsByTagName(s)[0];
							if (d.getElementById(id)) return;
							js = d.createElement(s); js.id = id;
							js.src = "//connect.facebook.net/ru_RU/sdk.js#xfbml=1&appId=901572946532005&version=v2.0";
							fjs.parentNode.insertBefore(js, fjs);
							}(document, 'script', 'facebook-jssdk'));
						} else {
							FB.XFBML.parse( this.bound() );
						}
					}
					/*MK.extend( window, {
						disqus_developer: 1, 
						disqus_identifier: identifier,
						disqus_title: this.bound( 'comment' ).dataset.title,
						disqus_url: url
					});
					
					if( !window.DISQUS ) {
						$( 'head' )[0].appendChild( $.create( 'script', {
							async: true,
							src: '//' + window.disqus_shortname + '.disqus.com/embed.js'					
						}));
					} else {
						DISQUS.reset({
							reload: true,
							config: function () {  
								this.page.identifier = identifier;
								this.page.url = url;
								this.page.title = title;
							}
						});
					}*/
					
					/*<div id="fb-root"></div>
<script></script>*/
					if( this.commentsShown ) {
						setTimeout( function() {
							window.scrollTo( window.pageXOffset, commentsContainer.offsetTop - 60 );
						});
					}
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
				.linkProps( 'hashValue', [ g.app, 'hashValue' ] )
				.on( 'change:hashValue', function() {
					var active;
					for( var i = 0; i < this.length; i++ ) {
						if( this[i].id === this.hashValue ) {
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
					typedef: node.getAttribute( 'data-typedef' )
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
						typedef.isShown = typedef.typedef === evt.target.getAttribute( 'data-type' );
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

define('app/notifier.class',[
	'globals',
	'matreshka',
	'balalaika'
], function( g, MK, $ ) {
	
	return MK.Class({
		'extends': MK.Object,
		constructor: function( data ) {
			this
				.set({
					formURL: '//docs.google.com/forms/d/1hxQBT5pyq5tLLWH0dWFtwUSLocFC3zxqb9eDJa9p_jE/formResponse',
					typeName: 'entry.1972481987',
					textName: 'entry.1777335671',
					pageName: 'entry.339184258'
				})
				.bindNode( 'sandbox', 'form.notification-form' )
				.bindNode({
					type: ':sandbox input.type',
					text: ':sandbox input.text',
					page: ':sandbox input.page'
				})
				.bindNode({
					typeName: ':bound(type)',
					textName: ':bound(text)',
					pageName: ':bound(page)',
				}, {
					on: null,
					getValue: null,
					setValue: function( v ) {
						this.name = v;
					}
				}) 
				.bindNode( 'formURL', ':sandbox', {
					setValue: function( v ) {
						this.action = v;
					}
				})
			;
		},
		notify: function( type, text ) {
			this.type = type;
			this.text = text;
			this.page = location.href;
			this.bound( 'sandbox' ).submit();
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
	'app/notifier.class',
	'app/search.class',
	'lib/header-hider',
	'lib/prettify',
	'lib/embed-jsbin'
], function( g, MK, $, Articles, Typedefs, Typo, Notifier, Search, __1, __2, embed ) {
	
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
				.bindNode( 'hashValue', window, {
					on: 'hashchange',
					getValue: function() {
						return location.hash.replace( '#', '' );
					}
				})
				.set({
					ieVersion: document.documentMode,
					isOldIE: document.documentMode <= 9
				})
				.set({
					view: this.isOldIE ? 'per-one' : localStorage.view || 'all',
					hideTypoBadge: localStorage.hideTypoBadge,
					isMobile: /mobile|android/i.test( navigator.userAgent ),
					articles: new Articles,
					typedefs: new Typedefs,
					typo: new Typo,
					notifier: new Notifier,
					search: new Search
				})
				.bindNode( 'win', window )
				.bindNode( 'navShown', 'body', MK.binders.className( 'nav-shown' ) )
				.bindNode( 'isMobile', ':sandbox', MK.binders.className( 'mobile' ) )
				.bindNode( 'loading', '.loader', MK.binders.className( '!hide' ) )
				.bindNode( 'navOverlay', '.nav-overlay', MK.binders.className( '!hide' ) )
				.bindNode( 'typeBadge', ':sandbox .typo-badge' )
				.bindNode( 'hideTypoBadge', ':bound(typeBadge)', MK.binders.className( 'hide' ) )
				.bindNode( 'hashValue', ':sandbox .another-language', {
					setValue: function( v ) {
						this.href = this.href.split( '#' )[0] + '#' + v;
					}
				})
				.bindNode( 'viewSwitcher', 'nav .view-switcher' )
				.bindNode( 'isOldIE', ':bound(viewSwitcher)', MK.binders.visibility( false ) )
				.bindNode( 'view', ':bound(viewSwitcher)', {
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
				.onDebounce( 'scroll::win', function() {
					if( this.view === 'all' ) {
						var fromTop = window.pageYOffset,
							fromLeft = window.pageXOffset,
							cur = this.articles.filter(function( article ) {
								return article.bound().offsetTop < fromTop + 50;
							}),
							hash;
							
						cur = cur[cur.length-1];
						
						hash = cur ? cur.id : "";
						
						if( this.hashValue != hash ) {
							this.hashValue = hash;
							if( window.history && history.pushState ) {
								history.pushState( null, null, '#' + hash );
							} else {
								location.hash = hash;
								scrollTo( fromLeft, fromTop );
							}
						} 
					}
				}, 200 )
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
				.on( 'click::([href*="jsbin.com"][href*="edit"])', function( evt ) {
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
			
			if( ~location.hash.indexOf( 'comments' ) ) { //  #!/matreshka/comments/matreshka-ru%23matreshka::unread
				var threadID = location.hash.replace( /#!\/matreshka\/comments\/matreshka-\S{2}%23(.*)::unread/, '$1' ).toLowerCase(),
					commentArticle,
					commentsContainer;

				for( var i = 0; i < this.articles.length; i++ ) {
					if( ~this.articles[i].id.toLowerCase().replace( /\./g, '' ).indexOf( threadID ) ) {
						commentArticle = this.articles[i];
						commentsContainer = commentArticle.bound( 'commentsContainer' );
						break;
					}
				}

				if( commentArticle && commentsContainer ) {
					commentsContainer.classList.add( 'muut' );
					commentArticle.commentsShown = true;
					this.muut();
				}
			}
			
			this.loading = false;
			
			prettyPrint();
		},
		muut: function() {
			var script;
			if( typeof jQuery === 'undefined' || !jQuery.fn.muut ) {
				document.body.appendChild( $.create( 'script', {
					src: '//cdn.muut.com/1/moot.min.js'
				}) );
			} else {
				jQuery( '.muut' ).muut();
			}
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

