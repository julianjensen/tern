/** ****************************************************************************************************
 * File: is (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    ANull = require( './anull' ),
    Arr = require( './arr' ),
    Obj = require( './obj' ),
    Fn = require( './fn' ),
    cx = require( './context' ).cx,
    misc = require( './misc' ),
    WG = misc.WG,
    maybeIterator = require( './iterator' ).maybeIterator;

class IsCallee extends ANull
{
    constructor( self, args, argNodes, retval )
    {
        this.self = self;
        this.args = args;
        this.argNodes = argNodes;
        this.retval = retval;
        this.disabled = cx.disabledComputing;
    }

    addType( fn, weight )
    {
        if ( !( fn instanceof Fn ) ) return;

        for ( let i = 0; i < this.args.length; ++i )
        {
            if ( i < fn.args.length ) this.args[ i ].propagate( fn.args[ i ], weight );
            if ( fn.arguments ) this.args[ i ].propagate( fn.arguments, weight );
        }

        this.self.propagate( fn.self, this.self === cx.topScope ? WG.GLOBAL_THIS : weight );

        let compute = fn.computeRet,
            result = fn.retval;

        if ( compute )
        {
            for ( let d = this.disabled; d; d = d.prev )
                if ( d.fn === fn || fn.originNode && d.fn.originNode === fn.originNode ) compute = null;
        }

        if ( compute )
        {
              let old = cx.disabledComputing;

              cx.disabledComputing = this.disabled;
              result = compute( this.self, this.args, this.argNodes );
              cx.disabledComputing = old;
        }

        maybeIterator( fn, result ).propagate( this.retval, weight );
    }

    typeHint()
    {
        let names = [];

        for ( let i = 0; i < this.args.length; ++i )
            names.push( "?" );

        return new Fn( null, this.self, this.args, names, ANull );
    }

    propagatesTo()
    {
        return { target: this.retval, pathExt: ".!ret" };
    }
}

class IsProto extends ANull
{
    constructor( ctor, target )
    {
        this.ctor = ctor;
        this.target = target;
    }

    addType( o )
    {
        if ( !( o instanceof Obj ) ) return;
        if ( ( this.count = ( this.count || 0 ) + 1 ) > 8 ) return;

        if ( o === cx.protos.Array )
            this.target.addType( new Arr() );
        else
            this.target.addType( misc.getInstance( o, this.ctor ) );
    }
}

class IsAdded extends ANull
{
    constructor( other, target )
    {
        this.other = other;
        this.target = target;
    }

    addType( type, weight )
    {
        if ( type === cx.str )
            this.target.addType( cx.str, weight );
        else if ( type === cx.num && this.other.hasType( cx.num ) )
            this.target.addType( cx.num, weight );
    }

    typeHint()
    {
        return this.other;
    }
}

class IsCtor extends ANull
{
    constructor( target, noReuse )
    {
        this.target = target;
        this.noReuse = noReuse;
    }

    addType( f, weight )
    {
        if ( !( f instanceof Fn ) ) return;
        if ( cx.parent && !cx.parent.options.reuseInstances ) this.noReuse = true;
        f.getProp( "prototype" ).propagate( new IsProto( this.noReuse ? false : f, this.target ), weight );
    }
}

class IsCreated extends ANull
{
    constructor( created, target, spec )
    {
        this.created = created;
        this.target = target;
        this.spec = spec;
    }

    addType( tp )
    {
        if ( tp instanceof Obj && this.created++ < 5 )
        {
            let derived = new Obj( tp ),
                spec = this.spec;

            if ( spec instanceof AVal ) spec = spec.getObjType( false );
            if ( spec instanceof Obj )
            {
                for ( let prop of Object.keys( spec.props ) )
                {
                    let cur = spec.props[ prop ].types[ 0 ],
                        p = derived.defProp( prop );

                    if ( cur && cur instanceof Obj && cur.props.value )
                    {
                        let vtp = cur.props.value.getType( false );

                        if ( vtp ) p.addType( vtp );
                    }
                }
            }

            this.target.addType( derived );
        }
    }
}

class IsBound extends ANull
{
    constructor( self, args, target )
    {
        this.self = self;
        this.args = args;
        this.target = target;
    }

    addType( tp )
    {
        if ( !( tp instanceof Fn ) ) return;

        this.target.addType( new Fn( tp.name, ANull, tp.args.slice( this.args.length ),
            tp.argNames.slice( this.args.length ), tp.retval, tp.generator ) );

        this.self.propagate( tp.self );

        for ( let i = 0; i < Math.min( tp.args.length, this.args.length ); ++i )
            this.args[ i ].propagate( tp.args[ i ] );
    }
}

class HasMethodCall extends ANull
{

    constructor( propName, args, argNodes, retval )
    {
        this.propName = propName;
        this.args = args;
        this.argNodes = argNodes;
        this.retval = retval;
        this.disabled = cx.disabledComputing;
    }

    addType( obj, weight )
    {
        let callee = new IsCallee( obj, this.args, this.argNodes, this.retval );

        callee.disabled = this.disabled;
        obj.getProp( this.propName ).propagate( callee, weight );
    }

    propHint()
    {
        return this.propName;
    }
}



module.exports.Callee = IsCallee;
module.exports.Proto = IsProto;
module.exports.Added = IsAdded;
module.exports.Ctor = IsCtor;
module.exports.Created = IsCreated;
module.exports.Bound = IsBound;
module.exports.MethodCall = HasMethodCall;

module.exports.Integer = function( str ) {
    let c0 = str.charCodeAt( 0 );

    if ( c0 >= 48 && c0 <= 57 )
        return !/\D/.test( str );

    return false;
};
