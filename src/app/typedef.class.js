define([
	'matreshka',
	'balalaika'
], function( MK, $ ) {
	"use strict";
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