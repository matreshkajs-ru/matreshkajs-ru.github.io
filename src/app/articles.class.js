define([
	'globals',
	'matreshka',
	'balalaika',
	'app/article.class'
], function( g, MK, $, Article ) {
	"use strict";
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
