define(['exports', 'module', 'globals', 'matreshka'], function (exports, module, _globals, _matreshka) {
    'use strict';

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
