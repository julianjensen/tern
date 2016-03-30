/** ****************************************************************************************************
 * File: fn (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    cx = require( './context' ).cx,
    misc = require( './misc' ),
    WG = misc.WG,
    Obj = require( './obj' ),
    ANull = require( './anull' ),
    FnPrototype = require( './fn-prototype' ).FnPrototype;

class Fn extends ANull
{
    // jshint -W072
    constructor( name, self, args, argNames, retval, generator )
    {
        Obj.call( this, cx.protos.Function, name );
        this.self = self;
        this.args = args;
        this.argNames = argNames;
        this.retval = retval;
        this.generator = generator;
    }

    toString( maxDepth )
    {
        if ( maxDepth === null ) maxDepth = 0;

        let str = this.generator ? "fn*(" : "fn(";

        for ( let i = 0; i < this.args.length; ++i )
        {
            if ( i ) str += ", ";
            let name = this.argNames[ i ];

            if ( name && name !== "?" ) str += name + ": ";

            str += maxDepth > -3 ? misc.toString( this.args[ i ], maxDepth - 1, this ) : "?";
        }

        str += ")";

        if ( !this.retval.isEmpty() )
            str += " -> " + ( maxDepth > -3 ? misc.toString( this.retval, maxDepth - 1, this ) : "?" );

        return str;
    }

    getProp( prop )
    {
        if ( prop === "prototype" )
        {
            let known = this.hasProp( prop, false );

            if ( !known )
            {
                known = this.defProp( prop );

                let proto = new Obj( true, this.name && this.name + ".prototype" );

                proto.origin = this.origin;
                known.addType( proto, WG.MADEUP_PROTO );
            }

            return known;
        }

        return Obj.prototype.getProp.call( this, prop );
    }

    defProp( prop, originNode )
    {
        if ( prop === "prototype" )
        {
            let found = this.hasProp( prop, false );

            if ( found ) return found;

            found = Obj.prototype.defProp.call( this, prop, originNode );
            found.origin = this.origin;
            found.propagate( new FnPrototype( this ) );

            return found;
        }

        return Obj.prototype.defProp.call( this, prop, originNode );
    }

    getFunctionType()
    {
        return this;
    }
}

module.exports = Fn;
