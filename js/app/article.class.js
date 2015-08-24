define(['exports', 'module', 'globals', 'matreshka', 'balalaika'], function (exports, module, _globals, _matreshka, _balalaika) {
	'use strict';

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
