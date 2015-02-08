define([
	'globals',
	'matreshka',
	'balalaika'
], function( g, MK, $ ) {
	"use strict";
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