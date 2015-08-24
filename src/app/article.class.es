import g from 'globals';
import MK from 'matreshka';
import $ from 'balalaika';

export default class Article extends MK.Object {
	constructor( data ) {
		super();
		this
			.set( data )
			.set({
				commentsShown: false
			})
			.linkProps( 'ieVersion', [ g.app, 'ieVersion' ] )
			.bindNode( 'sandbox', 'article[id="'+this.id+'"]' )
			.bindNode( 'since', ':sandbox', MK.binders.attribute('data-since') )
			.bindOptionalNode( 'ieVersion', ':sandbox .comments', MK.binders.className( 'hide' ) )
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
					return this.getAttribute( 'data-name' ) || this.textContent;
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
					commentsContainer = this.bound( 'commentsContainer' );

				if( this.commentsShown = !this.commentsShown ) {
					commentsContainer.classList.add( 'muut' );
					g.app.muut();
				}


			})
			.linkProps( '_previous', [
				this, 'previous',
				g.app, 'unstableVersion',
				g.app, 'version',
				g.app, 'articles'
			], ( previous, unstableVersion, version, articles ) => {
				if( !previous || version == 'unstable' || !articles ) {
					return previous;
				} else {
					do {
						if( previous.since != unstableVersion ) {
							return previous;
						}
					} while( previous = previous.previous )
				}
			})
			.linkProps( '_next', [
				this, 'next',
				g.app, 'unstableVersion',
				g.app, 'version',
				g.app, 'articles'
			], ( next, unstableVersion, version, articles ) => {
				if( !next || version == 'unstable' || !articles ) {
					return next;
				} else {
					do {
						if( next.since != unstableVersion ) {
							return next;
						}
					} while( next = next.next )
				}
			})
			.linkProps( 'previousId', '_previous', function( previous ) {
				return previous ? previous.id : '';
			})
			.linkProps( 'nextId', '_next', function( next ) {
				return next ? next.id : '';
			})
			.linkProps( 'previousHeader', '_previous', function( previous ) {
				return previous ? previous.name : '';
			})
			.linkProps( 'nextHeader', '_next', function( next ) {
				return next ? next.name : '';
			})
		;
	}

}
