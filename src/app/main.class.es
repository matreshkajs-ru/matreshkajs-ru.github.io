import g from 'globals';
import MK from 'matreshka';
import $ from 'balalaika';
import Articles from 'app/articles.class';
import Typedefs from 'app/typedefs.class';
import Typo from 'app/typo.class';
import Notifier from 'app/notifier.class';
import Search from 'app/search.class';
import Performance from 'app/performance.class';
import headerHider from 'lib/header-hider';
import prettify from 'lib/prettify';
import embed from 'lib/embed-jsbin';
import _dp from 'lib/details-polyfill';

export default class Main extends MK.Object {
	constructor() {
		super();
		g.app = this;

		this
			.bindings()
			.events()

			.set({
				ieVersion: document.documentMode,
				isOldIE: document.documentMode <= 9,
				view: this.isOldIE ? 'per-one' : localStorage.view || 'all',
				version: localStorage.version || 'stable',
				unstableVersion: '1.1'
			})
			.set({

				hideTypoBadge: localStorage.hideTypoBadge,
				isMobile: /mobile|android/i.test( navigator.userAgent ),
				articles: new Articles,
				typedefs: new Typedefs,
				typo: new Typo,
				notifier: new Notifier,
				search: new Search,
				performance: new Performance,
			})
		;

		if( location.hash ) {
			// looks stupid but it forces chrome correctly work with :target selector
			location.href = location.href;
		}

		location.hash = location.hash || '!home';

		if( ~location.hash.indexOf( 'comments' ) ) { //  #!/matreshka/comments/matreshka-ru%23matreshka::unread
			var threadID = location.hash.replace( /#!\/matreshka\/comments\/matreshka-\S{2}%23(.*)::unread/, '$1' ).toLowerCase(),
				commentArticle,
				commentsContainer;

			for( var i = 0; i < this.articles.length; i++ ) {
				if( ~this.articles[i].id.toLowerCase().replace( /\./g, '' ).indexOf( threadID ) ) {
					commentArticle = this.articles[i];
					commentsContainer = commentArticle.bound( 'commentsContainer' );
					break;
				}
			}

			if( commentArticle && commentsContainer ) {
				location.hash = commentArticle.id;
				commentsContainer.classList.add( 'muut' );
				commentArticle.commentsShown = true;
				this.muut();
			}
		}

		let styleSheet = document.styleSheets[0];
		
		styleSheet.insertRule(`body[data-version="stable"]
			[data-since="${this.unstableVersion}"] {
				display: none;
			}`, styleSheet.cssRules.length);

		styleSheet.insertRule(`article[data-since="${this.unstableVersion}"]:before {
				content: '\\26A0   New since ${this.unstableVersion}';
				color: #ef5350;
			}`, styleSheet.cssRules.length);

		styleSheet.insertRule(`nav a[data-since="${this.unstableVersion}"]:after {
				content: '\\26A0';
				color: #ef5350;
			}`, styleSheet.cssRules.length);

		this.loading = false;

		prettyPrint();
	}

	bindings() {
		return this
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
			.bindNode( 'versionSwitcher', 'nav .version-switcher' )
			.bindNode( 'isOldIE', ':bound(viewSwitcher)', MK.binders.visibility( false ) )
			.bindNode( 'version', ':sandbox', {
				setValue(v) {
					this.dataset.version = v;
				}
			})
			.bindNode({
				view: ':bound(viewSwitcher)',
				version: ':bound(versionSwitcher)'
			}, {
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
		;
	}

	events() {
		return this
			.onDebounce( 'scroll::win', function() {
				if( this.view === 'all' ) {
					var fromTop = window.pageYOffset,
						fromLeft = window.pageXOffset,
						cur = this.articles.filter( article => {
							return ( article.since !== this.unstableVersion || this.version == 'unstable' )
								&& article.sandbox.offsetTop < fromTop + 50;
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
			.on( 'change:version', evt => localStorage.version = this.version )
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
	}

	muut() {
		var script;
		if( typeof jQuery === 'undefined' || !jQuery.fn.muut ) {
			document.body.appendChild( $.create( 'script', {
				src: '//cdn.muut.com/1/moot.min.js'
			}) );
		} else {
			jQuery( '.muut' ).muut();
		}
	}
}
