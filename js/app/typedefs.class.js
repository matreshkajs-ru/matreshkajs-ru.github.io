define([
	'globals',
	'matreshka',
	'balalaika',
	'app/typedef.class'
], function( g, MK, $, Typedef ) {
	"use strict";
	return MK.Class({
		'extends': MK.Array,
		Model: Typedef,
		constructor: function() {
			
			$( 'article[data-typedef]' ).forEach( function( node ) {
				this.push({
					typedef: node.dataset.typedef
				});
			}, this );
			
			this
				.bindNode( 'sandbox', 'body' )
				.bindNode( 'overlay', '.typedef-overlay', MK.binders.className( '!hide' ) )
				.bindNode( 'overlayOpaque', ':bound(overlay)', {
					setValue: function( v ) {
						this.style.opacity = v ? .5 : 0;
					}
				})
				.on( 'click::([data-type])', function( evt ) {
					this.forEach( function( typedef ) {
						typedef.isShown = typedef.typedef === evt.target.dataset.type;
					});
				})
				.on( '@change:isShown', function( evt ) {
					if( evt.value ) {
						if( this.shown ) {
							this.shown.isShown = false;
						}
						
						this.overlay = true;
						
						this.overlayOpaque = false;
						
						this.delay( function() {
							this.overlayOpaque = true;
						});
						
						this.shown = evt.self;
					}
				})
				.on( 'click::overlay @click::(.close-modal)', this.close )
			;
			
			g.app.on( 'keydown::sandbox', function( evt ) {
				if( evt.which === 27 ) {
					this.close();
				}
			}, this );
		},
		close: function() {
			this.overlayOpaque = false;
			
			this.once( 'transitionend::overlay', function() {
				this.overlay = false;
			});
			
			if( this.shown ) {
				this.shown.isShown = false;
			}
			
			this.shown = null;
		}
	});
});