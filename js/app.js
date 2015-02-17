require.config({
	baseUrl: "js/",
	paths: {
		matreshka: 'matreshka.min',
		balalaika: 'matreshka.min'
	}
});
define( 'globals', {} )
require(['app/main.class'], function( Main ) { window.app = new Main; });
/*[].slice.call(document.querySelectorAll('[data-type]')).map( function(item) { return item.dataset.type}).filter(function(value, index, self) { return self.indexOf(value) === index; }).forEach(function(type) { var el = document.createElement('span'); el.dataset.type = el.innerHTML = type; document.querySelector('main').appendChild(el)})*/