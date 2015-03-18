define([
	'globals',
	'matreshka',
	'balalaika'
], function( g, MK, $ ) {
	"use strict";
	return MK.Class({
		'extends': MK.Object,
		constructor: function( data ) {
			this
				.set( data )
				.set({
					commentsShown: false
				})
				.bindNode( 'sandbox', 'article[id="'+this.id+'"]' )
				.bindNode( 'menuItem', 'nav a[href="#'+this.id+'"]' )
				.bindNode( 'isActive', ':bound(menuItem)', MK.binders.className( 'active' ) )
				.bindNode( 'expanded', ':bound(menuItem)', MK.binders.className( 'expanded' ) )
				.bindOptionalNode( 'commentsContainer', ':sandbox .comments-container' )
				.bindOptionalNode( 'commentsShown', ':bound(commentsContainer)', MK.binders.visibility() )
				.bindOptionalNode( 'submenu', 'nav ul[data-submenu="'+this.id+'"]' )
				.bindOptionalNode( 'comment', ':sandbox .comments' )
				.bindNode( 'pagination', this.bound().appendChild( $( g.app.select( '#pagination-template' ).innerHTML )[0] ) )
				.bindNode( 'name', ':bound(menuItem)', {
					getValue: function() {
						return this.dataset.name || this.textContent;
					}
				})
				.bindNode({
					nextId: ':bound(pagination) .next-page',
					previousId: ':bound(pagination) .previous-page'
				}, {
					setValue: function( v ) {
						this.href = '#' + v;
					}
				})
				.bindNode({
					nextHeader: ':bound(pagination) .next-page',
					previousHeader: ':bound(pagination) .previous-page'
				}, MK.binders.innerHTML() )
				.bindOptionalNode( 'header', ':sandbox h2', {
					getValue: function() {
						return this.innerHTML.replace( /<wbr>/g, '' );
					}
				})
				.on( 'click::menuItem(.expand)', function( evt ) {
					this.expanded = !this.expanded;
					evt.preventDefault();
				})
				.on( 'change:expanded', function() {
					var submenu = this.bound( 'submenu' );
					if( submenu ) {
						if( !this.expanded ) {
							submenu.style.marginTop = -44 * this.selectAll( ':bound(submenu) a' ).length + 'px';
						} else {
							submenu.style.marginTop = 0;
							submenu.style.display = 'block';
						}
					}
				}, true )
				.on( 'change:isActive', function() {
					var node = this.bound( 'menuItem' );
					
					while( node = node.parentNode ) {
						$( '.submenu-wrapper' ).filter( function( wrapper ) {
							return wrapper.contains( node );
						}).map( function( wrapper ) {
							return wrapper.previousElementSibling;
						}).map( function( menuItem ) {
							return menuItem.querySelector( '.hidden-active-child' );
						}).forEach( function( menuItem ) {
							menuItem.innerHTML = this.isActive ? this.name : ''
						}, this );
						break;
					}
				})
				.on( 'click::comment', function() {
					var url = document.location.origin + document.location.pathname + '#' + this.id,
						//identifier = '__' + this.id,
						commentsContainer = this.bound( 'commentsContainer' );
						
					this.commentsShown = !this.commentsShown;
						
					/*if( this.bound().contains( g.app.bound( 'commentsBlock' ) ) ) {
						if( g.app.commentsShown = !g.app.commentsShown ) {
							setTimeout( function() {
								window.scrollTo( window.pageXOffset, threadDiv.offsetTop - 60 );
							}, 0 );
						}
						return;
					} else {
						g.app.commentsShown = true;
						this.bound().appendChild( g.app.bound( 'commentsBlock' ) );
					}*/
					
					
					//<div class="fb-comments" data-href="http://volodia.com" data-numposts="5" data-colorscheme="light"></div>
					
					location.hash = this.id;
					
					if( commentsContainer.getAttribute( 'fb-xfbml-state' ) !== 'rendered' ) {
						commentsContainer.dataset.href = url;
						commentsContainer.dataset.numposts = 5;
						commentsContainer.dataset.colorscheme = 'light';
						commentsContainer.classList.add( 'fb-comments' );
						
						if( !window.FB ) {
							(function(d, s, id) {
							var js, fjs = d.getElementsByTagName(s)[0];
							if (d.getElementById(id)) return;
							js = d.createElement(s); js.id = id;
							js.src = "//connect.facebook.net/ru_RU/sdk.js#xfbml=1&appId=901572946532005&version=v2.0";
							fjs.parentNode.insertBefore(js, fjs);
							}(document, 'script', 'facebook-jssdk'));
						} else {
							FB.XFBML.parse( this.bound() );
						}
					}
					/*MK.extend( window, {
						disqus_developer: 1, 
						disqus_identifier: identifier,
						disqus_title: this.bound( 'comment' ).dataset.title,
						disqus_url: url
					});
					
					if( !window.DISQUS ) {
						$( 'head' )[0].appendChild( $.create( 'script', {
							async: true,
							src: '//' + window.disqus_shortname + '.disqus.com/embed.js'					
						}));
					} else {
						DISQUS.reset({
							reload: true,
							config: function () {  
								this.page.identifier = identifier;
								this.page.url = url;
								this.page.title = title;
							}
						});
					}*/
					
					/*<div id="fb-root"></div>
<script></script>*/
					if( this.commentsShown ) {
						setTimeout( function() {
							window.scrollTo( window.pageXOffset, commentsContainer.offsetTop - 60 );
						});
					}
				})
				.linkProps( 'previousId', 'previous', function( previous ) {
					return previous ? previous.id : '';
				})
				.linkProps( 'nextId', 'next', function( next ) {
					return next ? next.id : '';
				})
				.linkProps( 'previousHeader', 'previous', function( previous ) {
					return previous ? previous.name : '';
				})
				.linkProps( 'nextHeader', 'next', function( next ) {
					return next ? next.name : '';
				})
			;
		}
	});
});
