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
	Matreshka v1.1.0-alpha.1 (2015-08-23)
	JavaScript Framework by Andrey Gubanov
	Released under the MIT license
	More info: http://matreshka.io
*/

!function(a,b){"function"==typeof define&&define.amd?define("xclass",b):a.Class=b()}(this,function(){var a=function(a){return!!a&&("[object Arguments]"===a.toString()||"object"==typeof a&&null!==a&&"length"in a&&"callee"in a)},b=function(){var a,b,c=-1;return"Microsoft Internet Explorer"==navigator.appName&&(a=navigator.userAgent,b=new RegExp("MSIE ([0-9]{1,}[.0-9]{0,})"),null!==b.exec(a)&&(c=parseFloat(RegExp.$1))),c}(),c=document.documentMode,d=8===c,e="Internet Explorer "+b+" doesn't support Class function";if(~b&&8>b)throw Error(e);if(8>c)throw Error(e+'. Switch your "Document Mode" to "Standards"');var f=function(b){var c,e=b.constructor!==Object?b.constructor:function EmptyConstructor(){},g=b["extends"]=b["extends"]||b.extend,h=g&&g.prototype,i=b["implements"]=b["implements"]||b.implement,j={};if(c=e,delete b.extend,delete b.implement,h){for(var k in h)j[k]="function"==typeof h[k]?function(b){return function(c,d){return d=a(d)?d:Array.prototype.slice.call(arguments,1),b.apply(c,d);
}}(h[k]):h[k];j.constructor=function(b){return function(c,d){return d=a(d)?d:Array.prototype.slice.call(arguments,1),b.apply(c,d)}}(h.constructor)}return d?(b.prototype=null,b.constructor=null,e=function(){if(this instanceof e){var a=new XDomainRequest;for(var b in e.prototype)"constructor"!==b&&(a[b]=e.prototype[b]);return a.hasOwnProperty=e.prototype.hasOwnProperty,c.apply(a,arguments),a}c.apply(this,arguments)},b.constructor=e,e.prototype=e.fn=b,e.parent=j,g&&f.IEInherits(e,g)):(b.constructor=e,e.prototype=e.fn=b,e.parent=j,g&&f.inherits(e,g)),i&&i.validate(e.prototype),e.same=function(){return function(){return e.apply(this,arguments)}},this instanceof f?new e:e};return f.inherits=function(a,b){var c,d=a.prototype,e=function(){};e.prototype=b.prototype,a.prototype=new e,a.prototype.constructor=a;for(c in d)a.prototype[c]=d[c];"undefined"!=typeof Symbol&&d[Symbol.iterator]&&(a.prototype[Symbol.iterator]=d[Symbol.iterator]),a.prototype.instanceOf=function(a){return this instanceof a}},
f.IEInherits=function(a,b){for(var c,d=a.prototype.hasOwnProperty,e=a.prototype.constructor,f=Object.prototype.hasOwnProperty;b;)c=c||b.prototype.hasOwnProperty,a.prototype=function(a,b){var c,d={};for(c in a)d[c]=a[c];for(c in b)d[c]=b[c];return d}(b.prototype,a.prototype),b=b.prototype&&b.prototype["extends"]&&b.prototype["extends"].prototype;d!==f?a.prototype.hasOwnProperty=d:c!==f&&(a.prototype.hasOwnProperty=c),a.prototype.constructor=e,a.prototype.instanceOf=function(b){for(var c=a;c;){if(c===b)return!0;c=c.prototype["extends"]}return!1}},f.Interface=function Interface(a,b){var c,d,e={},f=function(a){return"object"==typeof a&&null!==a&&"length"in a};if(a instanceof Interface){for(d in a.propsMap)e[d]=1;c=f(b)?b:[].slice.call(arguments,1)}else c=f(a)?a:arguments;for(d=0;d<c.length;d++)e[c[d]]=1;this.propsMap=e,this.validate=function(a){for(d in this.propsMap)if("function"!=typeof a[d])throw Error('Interface error: Method "'+d+'" is not implemented in '+(a.constructor.name||a.name||"given")+" prototype");
}},f.isXDR=d,f}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/polyfills/addeventlistener",b):b()}(this,function(){!function(a,b,c,d){b[c]||(Element.prototype[c]=a[c]=b[c]=function(b,c,d){return(d=this).attachEvent("on"+b,function(b){b=b||a.event,b.target=b.target||b.srcElement,b.preventDefault=b.preventDefault||function(){b.returnValue=!1},b.stopPropagation=b.stopPropagation||function(){b.cancelBubble=!0},b.which=b.button?2===b.button?3:4===b.button?2:b.button:b.keyCode,c.call(d,b)})},Element.prototype[d]=a[d]=b[d]=function(a,b){return this.detachEvent("on"+a,b)})}(window,document,"addEventListener","removeEventListener")}),function(a,b){"function"==typeof define&&define.amd?define("balalaika",["matreshka_dir/polyfills/addeventlistener"],b):a.$b=b()}(this,function(){return function(a,b,c,d,e,f,g,h,i,j,k,l){return l=function(a,b){return new l.i(a,b)},l.i=function(d,e){c.push.apply(this,d?d.nodeType||d==a?[d]:""+d===d?/</.test(d)?((h=b.createElement(e||"div")).innerHTML=d,
h.children):(e&&l(e)[0]||b).querySelectorAll(d):/f/.test(typeof d)?/c/.test(b.readyState)?d():l(b).on("DOMContentLoaded",d):d:c)},l.i[k="prototype"]=(l.extend=function(a){for(j=arguments,h=1;h<j.length;h++)if(k=j[h])for(i in k)a[i]=k[i];return a})(l.fn=l[k]=c,{on:function(a,b){return a=a.split(d),this.map(function(c){(d[h=a[0]+(c.b$=c.b$||++e)]=d[h]||[]).push([b,a[1]]),c["add"+f](a[0],b)}),this},off:function(a,b){return a=a.split(d),k="remove"+f,this.map(function(c){if(j=d[a[0]+c.b$],h=j&&j.length)for(;i=j[--h];)b&&b!=i[0]||a[1]&&a[1]!=i[1]||(c[k](a[0],i[0]),j.splice(h,1));else!a[1]&&c[k](a[0],b)}),this},is:function(a){return h=this[0],i=!!h&&(h.matches||h["webkit"+g]||h["moz"+g]||h["ms"+g]),!!i&&i.call(h,a)}}),l}(window,document,[],/\.(.+)/,0,"EventListener","MatchesSelector")}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/polyfills/classlist",b):b()}(this,function(){function DOMTokenList(a){this.el=a;for(var b=a.className.replace(/^\s+|\s+$/g,"").split(/\s+/),c=0;c<b.length;c++)d.call(this,b[c]);
}function defineElementGetter(a,b,c){Object.defineProperty?Object.defineProperty(a,b,{get:c}):a.__defineGetter__(b,c)}var a=function(a,b){return"boolean"==typeof b?this[b?"add":"remove"](a):this[this.contains(a)?"remove":"add"](a),this.contains(a)};if(window.DOMTokenList){var b=document.createElement("a");b.classList.toggle("x",!1),b.className&&(window.DOMTokenList.prototype.toggle=a)}if(!("undefined"==typeof window.Element||"classList"in document.documentElement)){var c=Array.prototype,d=c.push,e=c.splice,f=c.join;DOMTokenList.prototype={add:function(a){this.contains(a)||(d.call(this,a),this.el.className=this.toString())},contains:function(a){return-1!=this.el.className.indexOf(a)},item:function(a){return this[a]||null},remove:function(a){if(this.contains(a)){for(var b=0;b<this.length&&this[b]!=a;b++);e.call(this,b,1),this.el.className=this.toString()}},toString:function(){return f.call(this," ")},toggle:a},window.DOMTokenList=DOMTokenList,defineElementGetter(Element.prototype,"classList",function(){
return new DOMTokenList(this)})}}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/balalaika-extended",["balalaika","matreshka_dir/polyfills/classlist"],b):b(a.$b)}(this,function(a){var b,c,d="classList";if(!a)throw new Error("Balalaika is missing");return b=a.fn.on,c=a.fn.off,a.extend(a.fn,{on:function(a,c){return a.split(/\s/).forEach(function(a){b.call(this,a,c)},this),this},off:function(a,b){return a.split(/\s/).forEach(function(a){c.call(this,a,b)},this),this},hasClass:function(a){return!!this[0]&&this[0][d].contains(a)},addClass:function(a){return this.forEach(function(b){var c=b[d];c.add.apply(c,a.split(/\s/))}),this},removeClass:function(a){return this.forEach(function(b){var c=b[d];c.remove.apply(c,a.split(/\s/))}),this},toggleClass:function(a,b){return this.forEach(function(c){var e=c[d];"boolean"!=typeof b&&(b=!e.contains(a)),e[b?"add":"remove"].apply(e,a.split(/\s/))}),this},add:function(b){var c,d,e=a(this),f=function(a,b){for(d=0;d<a.length;d++)if(a[d]===b)return d;
};for(b=a(b).slice(),[].push.apply(e,b),c=e.length-b.length;c<e.length;c++)([].indexOf?e.indexOf(e[c]):f(e,e[c]))!==c&&e.splice(c--,1);return e},not:function(b){var c,d,e=a(this);for(b=a(b),d=0;d<b.length;d++)~(c=e.indexOf(b[d]))&&e.splice(c,1);return e},find:function(b){var c=a();return this.forEach(function(d){c=c.add(a(b,d))}),c}}),a.parseHTML=function(b){var c,d,e=document.createElement("div"),f={option:[1,"<select multiple='multiple'>","</select>"],legend:[1,"<fieldset>","</fieldset>"],thead:[1,"<table>","</table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],col:[2,"<table><tbody></tbody><colgroup>","</colgroup></table>"],area:[1,"<map>","</map>"],_:[0,"",""]};for(b=b.replace(/^\s+|\s+$/g,""),f.optgroup=f.option,f.tbody=f.tfoot=f.colgroup=f.caption=f.thead,f.th=f.td,c=f[/<([\w:]+)/.exec(b)[1]]||f._,e.innerHTML=c[1]+b+c[2],d=c[0];d--;)e=e.children[0];return a(e.children)},a.create=function create(a,b){var c,d,e,f;if("object"==typeof a&&(b=a,
a=b.tagName),c=document.createElement(a),b)for(d in b)if(f=b[d],"attributes"==d&&"object"==typeof f)for(e in f)f.hasOwnProperty(e)&&c.setAttribute(e,f[e]);else{if("tagName"==d)continue;if("children"==d&&f)for(e=0;e<f.length;e++)c.appendChild(create(f[e]));else if("object"==typeof c[d]&&null!==c[d]&&"object"==typeof b)for(e in f)f.hasOwnProperty(e)&&(c[d][e]=f[e]);else c[d]=f}return c},function(a,b,c,d,e,f){var g,h=a.createElement("div").children;try{[].push.apply([],h)}catch(i){g=!0}return g=g||"function"==typeof h||a.documentMode<9,g&&(f=b.i[d="prototype"],b.i=function(g,h){for(e=g?g&&g.nodeType||g==window?[g]:"string"==typeof g?/</.test(g)?((c=a.createElement("div")).innerHTML=g,c.children):(h&&b(h)[0]||a).querySelectorAll(g):!/f/.test(typeof g)||g[0]||g[0].nodeType?g:/c/.test(a.readyState)?g():!function r(b){/in/(a.readyState)?setTimeout(r,9,b):b()}(g):f,d=[],c=e?e.length:0;c--;d[c]=e[c]);f.push.apply(this,d)},b.i[d]=f,f.is=function(a){var b,c=this[0],d=c.parentNode.querySelectorAll(a);
for(b=0;b<d.length;b++)if(d[b]===c)return!0;return!1}),b}(document,a),a}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/dollar-lib",["matreshka_dir/balalaika-extended"],b):a.__DOLLAR_LIB=b(a.$b)}(this,function(a){var b,c="on off is hasClass addClass removeClass toggleClass add not find".split(/\s+/),d="function"==typeof window.$?window.$:null,e=!0;if(d){for(b=0;b<c.length;b++)if(!d.prototype[c[b]]){e=!1;break}d.parseHTML||(e=!1)}else e=!1;return e?d:a}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/binders",b):a.__MK_BINDERS=b()}(this,function(a){var b,c=function(a,b,c){for(var d,e,f=a.length,g=0,h=0,i=[];f>h;h++)e=a[h],b?(d=new FileReader,d.onloadend=function(a){e.readerResult=d.result,i[g++]=e,g==f&&c(i)},d["readAs"+b[0].toUpperCase()+b.slice(1)](e)):(i[g++]=e,g==f&&c(i))};return b={innerHTML:function(){return{on:null,getValue:function(){return this.innerHTML},setValue:function(a){this.innerHTML=null===a?"":a+""}}},className:function(a){
var b,c=0===a.indexOf("!");return c&&(a=a.replace("!","")),{on:null,getValue:function(){return b=this.classList.contains(a),c?!b:!!b},setValue:function(b){this.classList.toggle(a,c?!b:!!b)}}},property:function(a){return{on:null,getValue:function(){return this[a]},setValue:function(b){try{this[a]=b}catch(c){}}}},attribute:function(a){return{on:null,getValue:function(){return this.getAttribute(a)},setValue:function(b){this.setAttribute(a,b)}}},dataset:function(a){return{on:null,getValue:function(){return this.dataset[a]},setValue:function(b){this.dataset[a]=b}}},textarea:function(){return b.input("text")},progress:function(){return b.input()},input:function(a,b){var c;switch(a){case"checkbox":return{on:"click keyup",getValue:function(){return this.checked},setValue:function(a){this.checked=a}};case"radio":return{on:"click keyup",getValue:function(){return this.value},setValue:function(a){this.checked=this.value==a}};case"submit":case"button":case"image":case"reset":return{};case"hidden":c=null;
break;case"file":c="change";break;case"text":case"password":c=8==document.documentMode?"keyup paste":"input";break;default:c="input"}return{on:c,getValue:function(){return this.value},setValue:function(a){this.value!=a&&(this.value=a)}}},select:function(a){var b;return a?{on:"change",getValue:function(){return[].slice.call(this.options).filter(function(a){return a.selected}).map(function(a){return a.value})},setValue:function(a){for(a="string"==typeof a?[a]:a,b=this.options.length-1;b>=0;b--)this.options[b].selected=~a.indexOf(this.options[b].value)}}:{on:"change",getValue:function(){return this.value},setValue:function(a){var c,d=this;if(d.value=a,!a)for(c=d.options,b=c.length-1;b>=0;b--)c[b].value||(c[b].selected=!0)}}},visibility:function(a){return a="undefined"==typeof a?!0:a,{on:null,getValue:null,setValue:function(b){this.style.display=a?b?"":"none":b?"none":""}}},file:function(a){if("undefined"!=typeof FileList)return{on:function(b){var d=function(){var d=this.files;d.length?c(d,a,function(a){
b(a)}):b([])};this.addEventListener("change",d)},getValue:function(a){var b=a.domEvent||[];return this.multiple?b:b[0]||null}};throw Error("file binder is not supported at this browser")},style:function(a){return{getValue:function(){return window.getComputedStyle?getComputedStyle(this,null).getPropertyValue(a):this.currentStyle[a]},setValue:function(b){this.style[a]=b}}}}}),function(a,b){"function"==typeof define&&define.amd?define("matreshka-magic",["matreshka_dir/balalaika-extended","matreshka_dir/dollar-lib","matreshka_dir/binders"],b):a.magic=a.MatreshkaMagic=b(a.$b,a.__DOLLAR_LIB,a.__MK_BINDERS)}(this,function(a,b,c){var d,e,f,g,h,i,j=function(a){return a._initMK?a._initMK():d.initMK(a),a},k=function(a,c){var e,f,g,i,j,k,l,m,n=b();for(i=c.replace(/:sandbox/g,":bound(sandbox)").split(","),k=0;k<i.length;k++)if(j=i[k],e=/:bound\(([^(]*)\)(.*)/.exec(h(j)))if(f=a.$bound(e[1]),j=h(e[2]))if(0===j.indexOf(">"))for(l=0;l<f.length;l++)g=f[l],m=d.randomString(),g.setAttribute(m,m),n=n.add(b("["+m+'="'+m+'"]'+j,g)),
g.removeAttribute(m);else n=n.add(f.find(j));else n=n.add(f);else n=n.add(j);return n};return d={domEvents:{list:{},add:function(a){a.node&&("function"==typeof a.on?a.on.call(a.node,a.handler):b(a.node).on(a.on.split(/\s/).join(".mk ")+".mk",a.handler)),(this.list[a.instance[i].id]=this.list[a.instance[i].id]||[]).push(a)},remove:function(a){var c,e,f=this.list[a.instance[i].id];if(f)for(e=0;e<f.length;e++)c=f[e],c.node===a.node&&(c.mkHandler&&d._off(a.instance,"_runbindings:"+a.key,c.mkHandler),"string"==typeof c.on&&b(a.node).off(c.on+".mk",c.handler),c.removed=!0,this.list[a.instance[i].id].splice(e--,1))}},initMK:function(a){return a[i]||Object.defineProperty(a,i,{value:{events:{},special:{},id:"mk"+Math.random()},enumerable:!1,configurable:!1,writable:!1}),a},on:function(a,b,c,e,f,g){if(!a)return a;j(a);var i,k;if("object"==typeof b&&!(b instanceof Array)){for(k in b)b.hasOwnProperty(k)&&d.on(a,k,b[k],c,e);return a}if(!c)throw Error('callback is not function for event(s) "'+b+'"');for(b=b instanceof Array?b:h(b).replace(/\s+/g," ").split(/\s(?![^(]*\))/g),
"boolean"!=typeof e&&"undefined"!=typeof e&&(i=f,f=e,e=i),k=0;k<b.length;k++)d._on(a,b[k],c,f,g);return e===!0&&c.call(f||a,{triggeredOnInit:!0}),a},_fastAddListener:function(a,b,c,e,f){var g=a[i].events,h=g[b]||(g[b]=[]);return h.push({callback:c,context:e,ctx:e||a,name:b}),0===b.indexOf("change:")&&d._defineSpecial(a,b.replace("change:","")),a},_addListener:function(a,b,c,e,f){if(!a||"object"!=typeof a)return a;j(a);var g,h,k,l,m=e||a,n=a[i].events,o=n[b]||(n[b]=[]),p=o.length,q=/([^\:\:]+)(::([^\(\)]+)?(\((.*)\))?)?/,r={callback:c,context:e,ctx:m,name:b};for(g=0;p>g;g++)if(h=o[g],(h.callback==c||h.callback==c._callback)&&h.context==e)return a;if(f){k={};for(g in f)k[g]=f[g];for(g in r)k[g]=r[g]}else k=r;return o.push(k),l=q.exec(b),l&&l[2]?d._addDOMListener(a,l[3]||"sandbox",l[1],l[5],c,m,k):0===b.indexOf("change:")&&d._defineSpecial(a,b.replace("change:","")),n["addevent:"+b]&&d._trigger(a,"addevent:"+b),a},_removeListener:function(a,b,c,e,f){if(!a||"object"!=typeof a||!a[i]||!a[i].events)return a;
var g,h,j,k=a[i].events[b]||[],l=a[i].events[b]=[],m=/([^\:\:]+)(::([^\(\)]+)(\((.*)\))?)?/,n=0,o=k.length;if(f=f||{},j=m.exec(b),j&&j[2])d._removeDOMListener(a,j[3],j[1],j[5],c,e);else{for(h=0;o>h;h++)g=k[h],(g.howToRemove?!g.howToRemove(g,f):c&&c!==g.callback&&c._callback!==g.callback||e&&e!==g.context)&&(l[n++]=g);l.length||delete a[i].events[b]}return a},_delegateListener:function(a,b,c,e,f,g){if(!a||"object"!=typeof a)return a;j(a);var h,k=/([^\.]+)\.(.*)/.exec(b),l=k?k[1]:b;if(b=k?k[2]:"",g=g||{},l)if("*"==l)if(a.isMKArray)h=function(h){(h&&h.added?h.added:a).forEach(function(a){a&&d._delegateListener(a,b,c,e,f,g)})},h._callback=e,d._addListener(a,"add",h,f,g),h();else{if(!a.isMKObject)throw Error('"*" events are only allowed for MK.Array and MK.Object');h=function(h){var j=a[h.key];j&&h&&h.key in a[i].keys&&d._delegateListener(j,b,c,e,f,g)},a.each(function(a){d._delegateListener(a,b,c,e,f,g)}),h._callback=e,d._addListener(a,"change",h,f,g)}else h=function(h){if(!h||!h._silent){var j,k,m,n=a[l],o=!0;
if(g.path=b,g.previousValue=h&&h.previousValue||g.previousValue&&g.previousValue[l],h&&h.previousValue&&h.previousValue[i]&&d._undelegateListener(h.previousValue,b,c,e,f,g),"object"==typeof n&&n&&d._delegateListener(n,b,c,e,f,g),0===c.indexOf("change:")&&(j=c.replace("change:",""),!b&&g.previousValue&&g.previousValue[j]!==n[j])){if(m=g.previousValue[i].events[c])for(k=0;k<m.length;k++)m[k].path===b&&(o=!1);o&&d.set(n,j,n[j],{force:!0,previousValue:g.previousValue[j],previousObject:g.previousValue,_silent:!0})}}},h._callback=e,d._addListener(a,"change:"+l,h,f,g),h();else d._addListener(a,c,e,f,g)},_delegateTreeListener:function(a,b,c,e,g,h){if(!a||"object"!=typeof a)return a;var i;return i=function(f){var i=a[f.key];i&&(d._delegateListener(i,b,c,e,g,h),d._delegateTreeListener(i,b,c,e,g,h))},f(a,function(a){d._delegateListener(a,b,c,e,g,h),d._delegateTreeListener(a,b,c,e,g,h)}),i._callback=e,d._addListener(a,"change",i,g,h),a},_undelegateListener:function(a,b,c,e,f,g){if(!a||"object"!=typeof a)return a;
var h,j,k=/([^\.]+)\.(.*)/.exec(b),l=k?k[1]:b,m=b;if(b=k?k[2]:"",l)if("*"==l){if(a.isMKArray){if(e)d._undelegateListener(a,b,"add",e,f,g);else for(h=a[i].events.add||[],j=0;j<h.length;j++)h[j].path==m&&d._undelegateListener(a,b,"add",h[j].callback);a.forEach(function(a){a&&d._undelegateListener(a,b,c,e,f)})}else if(a.isMKObject){if(e)d._undelegateListener(a,b,"change",e,f);else for(h=a[i].events.change||[],j=0;j<h.length;j++)h[j].path==m&&d._undelegateListener(a,b,"change",h[j].callback);a.each(function(a){a&&d._undelegateListener(a,b,c,e,f)})}}else{if(e)d._removeListener(a,"change:"+l,e,f,g);else for(h=a[i].events["change:"+l]||[],j=0;j<h.length;j++)h[j].path==m&&d._removeListener(a,"change:"+l,h[j].callback);"object"==typeof a[l]&&d._undelegateListener(a[l],b,c,e,f,g)}else d._removeListener(a,c,e,f,g)},_addDOMListener:function(a,c,e,f,g,h,k){if(!a||"object"!=typeof a)return a;j(a),f=f||null,k=k||{};var l=function(d){var e,i,j=this,k=b(j),l={self:a,node:j,$nodes:k,key:c,domEvent:d,originalEvent:d.originalEvent||d,
preventDefault:function(){d.preventDefault()},stopPropagation:function(){d.stopPropagation()},which:d.which,target:d.target};f?(e="x"+String(Math.random()).split(".")[1],j.setAttribute(e,e),i="["+e+'="'+e+'"] '+f,b(d.target).is(i+","+i+" *")&&g.call(h,l),j.removeAttribute(e)):g.call(h,l)},m=e+"."+a[i].id+c,n=function(a){a&&a.$nodes&&a.$nodes.on(m,l)},o=function(a){a&&a.$nodes&&a.$nodes.off(m,l)};return d._defineSpecial(a,c),n._callback=o._callback=g,d._addListener(a,"bind:"+c,n,h,k),d._addListener(a,"unbind:"+c,o,h,k),n({$nodes:a[i].special[c]&&a[i].special[c].$nodes}),a},_removeDOMListener:function(a,b,c,e,f,g,h){return a&&"object"==typeof a&&a[i]&&a[i].events?(e=e||null,h=h||{},b&&a[i].special[b]&&(a[i].special[b].$nodes.off(c+"."+a[i].id+b),d._removeListener(a,"bind:"+b,f,g,h),d._removeListener(a,"unbind:"+b,f,g,h)),a):a},_on:function(a,b,c,e){if(!a)return a;j(a);var f,g=b.lastIndexOf("@");return~g?(f=b.slice(0,g).replace(/([^@]*)@/g,function(a,b){return(b||"*")+"."}).replace(/\.$/,".*")||"*",
b=b.slice(g+1),d._delegateListener(a,f,b,c,e||a)):d._addListener(a,b,c,e),a},_off:function(a,b,c,e){if(!a)return a;j(a);var f,g=b.lastIndexOf("@");return~g?(f=b.slice(0,g),b=b.slice(g+1).replace(/@/g,"."),d._undelegateListener(a,f,b,c,e)):d._removeListener(a,b,c,e),a},once:function(a,b,c,e,f){var g;if(!a||"object"!=typeof a)return a;if("object"==typeof b){for(g in b)b.hasOwnProperty(g)&&d.once(a,g,b[g],c,e);return a}if(!c)throw Error('callback is not function for event "'+b+'"');for(j(a),b=b.split(/\s/),g=0;g<b.length;g++)!function(b){var f=function(a){var b,c=!1;return function(){return c?b:(c=!0,b=a.apply(this,arguments),a=null,b)}}(c);f._callback=c,d._on(a,b,f,e)}(b[g]);return a},onDebounce:function(a,b,c,e,f,g,h){if(!a||"object"!=typeof a)return a;var i,j;if("object"==typeof b){for(j in b)b.hasOwnProperty(j)&&d.onDebounce(a,j,b[j],c,e,f,g);return a}return"number"!=typeof e&&(h=g,g=f,f=e,e=0),i=d.debounce(c,e),i._callback=c,d.on(a,b,i,f,g,h)},_defineSpecial:function(a,c,e){if(!a||"object"!=typeof a||!a[i])return a;
var f=a[i].special[c];return f||(f=a[i].special[c]={$nodes:b(),value:a[c],getter:null,setter:null,mediator:null},e||Object.defineProperty(a,c,{configurable:!0,enumerable:!0,get:function(){return f.getter?f.getter.call(a):f.value},set:function(b){f.setter?f.setter.call(a,b):d.set(a,c,b,{fromSetter:!0})}})),f},mediate:function(a,b,c){if(!a||"object"!=typeof a)return a;j(a);var e,f,g=typeof b;if("object"==g&&!(b instanceof Array)){for(e in b)b.hasOwnProperty(e)&&d.mediate(a,e,b[e]);return a}for(b="string"==g?b.split(/\s/):b,e=0;e<b.length;e++)(function(b){f=d._defineSpecial(a,b),f.mediator=function(d){return c.call(a,d,f.value,b,a)},d.set(a,b,f.mediator(f.value),{fromMediator:!0})})(b[e]);return a},setClassFor:function(a,b,c,e){if(!a||"object"!=typeof a)return a;j(a);var f,g=typeof b;if("object"==g&&!(b instanceof Array)){for(f in b)b.hasOwnProperty(f)&&d.setClassFor(a,f,b[f],c);return a}for(b="string"==g?b.split(/\s/):b,e=e||function(a,b){var c;for(c in b)b.hasOwnProperty(c)&&(a[c]=b[c])},
f=0;f<b.length;f++)d.mediate(a,b[f],function(b,d){var f;return d instanceof c?(e.call(a,d,b),f=d):f=new c(b),f});return a},linkProps:function(a,b,c,e,f){if(!a||"object"!=typeof a)return a;j(a),c="string"==typeof c?c.split(/\s/):c;var g,h,k,l,m,n=function(f){var j=[],n=f._protect=f._protect||{};if(f.fromDependency=!0,!(b+a[i].id in n)){if("object"==typeof c[0])for(l=0;l<c.length;l+=2)for(g=c[l],k="string"==typeof c[l+1]?c[l+1].split(/\s/):c[l+1],m=0;m<k.length;m++)j.push(g[k[m]]);else for(l=0;l<c.length;l++)h=c[l],g=a,j.push(g[h]);n[b+a[i].id]=1,d.set(a,b,e.apply(a,j),f)}};if(e=e||function(a){return a},"object"==typeof c[0])for(l=0;l<c.length;l+=2)for(g=j(c[l]),k="string"==typeof c[l+1]?c[l+1].split(/\s/):c[l+1],m=0;m<k.length;m++)d._defineSpecial(g,k[m]),d._fastAddListener(g,"_rundependencies:"+k[m],n);else for(l=0;l<c.length;l++)h=c[l],g=a,d._defineSpecial(g,h),d._fastAddListener(g,"_rundependencies:"+h,n);return f!==!1&&n.call("object"==typeof c[0]?c[0]:a,{key:"object"==typeof c[0]?c[1]:c[0]
}),a},off:function(a,b,c,e){var f;if("object"==typeof b&&!(b instanceof Array)){for(f in b)b.hasOwnProperty(f)&&d.off(a,f,b[f],c);return a}if(!b&&!c&&!e&&a[i])return a[i].events={},a;if(b=h(b).replace(/\s+/g," ").split(/\s(?![^(]*\))/g),"object"!=typeof a)return a;for(f=0;f<b.length;f++)a._off?a._off(b[f],c,e):d._off(a,b[f],c,e);return a},trigger:function(a,b){if(!a||"object"!=typeof a||!a[i]||!a[i].events)return a;var c,f;if(b)for(c=e(arguments),b=b.split(/\s/),f=0;f<b.length;f++)c=c.slice(),d._trigger.apply(d,c);return a},_trigger:function(a,b){var c,d,f,g,h=a&&"object"==typeof a&&a[i]&&a[i].events&&a[i].events[b];if(h)for(c=e(arguments,2),d=-1,f=h.length;++d<f;)(g=h[d]).callback.apply(g.ctx,c);return a},_fastTrigger:function(a,b,c){var d,e,f,g=a[i].events[b];if(g)for(d=-1,e=g.length;++d<e;)(f=g[d]).callback.call(f.ctx,c)},bindNode:function(a,b,c,e,f,g){if(!a||"object"!=typeof a)return a;j(a);var i,k,l,m,n,o,p,q,r,s,t,u,v,w="undefined"==typeof a[b];if(b instanceof Array){for(l=0;l<b.length;l++)d.bindNode(a,b[l][0],b[l][1],b[l][2]||f,c);
return a}if("string"==typeof b&&(k=h(b).split(/\s+/),k.length>1)){for(l=0;l<k.length;l++)d.bindNode(a,k[l],c,e,f);return a}if("object"==typeof b){for(l in b)b.hasOwnProperty(l)&&d.bindNode(a,l,b[l],c,e,f);return a}if(c&&2==c.length&&!c[1].nodeName&&(c[1].setValue||c[1].getValue||c[1].on))return d.bindNode(a,b,c[0],c[1],e,f);if(o=b.indexOf("."),~o)return p=b.split("."),q=function(b){var f=b&&b.value;if(!f){f=a;for(var h=0;h<p.length-1;h++)f=f[p[h]]}d.bindNode(f,p[p.length-1],c,e,b,g),b&&b.previousValue&&d.unbindNode(b.previousValue,p[p.length-1],c)},d._delegateListener(a,p.slice(0,p.length-2).join("."),"change:"+p[p.length-2],q),q(),a;if(i=d._getNodes(a,c),!i.length){if(g)return a;throw Error('Binding error: node is missing for key "'+b+'".'+("string"==typeof c?' The selector is "'+c+'"':""))}if(f=f||{},n=d._defineSpecial(a,b,"sandbox"==b),n.$nodes=n.$nodes.length?n.$nodes.add(i):i,a.isMK&&("sandbox"==b&&(a.$sandbox=i,a.sandbox=i[0]),a.$nodes[b]=n.$nodes,a.nodes[b]=n.$nodes[0]),"sandbox"!=b)for(l=0;l<i.length;l++)(function(c){
var g,h={self:a,key:b,$nodes:i,node:c};if(null===e)g={};else if(u="sandbox"==b?null:d.lookForBinder(c)){if(e)for(m in e)u[m]=e[m];g=u}else g=e||{};if(g.initialize){s={value:n.value};for(m in h)s[m]=h[m];g.initialize.call(c,s)}if(g.setValue&&(t=function(d){var e=a[b];if(!d||d.changedNode!=c||d.onChangeValue!=e){s={value:e};for(m in h)s[m]=h[m];g.setValue.call(c,e,s)}},d._fastAddListener(a,"_runbindings:"+b,t),!w&&t()),g.getValue&&(w&&f.assignDefaultValue!==!1||f.assignDefaultValue===!0)){v={fromNode:!0};for(m in f)v[m]=f[m];d.set(a,b,g.getValue.call(c,h),v)}g.getValue&&g.on&&(r={node:c,on:g.on,instance:a,key:b,mkHandler:t,handler:function(e){if(!r.removed){var f,i,j=a[b],k={value:j,domEvent:e,originalEvent:e.originalEvent||e,preventDefault:function(){e.preventDefault()},stopPropagation:function(){e.stopPropagation()},which:e.which,target:e.target};for(i in h)k[i]=h[i];f=g.getValue.call(c,k),f!==j&&d.set(a,b,f,{fromNode:!0,changedNode:c,onChangeValue:f})}}},d.domEvents.add(r))})(i[l]);if(!f.silent){
v={key:b,$nodes:i,node:i[0]||null};for(l in f)v[l]=f[l];d._fastTrigger(a,"bind:"+b,v),d._fastTrigger(a,"bind",v)}return a},bindOptionalNode:function(a,b,c,e,f){return"object"==typeof b?d.bindNode(a,b,c,e,!0):d.bindNode(a,b,c,e,f,!0),a},unbindNode:function(a,b,c,e){if(!a||"object"!=typeof a)return a;j(a);var g,h,k,l,m,n,o=typeof b,p=a[i].special[b];if(b instanceof Array){for(k=0;k<b.length;k++)e=c,d.unbindNode(a,b[k][0],b[k][1]||e,e);return a}if("string"==o&&(h=b.split(/\s/),h.length>1)){for(k=0;k<h.length;k++)d.unbindNode(a,h[k],c,e);return a}if(l=b.indexOf("."),~l){m=b.split(".");var q=a;for(k=0;k<m.length-1;k++)q=q[m[k]];return d._undelegateListener(a,m.slice(0,m.length-2),"change:"+m[m.length-2]),d.unbindNode(q,m[m.length-1],c,e),a}if(null===b){for(b in a[i].special)a[i].special.hasOwnProperty(b)&&d.unbindNode(a,b,c,e);return a}if("object"==o){for(k in b)b.hasOwnProperty(k)&&d.unbindNode(a,k,b[k],c);return a}if(!c)return p&&p.$nodes?d.unbindNode(a,b,p.$nodes,e):a;if(2==c.length&&!c[1].nodeName&&(c[1].setValue||c[1].getValue||c[1].on))return d.unbindNode(a,b,c[0],e);
if(!p)return a;if(g=d._getNodes(a,c),f(g,function(c,e){d.domEvents.remove({key:b,node:c,instance:a}),p.$nodes=p.$nodes.not(c)}),a.isMK&&(a.$nodes[b]=p.$nodes,a.nodes[b]=p.$nodes[0]||null,"sandbox"==b&&(a.sandbox=p.$nodes[0]||null,a.$sandbox=p.$nodes)),!e||!e.silent){n={key:b,$nodes:g,node:g[0]||null};for(k in e)n[k]=e[k];d._fastTrigger(a,"unbind:"+b,n),d._fastTrigger(a,"unbind",n)}return a},selectAll:function(a,c){return a&&"object"==typeof a&&a.$sandbox?(j(a),/:sandbox|:bound\(([^(]*)\)/.test(c)?k(a,c):a.$sandbox.find(c)):b()},select:function(a,b){return d.selectAll(a,b)[0]||null},boundAll:function(a,c){if(!a||"object"!=typeof a)return b();j(a);var d,e,f,g=a[i].special;if(c=c?c:"sandbox",d="string"==typeof c?c.split(/\s+/):c,d.length<=1)return d[0]in g?g[d[0]].$nodes:b();for(e=b(),f=0;f<d.length;f++)e=e.add(g[d[f]].$nodes);return e},$bound:function(a,b){return d.boundAll(a,b)},bound:function(a,b){if(!a||"object"!=typeof a)return null;j(a);var c,d,e=a[i].special;if(b=b?b:"sandbox",c="string"==typeof b?b.split(/\s+/):b,
c.length<=1)return c[0]in e?e[c[0]].$nodes[0]||null:null;for(d=0;d<c.length;d++)if(c[d]in e&&e[c[d]].$nodes.length)return e[c[d]].$nodes[0];return null},get:function(a,b){return a&&a[b]},set:function(a,b,c,e){if(!a||"object"!=typeof a)return a;var f,g,h,j,k,l,m,n=typeof b,o=Number.isNaN||function(a){return"number"==typeof a&&isNaN(a)};if("undefined"==n)return a;if("object"==n){for(k in b)b.hasOwnProperty(k)&&d.set(a,k,b[k],c);return a}if(!a[i]||!a[i].special||!a[i].special[b])return a[b]=c,a;if(f=a[i].special[b],g=a[i].events,h=f.value,j=!f.mediator||c===h||e&&(e.skipMediator||e.fromMediator)?c:f.mediator(c,h,b,a),l={value:j,previousValue:h,key:b,node:f.$nodes[0]||null,$nodes:f.$nodes,self:a},e&&"object"==typeof e)for(k in e)l[k]=e[k];return m=(j!==h||l.force)&&!l.silent,m&&(g["beforechange:"+b]&&d._fastTrigger(a,"beforechange:"+b,l),g.beforechange&&d._fastTrigger(a,"beforechange",l)),f.value=j,(j!==h||l.force||l.forceHTML||j!==c&&!o(j))&&(l.silentHTML||g["_runbindings:"+b]&&d._fastTrigger(a,"_runbindings:"+b,l)),
m&&(g["change:"+b]&&d._fastTrigger(a,"change:"+b,l),g.change&&d._fastTrigger(a,"change",l)),j===h&&!l.force&&!l.forceHTML||l.skipLinks||g["_rundependencies:"+b]&&d._fastTrigger(a,"_rundependencies:"+b,l),a},_parseBindings:function(a,c){if(!a||"object"!=typeof a)return null;j(a);var e="string"==typeof c?d.$.parseHTML(c.replace(/^\s+|\s+$/g,"")):b(c),g=e.find("*").add(e);return f(g,function(a){!function f(a){"TEXTAREA"!==a.tagName&&f(a.childNodes,function(b){var c,d=b.previousSibling;3==b.nodeType&&~b.nodeValue.indexOf("{{")?(c=b.nodeValue.replace(/{{([^}]*)}}/g,'<mk-bind mk-html="$1"></mk-bind>'),d?d.insertAdjacentHTML("afterend",c):a.insertAdjacentHTML("afterbegin",c),a.removeChild(b)):1==b.nodeType&&f(b)})}(a)}),g=e.find("*").add(e),f(g,function(b){var c=b.getAttribute("mk-html");c&&(d.bindNode(a,c,b,d.binders.innerHTML()),b.removeAttribute("mk-html")),f(b.attributes,function(c){var e,f,g=h(c.value),i=c.name;~g.indexOf("{{")&&(e=g.match(/{{[^}]*}}/g).map(function(a){return a.replace(/{{(.*)}}/,"$1");
}),1==e.length&&/^{{[^}]*}}$/g.test(g)?f=e[0]:(f=d.randomString(),d.linkProps(a,f,e,function(){var b=g;return e.forEach(function(c){b=b.replace(new RegExp("{{"+c+"}}","g"),a[c])}),b})),("value"==i&&"checkbox"!=b.type||"checked"==i&&"checkbox"==b.type)&&d.lookForBinder(b)?d.bindNode(a,f,b):d.bindNode(a,f,b,d.binders.attribute(i)))})}),e},remove:function(a,b,c){if(!a||"object"!=typeof a)return null;var e,f,g=String(b).split(/\s/),h={keys:g};if(c&&"object"==typeof c)for(f in c)h[f]=c[f];for(f=0;f<g.length;f++)if(b=g[f],e=b in a){h.key=b,h.value=a[b];try{delete a[b]}catch(j){}a[i]&&(d.unbindNode(a,b),d.off(a,"change:"+b+" beforechange:"+b+" _runbindings:"+b+" _rundependencies:"+b),delete a[i].special[b],h.silent||(d._fastTrigger(a,"delete",h),d._fastTrigger(a,"delete:"+b,h)))}return a},_getNodes:function(a,c){return"string"==typeof c&&!/</.test(c)&&/:sandbox|:bound\(([^(]*)\)/.test(c)?k(a,c):b(c)},define:function(a,b,c){if(!a||"object"!=typeof a)return a;var e;if("object"==typeof b){for(e in b)d.define(a,e,b[e]);
return a}return Object.defineProperty(a,b,c),a},defineGetter:function(a,b,c){if(!a||"object"!=typeof a)return a;j(a);var e,f;if("object"==typeof b){for(e in b)b.hasOwnProperty(e)&&d.defineGetter(a,e,b[e]);return a}return f=d._defineSpecial(a,b),f.getter=function(){return c.call(a,{value:f.value,key:b,self:a})},a},defineSetter:function(a,b,c){if(!a||"object"!=typeof a)return a;j(a);var e;if("object"==typeof b){for(e in b)b.hasOwnProperty(e)&&d.defineSetter(a,e,b[e]);return a}return d._defineSpecial(a,b).setter=function(d){return c.call(a,d,{value:d,key:b,self:a})},a},delay:function(a,b,c,d){return"object"==typeof c&&(d=c,c=0),setTimeout(function(){b.call(d||a)},c||0),a},trim:h=function(a){return a.trim?a.trim():a.replace(/^\s+|\s+$/g,"")},toArray:e=function(a,b){var c,d=[],e=a.length;for(b=b||0,c=b;e>c;c++)d[c-b]=a[c];return d},extend:g=function(a,b){var c,d;if(a)for(c=1;c<arguments.length;c++)if(b=arguments[c])for(d in b)b.hasOwnProperty(d)&&(a[d]=b[d]);return a},each:f=function(a,b,c){
if(a){if(a.isMK&&"function"==typeof a.each)a.each(b,c);else if("length"in a)[].forEach.call(a,b,c);else for(var d in a)a.hasOwnProperty(d)&&b.call(c,a[d],d,a);return a}},randomString:function(){return((new Date).getTime()-new Date(2013,4,3).getTime()).toString(36)+Math.floor(1679616*Math.random()).toString(36)},binders:c,defaultBinders:[function(a){var b,d=a.tagName;return"INPUT"==d?b=c.input(a.type):"TEXTAREA"==d?b=c.textarea():"SELECT"==d?b=c.select(a.multiple):"PROGRESS"==d&&(b=c.progress()),b}],lookForBinder:function(a){var b,c,e=d.defaultBinders;for(c=0;c<e.length;c++)if(b=e[c].call(a,a))return b},debounce:function(a,b,c){var d;return"number"!=typeof b&&(c=b,b=0),function(){var e=arguments,f=this;clearTimeout(d),d=setTimeout(function(){a.apply(c||f,e)},b||0)}},noop:function(){},$:b,$b:a,useAs$:function(a){return d.$=this.$=b=a}},i=d.sym="undefined"==typeof Symbol?"mk-"+d.randomString():Symbol("matreshka"),d}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/matreshka-core",["xclass","matreshka-magic"],b):a.MK=a.Matreshka=b(a.Class,a.MatreshkaMagic);
}(this,function(a,b){if(!a)throw Error("Class function is missing");if(![].forEach)throw Error("Internet Explorer 8 requires to use es5-shim: https://github.com/es-shims/es5-shim");var c=(b.toArray,b.extend),d=b.sym,e=a({isMK:!0,on:function(a,c,d,e,f){return b.on(this,a,c,d,e,f)},onDebounce:function(a,c,d,e,f,g){return b.onDebounce(this,a,c,d,e,f,g)},_on:function(a,c,d,e){return b._on(this,a,c,d,e)},once:function(a,c,d){return b.once(this,a,c,d)},off:function(a,c,d){return b.off(this,a,c,d)},_off:function(a,c,d){return b._off(this,a,c,d)},trigger:function(){var a=b.toArray(arguments);return a.unshift(this),b.trigger.apply(b,a)},_trigger:function(){var a=b.toArray(arguments);return a.unshift(this),b._trigger.apply(b,a)},bindNode:function(a,c,d,e,f){return b.bindNode(this,a,c,d,e,f)},bindOptionalNode:function(a,c,d,e){return b.bindOptionalNode(this,a,c,d,e)},unbindNode:function(a,c,d){return b.unbindNode(this,a,c,d)},boundAll:function(a){return b.boundAll(this,a)},$bound:function(a){return b.boundAll(this,a);
},bound:function(a){return b.bound(this,a)},selectAll:function(a){return b.selectAll(this,a)},$:function(a){return b.selectAll(this,a)},select:function(a){return b.select(this,a)},_defineSpecial:function(a){return b._defineSpecial(this,a)},eq:function(a){return"object"==typeof a&&null!==a&&this[d]&&a[d]&&this[d].id==a[d].id},defineGetter:function(a,c){return b.defineGetter(this,a,c)},defineSetter:function(a,c){return b.defineSetter(this,a,c)},mediate:function(a,c){return b.mediate(this,a,c)},setClassFor:function(a,c,d){return b.setClassFor(this,a,c,d)},linkProps:function(a,c,d,e){return b.linkProps(this,a,c,d,e)},get:function(a){return this[a]},set:function(a,c,d){return b.set(this,a,c,d)},remove:function(a,c){return b.remove(this,a,c)},define:function(a,c){return b.define(this,a,c)},delay:function(a,c,d){return b.delay(this,a,c,d)},_initMK:function(){var a=this;return a[d]?a:(b.initMK(a),a.nodes=a.nodes={},a.$nodes=a.$nodes={},a.sandbox=a.sandbox||null,a.$sandbox=a.$sandbox||e.$(),a.Matreshka=e,
a)},toString:function(){return"[object Matreshka]"},constructor:function Matreshka(){this._initMK()}});return c(e,b,{version:"dev",Class:a,isXDR:a.isXDR,to:function(a){var b,c;if("object"==typeof a)if("length"in a){for(b=[],c=0;c<a.length;c++)b[c]=e.to(a[c]);b=(new e.Array).recreate(b)}else{b={};for(c in a)a.hasOwnProperty(c)&&(b[c]=e.to(a[c]));b=new e.Object(b)}else b=a;return b}}),e}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/matreshka-object",["matreshka_dir/matreshka-core"],b):b(a.MK)}(this,function(a){if(!a)throw new Error("Matreshka is missing");var b,c=a.sym,d={"extends":a,isMKObject:!0,renderer:null,constructor:function MatreshkaObject(a){this.jset(a)},keys:function(){var a,b=this._initMK(),d=b[c].keys,e=[];for(a in d)d.hasOwnProperty(a)&&e.push(a);return e},_initMK:function(){var b,d=this;return d[c]?d:(a.prototype._initMK.call(d,arguments),d[c].keys={},a._fastAddListener(d,"addevent:modify",function(e){b||(a._fastAddListener(d,"change",function(b){
b&&b.key in d[c].keys&&!b.silent&&a._fastTrigger(d,"modify",b)}),a._fastAddListener(d,"delete",function(b){b&&b.key in d[c].keys&&(d.removeDataKeys(b.key),b.silent||a._fastTrigger(d,"modify",b))}),b=!0)}),d)},hasOwnProperty:function(a){return this._initMK()[c].keys.hasOwnProperty(a)},toObject:function(){var a,b=this._initMK(),d={},e=b[c].keys;for(a in e)e.hasOwnProperty(a)&&(d[a]=b[a]);return d},toNative:function(){return this.toObject()},toJSON:function(){var a,b=this._initMK(),d={},e=b[c].keys;for(a in e)e.hasOwnProperty(a)&&(d[a]=b[a]&&b[a].toJSON?b[a].toJSON():b[a]);return d},keyOf:function(a){var b,d=this._initMK(),e=d[c].keys;for(b in e)if(e.hasOwnProperty(b))if(a&&a.isMK){if(a.eq(d[b]))return b}else if(a===d[b])return b;return null},jset:function(a,d,e){var f=this._initMK(),g=typeof a;if("undefined"==g)return f;if(a&&"object"==g){a=a.toJSON?a.toJSON():a;for(b in a)f[c].keys[b]=1,f._defineSpecial(b),f.set(b,a[b],d);return f}return f[c].keys[a]=1,f._defineSpecial(a),f.set(a,d,e)},addDataKeys:function(a){
var d=this._initMK(),e=arguments;if(!e.length)return d;for(a=e.length>1?e:a instanceof Array?a:String(a).split(/\s/),b=0;b<a.length;b++)d[c].keys[a[b]]=1,d._defineSpecial(a[b]);return d},removeDataKeys:function(a){var d=this._initMK(),e=arguments;if(!e.length)return d;for(a=e.length>1?e:a instanceof Array?a:String(a).split(/\s/),b=0;b<a.length;b++)delete d[c].keys[a[b]];return d},each:function(a,b){var d,e=this._initMK();for(d in e[c].keys)e[c].keys.hasOwnProperty(d)&&a.call(b,e[d],d,e);return e}};return d["undefined"!=typeof Symbol?Symbol.iterator:"@@iterator"]=function(){var a=this,b=a.keys(),c=0;return{next:function(){return c>b.length-1?{done:!0}:{done:!1,value:a[b[c++]]}}}},a.Object=a.Class(d)}),function(a,b){"function"==typeof define&&define.amd?define("matreshka_dir/matreshka-array",["matreshka_dir/matreshka-core"],b):b(a.MK)}(this,function(a){if(!a)throw new Error("Matreshka is missing");var b=Array.prototype,c=a.sym,d=a.toArray,e=(b.slice,a.isXDR),f=function(a,b,c,d){if(a.length!=b.length)return!1;
for(c=0,d=a.length;d>c;c++)if(a[c]&&a[c].isMK?!a[c].eq(b[c]):a[c]!==b[c])return!1;return!0},g=e?function(a){var b,c,d=this,e=d.length,f=a&&a.isMK;for(b=0;e>b;b++)if(c=d[b],f?a.eq(c):a===c)return b;return-1}:b.indexOf,h=e?function(a){var b,c,d=this,e=d.length,f=a&&a.isMK;for(b=e-1;b>=0;b--)if(c=d[b],f?a.eq(c):a===c)return b;return-1}:b.lastIndexOf,i=function(b,d,e){var f,g=d.added,h=d.removed,i=b[c].events;if(!d.silent){if(e&&i[e]&&a._fastTrigger(b,e,d),g.length&&(i.add&&a._fastTrigger(b,"add",d),i.addone))for(f=0;f<g.length;f++)a._fastTrigger(b,"addone",{self:b,added:g[f]});if(h.length&&(i.remove&&a._fastTrigger(b,"remove",d),i.removeone))for(f=0;f<h.length;f++)a._fastTrigger(b,"removeone",{self:b,removed:h[f]});(g.length||h.length)&&i.modify&&a._fastTrigger(b,"modify",d)}(g.length||h.length)&&(d.dontRender||b.processRendering(d))},j=function(a,b){b=b||[];var c,d=a.length-b.length;for(c=0;c<b.length;c++)a[c]=b[c];for(c=0;d>c;c++)a.remove(c+b.length,{silent:!0});return a.length=b.length,
a},k=function(c,f){var g,h;switch(c){case"forEach":return function(){var a=this;return b[c].apply(e?a.toArray():a,arguments),a};case"map":case"filter":case"slice":return function(){var d=this;return a.Array.from(b[c].apply(e?d.toArray():d,arguments))};case"every":case"some":case"reduce":case"reduceRight":case"join":return function(){var a=this;return b[c].apply(e?a.toArray():a,arguments)};case"sort":case"reverse":return function(){if(this.length){var a=this._initMK(),k=arguments,l=d(k),m=f?k[k.length-1]||{}:{},n=a.toArray(),o=b[c].apply(n,l);f&&l.pop(),e?(n=a.toArray(),o=b[c].apply(n,l),j(a,n)):o=b[c].apply(a,l),h={returns:o,args:l,originalArgs:k,method:c,self:a,added:[],removed:[]};for(g in m)h[g]=m[g];return i(a,h,c),a}};case"pop":case"shift":return function(){if(this.length){var a,k,l,m,n=this._initMK(),o=arguments,p=d(o),q=f?o[o.length-1]||{}:{};f&&p.pop(),e?(a=n.toArray(),k=b[c].apply(a,p),j(n,a)):k=b[c].apply(n,p),h={returns:k,args:p,originalArgs:o,method:c,self:n,added:l=[],removed:m=[k]
};for(g in q)h[g]=q[g];return i(n,h,c),k}};case"push":case"unshift":return function(){var a,k,l,m,n=this._initMK(),o=arguments,p=d(o),q=f?o[o.length-1]||{}:{};if(f&&p.pop(),!p.length)return n.length;if(!q.skipMediator&&"function"==typeof n._itemMediator)for(g=0;g<p.length;g++)p[g]=n._itemMediator.call(n,p[g],g);e?(a=n.toArray(),k=b[c].apply(a,p),j(n,a)):k=b[c].apply(n,p),h={returns:k,args:p,originalArgs:o,method:c,self:n,added:l=p,removed:m=[]};for(g in q)h[g]=q[g];return i(n,h,c),k};case"splice":return function(){var k,l,m,n=this._initMK(),o=arguments,p=d(o),q=f?o[o.length-1]||{}:{},r=d(p,2);if(f&&p.pop(),!q.skipMediator&&"function"==typeof n._itemMediator)for(g=2;g<p.length;g++)p[g]=n._itemMediator.call(n,p[g],g);if(e?(k=n.toArray(),l=b[c].apply(k,p),j(n,k)):l=b[c].apply(n,p),m=l,r.length||m.length){h={returns:l,args:p,originalArgs:o,method:c,self:n,added:r,removed:m};for(g in q)h[g]=q[g];i(n,h,c)}return a.Array.from(l)}}},l={"extends":a,isMKArray:!0,length:0,itemRenderer:null,renderIfPossible:!0,
useBindingsParser:!1,Model:null,constructor:function MatreshkaArray(a){var b,c=this._initMK(),d=arguments.length;if(1==d&&"number"==typeof a)c.length=a;else{for(b=0;d>b;b++)c[b]=arguments[b];c.length=arguments.length}},mediateItem:function(a){var b,c=this,d=c.length;for(c._itemMediator=a,b=0;d>b;b++)c[b]=a.call(c,c[b],b);return c},recreate:function(a,b){a=a||[];var d,e,f,h,j,k,l,m=this._initMK(),n=m.length-a.length,o=m.toArray();if(b=b||{},m._itemMediator&&!b.skipMediator){for(d=[],e=0;e<a.length;e++)d[e]=m._itemMediator.call(m,a[e],e);a=d}for(e=0;e<a.length;e++)m[e]=a[e];for(e=0;n>e;e++){try{delete m[e+a.length]}catch(p){}delete m[c].special[e+a.length]}if(m.length=a.length,b.silent&&b.dontRender)return m;if(l=m.toArray(),l.length)for(k=[],f=0,e=0;e<o.length;e++)~g.call(l,o[e])||(k[f++]=o[e]);else k=o;if(o.length)for(j=[],f=0,e=0;e<l.length;e++)~g.call(o,l[e])||(j[f++]=l[e]);else j=l;h={added:j,removed:k,was:o,now:l,method:"recreate",self:m};for(e in b)h[e]=b[e];return i(m,h,"recreate"),
m},toArray:function(){var a,b=this,c=[],d=b.length;for(c=[],a=0;d>a;a++)c[a]=b[a];return c},toNative:function(){return this.toArray()},_initMK:function(){var b,d=this;return d[c]?d:(b=function(){var a=d.Model;a&&d.mediateItem(function(b){return b&&b.isMK&&(b&&b.instanceOf?b.instanceOf(a):b instanceof a)?b:new a(b&&b.toJSON?b.toJSON():b,d)})},a.prototype._initMK.call(d),a._fastAddListener(d,"change:Model",b),a._fastAddListener(d,"change:itemRenderer",function(){d.rerender({forceRerender:!0})}),b(),d)},_renderOne:function(b,d){if(b&&b.isMK&&this.renderIfPossible&&!d.dontRender){var e,f,g,h,i,j=this,k=j[c].id,l=b.renderer||j.itemRenderer,m=l===b.renderer?b:j,n=b[c].arraysNodes=b[c].arraysNodes||{},o=n[k];if(l){if(d.moveSandbox&&(o=b.bound(["sandbox"]))&&(n[k]=o),o&&d.forceRerender){for(h=b.boundAll(["sandbox"]),i=0;i<h.length;i++)if(o==h[i]){b.unbindNode("sandbox",o);break}o=n[k]=null}if(!o){if("function"==typeof l&&(l=l.call(m,b)),"string"!=typeof l||/<|{{/.test(l))f=l;else{if(f=m._getNodes(l),
!(f=f&&f[0]))throw Error("renderer node is missing: "+l);f=f.innerHTML}e=j.useBindingsParser?a._parseBindings(b,f):"string"==typeof f?a.$.parseHTML(f.replace(/^\s+|\s+$/g,"")):a.$(f),b.bindRenderedAsSandbox!==!1&&e.length&&a.bindNode(b,"sandbox",e),o=e[0],n[k]=o,g={node:o,$nodes:e,self:b,parentArray:j},b.onRender&&b.onRender(g),j.onItemRender&&j.onItemRender(b,g),a._fastTrigger(b,"render",g)}return o}}},processRendering:function(a){var b,d,e,f=this,g=f[c],h=g.id,i=f.length,j=function(a){var d;return a&&a.isMK?((d=a[c].arraysNodes)&&(b=d[h],delete d[h]),b):void 0},k=g.special.container||g.special.sandbox;if(k=k&&k.$nodes,k=k&&k[0],!k)return f;switch(a.method){case"push":for(d=i-a.added.length;i>d;d++)(b=f._renderOne(f[d],a))&&k.appendChild(b);break;case"unshift":for(d=a.added.length-1;d+1;d--)(b=f._renderOne(f[d],a))&&(k.children?k.insertBefore(b,k.firstChild):k.appendChild(b));break;case"pull":case"pop":case"shift":for(d=0;d<a.removed.length;d++)(b=j(a.removed[d]))&&k.removeChild(b);break;
case"sort":case"reverse":for(d=0;i>d;d++)e=f[d],(b=e&&e.isMK&&e[c].arraysNodes[h])&&k.appendChild(b);break;case"rerender":if(a.forceRerender)for(d=0;i>d;d++)(b=j(f[d]))&&k.removeChild(b);for(d=0;i>d;d++)(b=f._renderOne(f[d],a))&&k.appendChild(b);break;case"recreate":case"splice":for(d=0;d<a.removed.length;d++)(b=j(a.removed[d]))&&k.removeChild(b);for(d=0;i>d;d++)(b=f._renderOne(f[d],a))&&k.appendChild(b)}return f},rerender:function(a){var b,c={method:"rerender"};if(a&&"object"==typeof a)for(b in a)c[b]=a[b];return this.processRendering(c)},hasOwnProperty:function(a){return"length"==a||a<this.length&&a>=0},toJSON:function(){var a,b=this,c=[],d=b.length;for(a=0;d>a;a++)b[a]&&b[a].toJSON?c.push(b[a].toJSON()):c.push(b[a]);return c},concat:function(){var b,c,d,e=arguments,f=this.toArray();for(c=0;c<e.length;c++)if(b=e[c],b instanceof Array||b instanceof a.Array||b&&b.instanceOf&&b.instanceOf(a.Array))for(d=0;d<b.length;d++)f.push(b[d]);return a.Array.from(f)},pull:function(a,b){var c,d,e,g,h=this._initMK(),k=h.toArray(),l=a,m=typeof a;
if("number"!=m&&"string"!=m&&(a=h.indexOf(a),!~a))return null;if(c=k.splice(a,1)[0]||null,!f(k,h)){b=b||{},j(h,k,b),e={returns:c,args:[l],method:"pull",self:h,added:[],removed:d=c?[c]:[]};for(g in b)e[g]=b[g];i(h,e,"pull")}return c},indexOf:g,lastIndexOf:h,toString:function(){return this.toArray().join(",")}};return"push pop unshift shift sort reverse splice map filter slice every some reduce reduceRight forEach join".split(" ").forEach(function(a){l[a]=k(a)}),"push pop unshift shift sort reverse splice".split(" ").forEach(function(a){l[a+"_"]=k(a,1)}),l.each=l.forEach,l["undefined"!=typeof Symbol?Symbol.iterator:"@@iterator"]=function(){var a=this,b=0;return{next:function(){return b>a.length-1?{done:!0}:{done:!1,value:a[b++]}}}},a.Array=a.Class(l),a.Array.of=function(){var b,c=new a.Array,d=arguments;for(c.length=d.length,b=0;b<d.length;b++)c[b]=d[b];return c},a.Array.from=function(b,c,d){var e,f=new a.Array;for(f.length=b.length,e=0;e<b.length;e++)f[e]=c?c.call(d,b[e],e,b):b[e];return f;
},a.Array}),"function"==typeof define&&define.amd&&define("matreshka",["matreshka_dir/matreshka-core","matreshka_dir/matreshka-object","matreshka_dir/matreshka-array"],function(a,b,c,d){return a}),"function"==typeof define&&define.amd?define('matreshka',["matreshka"],function(a){return a.version="1.1.0-alpha.1",a}):(Matreshka.version="1.1.0-alpha.1","object"==typeof exports&&(module.exports=Matreshka));
//# sourceMappingURL=matreshka.min.map;
define('app/article.class',['exports', 'module', 'globals', 'matreshka', 'balalaika'], function (exports, module, _globals, _matreshka, _balalaika) {
	

	var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

	function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

	function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

	var _g = _interopRequireDefault(_globals);

	var _MK = _interopRequireDefault(_matreshka);

	var _$ = _interopRequireDefault(_balalaika);

	var Article = (function (_MK$Object) {
		_inherits(Article, _MK$Object);

		function Article(data) {
			_classCallCheck(this, Article);

			_get(Object.getPrototypeOf(Article.prototype), 'constructor', this).call(this);
			this.set(data).set({
				commentsShown: false
			}).linkProps('ieVersion', [_g['default'].app, 'ieVersion']).bindNode('sandbox', 'article[id="' + this.id + '"]').bindNode('since', ':sandbox', _MK['default'].binders.attribute('data-since')).bindOptionalNode('ieVersion', ':sandbox .comments', _MK['default'].binders.className('hide')).bindNode('menuItem', 'nav a[href="#' + this.id + '"]').bindNode('isActive', ':bound(menuItem)', _MK['default'].binders.className('active')).bindNode('expanded', ':bound(menuItem)', _MK['default'].binders.className('expanded')).bindOptionalNode('commentsContainer', ':sandbox .comments-container').bindOptionalNode('commentsShown', ':bound(commentsContainer)', _MK['default'].binders.visibility()).bindOptionalNode('submenu', 'nav ul[data-submenu="' + this.id + '"]').bindOptionalNode('comment', ':sandbox .comments').bindNode('pagination', this.bound().appendChild((0, _$['default'])(_g['default'].app.select('#pagination-template').innerHTML)[0])).bindNode('name', ':bound(menuItem)', {
				getValue: function getValue() {
					return this.getAttribute('data-name') || this.textContent;
				}
			}).bindNode({
				nextId: ':bound(pagination) .next-page',
				previousId: ':bound(pagination) .previous-page'
			}, {
				setValue: function setValue(v) {
					this.href = '#' + v;
				}
			}).bindNode({
				nextHeader: ':bound(pagination) .next-page',
				previousHeader: ':bound(pagination) .previous-page'
			}, _MK['default'].binders.innerHTML()).bindOptionalNode('header', ':sandbox h2', {
				getValue: function getValue() {
					return this.innerHTML.replace(/<wbr>/g, '');
				}
			}).on('click::menuItem(.expand)', function (evt) {
				this.expanded = !this.expanded;
				evt.preventDefault();
			}).on('change:expanded', function () {
				var submenu = this.bound('submenu');
				if (submenu) {
					if (!this.expanded) {
						submenu.style.marginTop = -44 * this.selectAll(':bound(submenu) a').length + 'px';
					} else {
						submenu.style.marginTop = 0;
						submenu.style.display = 'block';
					}
				}
			}, true).on('change:isActive', function () {
				var node = this.bound('menuItem');

				while (node = node.parentNode) {
					(0, _$['default'])('.submenu-wrapper').filter(function (wrapper) {
						return wrapper.contains(node);
					}).map(function (wrapper) {
						return wrapper.previousElementSibling;
					}).map(function (menuItem) {
						return menuItem.querySelector('.hidden-active-child');
					}).forEach(function (menuItem) {
						menuItem.innerHTML = this.isActive ? this.name : '';
					}, this);
					break;
				}
			}).on('click::comment', function () {
				var url = document.location.origin + document.location.pathname + '#' + this.id,
				    commentsContainer = this.bound('commentsContainer');

				if (this.commentsShown = !this.commentsShown) {
					commentsContainer.classList.add('muut');
					_g['default'].app.muut();
				}
			}).linkProps('_previous', [this, 'previous', _g['default'].app, 'unstableVersion', _g['default'].app, 'version', _g['default'].app, 'articles'], function (previous, unstableVersion, version, articles) {
				if (!previous || version == 'unstable' || !articles) {
					return previous;
				} else {
					do {
						if (previous.since != unstableVersion) {
							return previous;
						}
					} while (previous = previous.previous);
				}
			}).linkProps('_next', [this, 'next', _g['default'].app, 'unstableVersion', _g['default'].app, 'version', _g['default'].app, 'articles'], function (next, unstableVersion, version, articles) {
				if (!next || version == 'unstable' || !articles) {
					return next;
				} else {
					do {
						if (next.since != unstableVersion) {
							return next;
						}
					} while (next = next.next);
				}
			}).linkProps('previousId', '_previous', function (previous) {
				return previous ? previous.id : '';
			}).linkProps('nextId', '_next', function (next) {
				return next ? next.id : '';
			}).linkProps('previousHeader', '_previous', function (previous) {
				return previous ? previous.name : '';
			}).linkProps('nextHeader', '_next', function (next) {
				return next ? next.name : '';
			});
		}

		return Article;
	})(_MK['default'].Object);

	module.exports = Article;
});

define('app/articles.class',['exports', 'module', 'globals', 'matreshka', 'balalaika', 'app/article.class'], function (exports, module, _globals, _matreshka, _balalaika, _appArticleClass) {
	

	var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

	function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

	function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

	var _g = _interopRequireDefault(_globals);

	var _MK = _interopRequireDefault(_matreshka);

	var _$ = _interopRequireDefault(_balalaika);

	var _Article = _interopRequireDefault(_appArticleClass);

	var Articles = (function (_MK$Array) {
		_inherits(Articles, _MK$Array);

		function Articles() {
			_classCallCheck(this, Articles);

			_get(Object.getPrototypeOf(Articles.prototype), 'constructor', this).call(this);

			this.Model = _Article['default'];
			(0, _$['default'])('article:not([data-typedef])').forEach(function (node) {
				if (node.id) {
					this.push({
						id: node.id
					});
				}
			}, this);

			this.forEach(function (article, index) {
				article.previous = this[index - 1];
				article.next = this[index + 1];
			}, this);

			this.bindNode('header', 'header .inner', _MK['default'].binders.innerHTML()).bindNode('win', window).linkProps('hashValue', [_g['default'].app, 'hashValue']).on('change:hashValue', function () {
				var active;
				for (var i = 0; i < this.length; i++) {
					if (this[i].id === this.hashValue) {
						active = this[i];
						break;
					}
				}
				if (this.active) {
					this.active.isActive = false;
				}

				if (this.active = active) {
					this.active.isActive = true;
				}
			}, true).linkProps('header', 'active', function (active) {
				return active ? active.header || _g['default'].app.mainTitle : _g['default'].app.mainTitle;
			});
		}

		return Articles;
	})(_MK['default'].Array);

	module.exports = Articles;
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
define('app/performance.class',['exports', 'module', 'globals', 'matreshka'], function (exports, module, _globals, _matreshka) {
    

    var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

    function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

    function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

    function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

    var _g = _interopRequireDefault(_globals);

    var _MK = _interopRequireDefault(_matreshka);

    var data = {
        10: {
            ng: [342, 620, 1404, 221, 204],
            kk: [641, 867, 1291, 314, 302],
            rt: [994, 780, 1251, 248, 302],
            mk: [1045, 1152, 2490, 804, 725]
        },
        50: {
            ng: [58.43, 105, 195, 39.63, 17.36],
            kk: [105, 162, 217, 55.89, 48.37],
            rt: [137, 111, 147, 37.45, 33.75],
            mk: [200, 260, 570, 166, 149]
        },
        100: {
            ng: [21.09, 40.87, 61.53, 15.96, 4.40],
            kk: [42.57, 71.28, 86.31, 25.17, 23.65],
            rt: [47.64, 43.13, 50.62, 15.61, 11.49],
            mk: [90.93, 119, 297, 85.02, 69.25]
        },
        500: {
            ng: [1.44, 2.75, 3.93, 0.95, 0.43],
            kk: [4.00, 2.98, 5.45, 1.80, 2.35],
            rt: [3.34, 2.71, 3.44, 0.79, 0.35],
            mk: [18.21, 23.06, 53.75, 17.31, 11.59]
        },
        1000: {
            ng: [0.37, 0.78, 0.95, 0.28, 0.20],
            kk: [0.67, 0.48, 0.89, 0.44, 0.69],
            rt: [0.79, 0.67, 0.99, 0.21, 0.14],
            mk: [8.71, 11.21, 29.07, 8.66, 5.51]
        }

    };

    var Performance = (function (_MK$Object) {
        _inherits(Performance, _MK$Object);

        function Performance() {
            var _this = this;

            _classCallCheck(this, Performance);

            _get(Object.getPrototypeOf(Performance.prototype), 'constructor', this).call(this);
            this.bindNode('sandbox', '.perf-graph-wrapper').bindNode({
                browser: ':sandbox .perf-browser',
                count: ':sandbox .perf-count',
                graph: ':sandbox .perf-graph',
                browserName: [':bound(browser)', {
                    setValue: null,
                    getValue: function getValue() {
                        return this[this.selectedIndex].innerHTML;
                    }
                }]
            }).bindNode({
                count: [':sandbox .benchmark-url', {
                    setValue: function setValue(v) {
                        this.href = ({
                            10: 'http://jsperf.com/angular-vs-knockout-vs-react-vs-matreshka/7',
                            50: 'http://jsperf.com/angular-vs-knockout-vs-react-vs-matreshka/12',
                            100: 'http://jsperf.com/angular-vs-knockout-vs-react-vs-matreshka/8',
                            500: 'http://jsperf.com/angular-vs-knockout-vs-react-vs-matreshka/9',
                            1000: 'http://jsperf.com/angular-vs-knockout-vs-react-vs-matreshka/10'
                        })[v];
                    }
                }]
            }).bindNode({
                mk: ':sandbox .mk',
                kk: ':sandbox .kk',
                ng: ':sandbox .ng',
                rt: ':sandbox .rt'
            }, {
                setValue: function setValue(v) {
                    this.style.height = v + '%';
                }
            }).bindNode({
                slower_kk: ':bound(kk) .slower span',
                slower_ng: ':bound(ng) .slower span',
                slower_rt: ':bound(rt) .slower span'
            }, _MK['default'].binders.innerHTML()).on({
                'change:browser change:count': function changeBrowserChangeCount(evt) {
                    var d = data[_this.count],
                        values = [],
                        valuesMap = {};

                    for (var framework in d) {
                        var v = _this.browser === 'ie' ? (d[framework][3] + d[framework][4]) / 2 : d[framework][_this.nodes.browser.selectedIndex];
                        values.push(v);
                        valuesMap[framework] = v;
                    }

                    var max = Math.max.apply(Math, values);

                    for (var framework in valuesMap) {
                        var v = valuesMap[framework];

                        _this[framework] = v / max * 100;
                        _this['slower_' + framework] = 100 - v / max * 100 | 0;
                        //$( 'div', column )[0].innerHTML = framework === 'mk' ? '' : ( 100 - ( v/max ) * 100 | 0 ) + '% slower';
                    }
                }
            }, true);

            var handler = function handler() {
                var d = data[count[count.selectedIndex].innerHTML.trim()],
                    values = [],
                    valuesMap = {};

                //graph.innerHTML = '';

                for (var framework in d) {
                    var v = browser.value === 'ie' ? (d[framework][3] + d[framework][4]) / 2 : d[framework][browser.selectedIndex];
                    values.push(v);
                    valuesMap[framework] = v;
                }

                var max = Math.max.apply(Math, values);
                for (var framework in valuesMap) {
                    var v = valuesMap[framework],
                        column = $('.column.' + framework)[0];

                    column.style.height = v / max * 100 + '%';
                    $('div', column)[0].innerHTML = framework === 'mk' ? '' : (100 - v / max * 100 | 0) + '% slower';
                }
            };

            //$([browser, count]).on('change', handler);
            //handler();
        }

        return Performance;
    })(_MK['default'].Object);

    module.exports = Performance;
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
if (!('open' in document.createElement('details'))) {
    document.styleSheets[0].insertRule('details > :not(summary) { display: none; }', 0);
    document.styleSheets[0].insertRule('details.open > :not(summary) { display: block; }', 0);
    document.addEventListener( 'click', function( evt ) {
        if( evt.target.tagName == 'SUMMARY' && evt.target.parentNode.tagName == 'DETAILS' ) {
            evt.target.parentNode.classList.toggle( 'open' );
        }
    });
}
;
define("lib/details-polyfill", function(){});

define('app/main.class',['exports', 'module', 'globals', 'matreshka', 'balalaika', 'app/articles.class', 'app/typedefs.class', 'app/typo.class', 'app/notifier.class', 'app/search.class', 'app/performance.class', 'lib/header-hider', 'lib/prettify', 'lib/embed-jsbin', 'lib/details-polyfill'], function (exports, module, _globals, _matreshka, _balalaika, _appArticlesClass, _appTypedefsClass, _appTypoClass, _appNotifierClass, _appSearchClass, _appPerformanceClass, _libHeaderHider, _libPrettify, _libEmbedJsbin, _libDetailsPolyfill) {
	

	var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

	var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

	function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

	function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

	var _g = _interopRequireDefault(_globals);

	var _MK = _interopRequireDefault(_matreshka);

	var _$ = _interopRequireDefault(_balalaika);

	var _Articles = _interopRequireDefault(_appArticlesClass);

	var _Typedefs = _interopRequireDefault(_appTypedefsClass);

	var _Typo = _interopRequireDefault(_appTypoClass);

	var _Notifier = _interopRequireDefault(_appNotifierClass);

	var _Search = _interopRequireDefault(_appSearchClass);

	var _Performance = _interopRequireDefault(_appPerformanceClass);

	var _headerHider = _interopRequireDefault(_libHeaderHider);

	var _prettify = _interopRequireDefault(_libPrettify);

	var _embed = _interopRequireDefault(_libEmbedJsbin);

	var _dp2 = _interopRequireDefault(_libDetailsPolyfill);

	var Main = (function (_MK$Object) {
		_inherits(Main, _MK$Object);

		function Main() {
			_classCallCheck(this, Main);

			_get(Object.getPrototypeOf(Main.prototype), 'constructor', this).call(this);
			_g['default'].app = this;

			this.bindings().events().set({
				ieVersion: document.documentMode,
				isOldIE: document.documentMode <= 9,
				view: this.isOldIE ? 'per-one' : localStorage.view || 'all',
				version: localStorage.version || 'stable',
				unstableVersion: '1.1'
			}).set({

				hideTypoBadge: localStorage.hideTypoBadge,
				isMobile: /mobile|android/i.test(navigator.userAgent),
				articles: new _Articles['default'](),
				typedefs: new _Typedefs['default'](),
				typo: new _Typo['default'](),
				notifier: new _Notifier['default'](),
				search: new _Search['default'](),
				performance: new _Performance['default']()
			});

			if (location.hash) {
				// looks stupid but it forces chrome correctly work with :target selector
				location.href = location.href;
			}

			location.hash = location.hash || '!home';

			if (~location.hash.indexOf('comments')) {
				//  #!/matreshka/comments/matreshka-ru%23matreshka::unread
				var threadID = location.hash.replace(/#!\/matreshka\/comments\/matreshka-\S{2}%23(.*)::unread/, '$1').toLowerCase(),
				    commentArticle,
				    commentsContainer;

				for (var i = 0; i < this.articles.length; i++) {
					if (~this.articles[i].id.toLowerCase().replace(/\./g, '').indexOf(threadID)) {
						commentArticle = this.articles[i];
						commentsContainer = commentArticle.bound('commentsContainer');
						break;
					}
				}

				if (commentArticle && commentsContainer) {
					location.hash = commentArticle.id;
					commentsContainer.classList.add('muut');
					commentArticle.commentsShown = true;
					this.muut();
				}
			}

			document.styleSheets[0].insertRule('body[data-version="stable"]\n\t\t\t[data-since="' + this.unstableVersion + '"] {\n\t\t\t\tdisplay: none;\n\t\t\t}', 0);

			document.styleSheets[0].insertRule('article[data-since="' + this.unstableVersion + '"]:before {\n\t\t\t\tcontent: \'\\26A0   New since ' + this.unstableVersion + '\';\n\t\t\t\tcolor: #ef5350;\n\t\t\t}', 0);

			document.styleSheets[0].insertRule('nav a[data-since="' + this.unstableVersion + '"]:after {\n\t\t\t\tcontent: \'\\26A0\';\n\t\t\t\tcolor: #ef5350;\n\t\t\t}', 0);

			this.loading = false;

			prettyPrint();
		}

		_createClass(Main, [{
			key: 'bindings',
			value: function bindings() {
				return this.bindNode('sandbox', 'body').bindNode('mainTitle', 'title', {
					getValue: function getValue() {
						return this.innerHTML;
					}
				}).bindNode('hashValue', window, {
					on: 'hashchange',
					getValue: function getValue() {
						return location.hash.replace('#', '');
					}
				}).bindNode('win', window).bindNode('navShown', 'body', _MK['default'].binders.className('nav-shown')).bindNode('isMobile', ':sandbox', _MK['default'].binders.className('mobile')).bindNode('loading', '.loader', _MK['default'].binders.className('!hide')).bindNode('navOverlay', '.nav-overlay', _MK['default'].binders.className('!hide')).bindNode('typeBadge', ':sandbox .typo-badge').bindNode('hideTypoBadge', ':bound(typeBadge)', _MK['default'].binders.className('hide')).bindNode('hashValue', ':sandbox .another-language', {
					setValue: function setValue(v) {
						this.href = this.href.split('#')[0] + '#' + v;
					}
				}).bindNode('viewSwitcher', 'nav .view-switcher').bindNode('versionSwitcher', 'nav .version-switcher').bindNode('isOldIE', ':bound(viewSwitcher)', _MK['default'].binders.visibility(false)).bindNode('version', ':sandbox', {
					setValue: function setValue(v) {
						this.dataset.version = v;
					}
				}).bindNode({
					view: ':bound(viewSwitcher)',
					version: ':bound(versionSwitcher)'
				}, {
					on: 'click',
					getValue: function getValue() {
						return this.querySelector('.checked').getAttribute('data-value');
					},
					setValue: function setValue(v) {
						_MK['default'].$b(this.children).forEach(function (item) {
							item.classList.toggle('checked', item.getAttribute('data-value') === v);
						});
					},
					initialize: function initialize() {
						this.addEventListener('mousedown', function (evt) {
							if (evt.target !== this) _MK['default'].$b(this.children).forEach(function (item) {
								item.classList.toggle('checked', evt.target === item);
							});
						});
					}
				}).bindNode('view', 'body', _MK['default'].binders.attribute('data-view'));
			}
		}, {
			key: 'events',
			value: function events() {
				var _this2 = this;

				return this.onDebounce('scroll::win', function () {
					var _this = this;

					if (this.view === 'all') {
						var fromTop = window.pageYOffset,
						    fromLeft = window.pageXOffset,
						    cur = this.articles.filter(function (article) {
							return (article.since !== _this.unstableVersion || _this.version == 'unstable') && article.sandbox.offsetTop < fromTop + 50;
						}),
						    hash;

						cur = cur[cur.length - 1];

						hash = cur ? cur.id : "";

						if (this.hashValue != hash) {
							this.hashValue = hash;
							if (window.history && history.pushState) {
								history.pushState(null, null, '#' + hash);
							} else {
								location.hash = hash;
								scrollTo(fromLeft, fromTop);
							}
						}
					}
				}, 200).on('change:view', function () {
					var fromLeft = window.pageXOffset,
					    fromTop;

					localStorage.view = this.view;

					if (this.view === 'all') {
						fromTop = this.articles.active ? this.articles.active.bound().offsetTop : 0;
					} else {
						fromTop = 0;
					}

					scrollTo(fromLeft, fromTop);
				}).on('change:version', function (evt) {
					return localStorage.version = _this2.version;
				}).on('click::(.show-nav)', function () {
					this.navOverlay = true;

					this.delay(function () {
						this.navShown = true;
					});
				}).on('click::navOverlay', function () {
					this.once('transitionend::navOverlay', function () {
						this.navOverlay = false;
					});

					this.navShown = false;
				}).on('click::([href*="jsbin.com"][href*="edit"])', function (evt) {
					if (evt.target.classList.contains('embedded')) {
						evt.target.nextSibling.classList.toggle('hide');
					} else {
						(0, _embed['default'])(evt.target);
					}

					evt.preventDefault();
				}).on('click::typeBadge(.close)', function () {
					localStorage.hideTypoBadge = this.hideTypoBadge = true;
				});
			}
		}, {
			key: 'muut',
			value: function muut() {
				var script;
				if (typeof jQuery === 'undefined' || !jQuery.fn.muut) {
					document.body.appendChild(_$['default'].create('script', {
						src: '//cdn.muut.com/1/moot.min.js'
					}));
				} else {
					jQuery('.muut').muut();
				}
			}
		}]);

		return Main;
	})(_MK['default'].Object);

	module.exports = Main;
});

require.config({
	baseUrl: "js/",
	paths: {
		matreshka: 'matreshka.min',
		balalaika: 'matreshka.min'
	}
});
define( 'globals', {} );
require(['app/main.class'], function( Main ) { window.app = new Main; });
/*[].slice.call(document.querySelectorAll('[data-type]')).map( function(item) { return item.dataset.type}).filter(function(value, index, self) { return self.indexOf(value) === index; }).forEach(function(type) { var el = document.createElement('span'); el.dataset.type = el.innerHTML = type; document.querySelector('main').appendChild(el)})*/
;
define("app", function(){});

