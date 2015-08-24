define(['exports', 'module', 'globals', 'matreshka', 'balalaika', 'app/article.class'], function (exports, module, _globals, _matreshka, _balalaika, _appArticleClass) {
	'use strict';

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
