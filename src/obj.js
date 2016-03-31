/** ****************************************************************************************************
 * File: obj (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    AVal = require( './aval' ),
    Type = require( './type' ),
    Fn = require( './fn' ),
    Scope = require( './scope' ),
    misc = require( './misc' ),
    is = require( './is' ),
    cx = require( './context' ).cx;

class Obj extends Type
{
    constructor( proto, name )
    {
        if ( !this.props ) this.props = Object.create( null );
        
        this.proto = proto === true ? cx.protos.Object : proto;

        if ( this.proto && !( this.proto instanceof Obj ) )
            throw new Error( "bad " + Object.keys( this.proto ).join() );

        if ( proto && !name && proto.name && !( this instanceof Fn ) )
        {
            let match = /^(.*)\.prototype$/.exec( this.proto.name );

            if ( match ) name = match[ 1 ];
        }

        this.name = name;
        this.maybeProps = null;
        this.origin = cx.curOrigin;
    }

    toString( maxDepth )
    {
        if ( maxDepth === null ) maxDepth = 0;
        if ( maxDepth <= 0 && this.name ) return this.name;

        let props = [],
            etc = false;

        for ( let prop of Object.keys( this.props ) )
            if ( prop !== "<i>" )
            {
                if ( props.length > 5 )
                {
                    etc = true;
                    break;
                }

                if ( maxDepth )
                    props.push( prop + ": " + misc.toString( this.props[ prop ], maxDepth - 1, this ) );
                else
                    props.push( prop );
            }

        props.sort();

        if ( etc ) props.push( "..." );

        return "{" + props.join( ", " ) + "}";
    }

    hasProp( prop, searchProto )
    {
        if ( is.Integer( prop ) ) prop = this.normalizeIntegerProp( prop );

        let found = this.props[ prop ];

        if ( searchProto !== false )
        {
            for ( let p = this.proto; p && !found; p = p.proto )
                found = p.props[ prop ];
        }

        return found;
    }

    defProp( prop, originNode )
    {
        let found = this.hasProp( prop, false );

        if ( found )
        {
            if ( originNode && !found.originNode ) found.originNode = originNode;
            return found;
        }

        if ( misc.ignoredProp( prop ) ) return misc.ANull;

        if ( is.Integer( prop ) ) prop = this.normalizeIntegerProp( prop );

        let av = this.maybeProps && this.maybeProps[ prop ];

        if ( av )
        {
            delete this.maybeProps[ prop ];
            this.maybeUnregProtoPropHandler();
        }
        else
        {
            av = new AVal();
            av.propertyOf = this;
            av.propertyName = prop;
        }

        this.props[ prop ] = av;
        av.originNode = originNode;
        av.origin = cx.curOrigin;
        this.broadcastProp( prop, av, true );
        return av;
    }

    getProp( prop )
    {
        let found = this.hasProp( prop, true ) || ( this.maybeProps && this.maybeProps[ prop ] );

        if ( found ) return found;
        if ( misc.ignoredProp( prop ) ) return misc.ANull;
        if ( is.Integer( prop ) ) prop = this.normalizeIntegerProp( prop );

        let av = this.ensureMaybeProps()[ prop ] = new AVal();

        av.propertyOf = this;
        av.propertyName = prop;

        return av;
    }

    normalizeIntegerProp()
    {
        return "<i>";
    }

    broadcastProp( prop, val, local )
    {
        if ( local )
        {
            this.signal( "addProp", prop, val );
            // If this is a scope, it shouldn't be registered
            if ( !( this instanceof Scope ) ) registerProp( prop, this );
        }

        if ( this.onNewProp )
        {
            for ( let h of this.onNewProp )
                // jshint -W030
                h.onProtoProp ? h.onProtoProp( prop, val, local ) : h( prop, val, local );
        }
    }

    onProtoProp( prop, val )
    {
        let maybe = this.maybeProps && this.maybeProps[ prop ];

        if ( maybe )
        {
            delete this.maybeProps[ prop ];
            this.maybeUnregProtoPropHandler();
            this.proto.getProp( prop ).propagate( maybe );
        }

        this.broadcastProp( prop, val, false );
    }

    replaceProto( proto )
    {
        if ( this.proto && this.maybeProps )
            this.proto.unregPropHandler( this );

        this.proto = proto;

        if ( this.maybeProps )
            this.proto.forAllProps( this );
    }

    ensureMaybeProps()
    {
        if ( !this.maybeProps )
        {
            if ( this.proto ) this.proto.forAllProps( this );

            this.maybeProps = Object.create( null );
        }

        return this.maybeProps;
    }

    removeProp( prop )
    {
        let av = this.props[ prop ];

        delete this.props[ prop ];
        this.ensureMaybeProps()[ prop ] = av;
        av.types.length = 0;
    }

    forAllProps( c )
    {
        if ( !this.onNewProp )
        {
            this.onNewProp = [];
            if ( this.proto ) this.proto.forAllProps( this );
        }

        this.onNewProp.push( c );

        for ( let _this = this; _this; _this = _this.proto )
        {
            for ( let prop of Object.keys( _this.props ) )
            {
                if ( c.onProtoProp )
                    c.onProtoProp( prop, _this.props[ prop ], _this === this );
                else
                    c( prop, _this.props[ prop ], _this === this );
            }
        }
    }

    maybeUnregProtoPropHandler()
    {
        if ( this.maybeProps )
        {
            for ( let _n in this.maybeProps ) return;   // jshint -W098
            this.maybeProps = null;
        }

        if ( !this.proto || this.onNewProp && this.onNewProp.length ) return;

        this.proto.unregPropHandler( this );
    }

    unregPropHandler( handler )
    {
        for ( let i = 0; i < this.onNewProp.length; ++i )
            if ( this.onNewProp[ i ] === handler )
            {
                this.onNewProp.splice( i, 1 );
                break;
            }

        this.maybeUnregProtoPropHandler();
    }

    gatherProperties( f, depth )
    {
        for ( let prop of Object.keys( this.props ) )
            if ( prop !== "<i>" && prop.charAt( 0 ) !== ":" )
                f( prop, this, depth );

        if ( this.proto ) this.proto.gatherProperties( f, depth + 1 );
    }

    getObjType()
    {
        return this;
    }
}

module.exports = Obj;
