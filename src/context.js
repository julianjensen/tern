/** ****************************************************************************************************
 * File: context (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    ANull = require( './anull' ),
    Obj = require( './obj' ),
    Scope = require( './scope' ),
    Fn = require( './fn' ),
    Prim = require( './prim' );

class Context
{
    constructor( defs, parent )
    {
        this.parent = parent;
        this.props = Object.create( null );
        this.protos = Object.create( null );
        this.origins = [];
        this.curOrigin = "ecma5";
        this.paths = Object.create( null );
        this.definitions = Object.create( null );
        this.purgeGen = 0;
        this.workList = null;
        this.disabledComputing = null;
        this.curSuperCtor = this.curSuper = null;
        this.symbols = Object.create( null );

        Context.using( this, function() {
            Context.cx.protos.Object = new Obj( null, "Object.prototype" );
            Context.cx.topScope = new Scope();
            Context.cx.topScope.name = "<top>";
            Context.cx.protos.Array = new Obj( true, "Array.prototype" );
            Context.cx.protos.Function = new Fn( "Function.prototype", ANull, [], [], ANull );
            Context.cx.protos.Function.proto = Context.cx.protos.Object;
            Context.cx.protos.RegExp = new Obj( true, "RegExp.prototype" );
            Context.cx.protos.String = new Obj( true, "String.prototype" );
            Context.cx.protos.Number = new Obj( true, "Number.prototype" );
            Context.cx.protos.Boolean = new Obj( true, "Boolean.prototype" );
            Context.cx.protos.Symbol = new Obj( true, "Symbol.prototype" );
            Context.cx.str = new Prim( Context.cx.protos.String, "string" );
            Context.cx.bool = new Prim( Context.cx.protos.Boolean, "bool" );
            Context.cx.num = new Prim( Context.cx.protos.Number, "number" );
            Context.cx.curOrigin = null;

            if ( defs )
                for ( var i = 0; i < defs.length; ++i )
                    def.load( defs[ i ] );
        } );
    }

    startAnalysis()
    {
        this.disabledComputing = this.workList = this.curSuperCtor = this.curSuper = null;
    }
}

Context.cx = null;
Context.using = function( context, f ) {
    let old = Context.cx;

    Context.cx = context;
    try
    {
        return f();
    }
    finally
    {
        Context.cx = old;
    }
};

module.exports = Context;

