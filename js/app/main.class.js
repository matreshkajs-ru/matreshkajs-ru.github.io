define([
	'globals',
	'matreshka',
	'balalaika',
	'app/articles.class',
	'app/typedefs.class',
	'app/typo.class',
	'app/notifier.class',
	'app/search.class',
	'lib/header-hider',
	'lib/prettify',
	'lib/embed-jsbin'
], function( g, MK, $, Articles, Typedefs, Typo, Notifier, Search, __1, __2, embed ) {
	"use strict";
	return MK.Class({
		'extends': MK.Object,
		constructor: function() {
			g.app = this;

			this
				.bindNode( 'sandbox', 'body' )
				.bindNode( 'mainTitle', 'title', {
					getValue: function() {
						return this.innerHTML;
					} 
				})
				.bindNode( 'hashValue', window, {
					on: 'hashchange',
					getValue: function() {
						return location.hash.replace( '#', '' );
					}
				})
				.set({
					ieVersion: document.documentMode,
					isOldIE: document.documentMode <= 9
				})
				.set({
					view: this.isOldIE ? 'per-one' : localStorage.view || 'all',
					hideTypoBadge: localStorage.hideTypoBadge,
					isMobile: /mobile|android/i.test( navigator.userAgent ),
					articles: new Articles,
					typedefs: new Typedefs,
					typo: new Typo,
					notifier: new Notifier,
					search: new Search
				})
				.bindNode( 'win', window )
				.bindNode( 'navShown', 'body', MK.binders.className( 'nav-shown' ) )
				.bindNode( 'isMobile', ':sandbox', MK.binders.className( 'mobile' ) )
				.bindNode( 'loading', '.loader', MK.binders.className( '!hide' ) )
				.bindNode( 'navOverlay', '.nav-overlay', MK.binders.className( '!hide' ) )
				.bindNode( 'typeBadge', ':sandbox .typo-badge' )
				.bindNode( 'hideTypoBadge', ':bound(typeBadge)', MK.binders.className( 'hide' ) )
				.bindNode( 'hashValue', ':sandbox .another-language', {
					setValue: function( v ) {
						this.href = this.href.split( '#' )[0] + '#' + v;
					}
				})
				.bindNode( 'viewSwitcher', 'nav .view-switcher' )
				.bindNode( 'isOldIE', ':bound(viewSwitcher)', MK.binders.visibility( false ) )
				.bindNode( 'view', ':bound(viewSwitcher)', {
					on: 'click',
					getValue: function() {
						return this.querySelector( '.checked' ).getAttribute( 'data-value' );
					},
					setValue: function( v ) {
						MK.$b( this.children ).forEach( function( item ) {
							item.classList.toggle( 'checked', item.getAttribute( 'data-value' ) === v );
						});
					},
					initialize: function() {
						this.addEventListener( 'mousedown', function( evt ) {
							if( evt.target !== this ) MK.$b( this.children ).forEach( function( item ) {
								item.classList.toggle( 'checked', evt.target === item );
							});
						});
					}
				})
			
				.bindNode( 'view', 'body', MK.binders.attribute( 'data-view' ) )
				.onDebounce( 'scroll::win', function() {
					if( this.view === 'all' ) {
						var fromTop = window.pageYOffset,
							fromLeft = window.pageXOffset,
							cur = this.articles.filter(function( article ) {
								return article.bound().offsetTop < fromTop + 50;
							}),
							hash;
							
						cur = cur[cur.length-1];
						
						hash = cur ? cur.id : "";
						
						if( this.hashValue != hash ) {
							this.hashValue = hash;
							if( window.history && history.pushState ) {
								history.pushState( null, null, '#' + hash );
							} else {
								location.hash = hash;
								scrollTo( fromLeft, fromTop );
							}
						} 
					}
				}, 200 )
				.on( 'change:view', function() {
					var	fromLeft = window.pageXOffset,
						fromTop;
					
					localStorage.view = this.view;
					
					if( this.view === 'all' ) {
						fromTop = this.articles.active ? this.articles.active.bound().offsetTop : 0;
					} else {
						fromTop = 0;
					}
					
					scrollTo( fromLeft, fromTop );
				})
				.on( 'click::(.show-nav)', function() {
					this.navOverlay = true;
					
					this.delay( function() {
						this.navShown = true;
					});
				})
				.on( 'click::navOverlay', function() {
					this.once( 'transitionend::navOverlay', function() {
						this.navOverlay = false;
					});
					
					this.navShown = false;
				})
				.on( 'click::([href*="jsbin.com"][href*="edit"])', function( evt ) {
					if( evt.target.classList.contains( 'embedded' ) ) {
						evt.target.nextSibling.classList.toggle( 'hide' );
					} else {
						embed( evt.target );
					}
					
					evt.preventDefault();
				})
				.on( 'click::typeBadge(.close)', function() {
					localStorage.hideTypoBadge = this.hideTypoBadge = true;
				})
			;
			
			
			location.hash = location.hash || 'home';
			this.loading = false;
			
			prettyPrint();
		}
	});
	
	
});


