require.config({
	baseUrl: "js/",
	paths: {
		matreshka: 'matreshka.min',
		balalaika: 'matreshka.min'
	}
});
define( 'globals', {} )
require(['app/main.class'], function( Main ) { window.app = new Main; });