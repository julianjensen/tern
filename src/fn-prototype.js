/** ****************************************************************************************************
 * File: fn-prototype (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    cx = require( './context' ).cx,
    Obj = require( './obj' ),
    Fn = require( './fn' ),
    ANull = require( './anull' ),
    misc = require( './misc' ),
    WG = misc.WG;

class SpeculativeThis extends ANull
{
    constructor( obj, ctor )
    {
        this.obj = obj;
        this.ctor = ctor;
    }

    addType( tp )
    {
        if ( tp instanceof Fn && tp.self )
            tp.self.addType( misc.getInstance( this.obj, this.ctor ), WG.SPECULATIVE_PROTO_THIS );
    }
}

class FnPrototype extends ANull
{
    constructor( fn )
    {
        this.fn = fn;
    }

    addType( o )
    {
        if ( o instanceof Obj && !o.hasCtor )
        {
            o.hasCtor = this.fn;
            let adder = new SpeculativeThis( o, this.fn );

            adder.addType( this.fn );
            o.forAllProps( function( _prop, val, local ) {
                if ( local ) val.propagate( adder );
            } );
        }
    }
}

class IfObj extends ANull
{
    constructor( target )
    {
        this.target = target;
    }

    addType( t, weight )
    {
        if ( t instanceof Obj ) this.target.addType( t, weight );
    }

    propagatesTo()
    {
        return this.target;
    }
}

class HasProto extends ANull
{
    constructor( obj )
    {
        this.obj = obj;
    }

    addType( tp )
    {
        if ( tp instanceof Obj && this.obj.proto === cx.protos.Object )
            this.obj.replaceProto( tp );
    }
}


module.exports.FnPrototype = FnPrototype;
module.exports.HasProto = HasProto;
module.exports.IfObj = IfObj;
module.exports.SpeculativeThis = SpeculativeThis;
