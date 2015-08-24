define(['exports', 'module', 'globals', 'matreshka', 'balalaika', 'app/articles.class', 'app/typedefs.class', 'app/typo.class', 'app/notifier.class', 'app/search.class', 'app/performance.class', 'lib/header-hider', 'lib/prettify', 'lib/embed-jsbin', 'lib/details-polyfill'], function (exports, module, _globals, _matreshka, _balalaika, _appArticlesClass, _appTypedefsClass, _appTypoClass, _appNotifierClass, _appSearchClass, _appPerformanceClass, _libHeaderHider, _libPrettify, _libEmbedJsbin, _libDetailsPolyfill) {
	'use strict';

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
