define([
	'globals',
	'matreshka',
	'balalaika',
	'app/articles.class',
	'app/typedefs.class',
	'app/typo.class',
	'app/search.class',
	'lib/header-hider',
	'lib/prettify',
	'lib/embed-jsbin'
], function( g, MK, $, Articles, Typedefs, Typo, Search, __1, __2, embed ) {
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
				.set({
					view: localStorage.view || 'all',
					hideTypoBadge: localStorage.hideTypoBadge,
					isMobile: /mobile|android/i.test( navigator.userAgent ),
					articles: new Articles,
					typedefs: new Typedefs,
					typo: new Typo,
					search: new Search
				})
				.bindNode( 'win', window )
				.bindNode( 'navShown', 'body', MK.binders.className( 'nav-shown' ) )
				.bindNode( 'isMobile', ':sandbox', MK.binders.className( 'mobile' ) )
				.bindNode( 'loading', '.loader', MK.binders.className( '!hide' ) )
				.bindNode( 'navOverlay', '.nav-overlay', MK.binders.className( '!hide' ) )
				.bindNode( 'commentsBlock', '<div id="disqus_thread"></div>' )
				.bindNode( 'commentsShown', ':bound(commentsBlock)', MK.binders.className( '!hide' ) )
				.bindNode( 'typeBadge', ':sandbox .typo-badge' )
				.bindNode( 'hideTypoBadge', ':bound(typeBadge)', MK.binders.className( 'hide' ) )
				.bindNode( 'hashValue', window, {
					on: 'hashchange',
					getValue: function() {
						return location.hash.replace( '#', '' );
					}
				})
				.bindNode( 'view', 'nav .view-switcher', {
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
				.on( 'scroll::win', function() {
					if( this.view === 'all' ) {
						var fromTop = window.pageYOffset,
							fromLeft = window.pageXOffset,
							cur = this.articles.filter(function( article ){
								return article.bound().offsetTop < fromTop + 50;
							});
						cur = cur[cur.length-1];
						location.hash = cur ? cur.id : "";
						scrollTo( fromLeft, fromTop );
					}
				})
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


