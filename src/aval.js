/** ****************************************************************************************************
 * File: aval (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    ANull = require( './anull' ),
    Type = require( './type' ),
    Muffle = require( './muffle' ),
    GetProp = require( './props/get-prop' ),
    ForAllProps = require( './props/for-all-props' ),
    Fn = require( './fn' ),
    Sym = require( './sym' ),
    Obj = require( './obj' ),
    using = require( './with' ),
    misc = require( './misc' ),
    cx = require( './context' ).cx,
    WG = misc.WG;

class AVal extends ANull
{
    constructor()
    {
        super();
        this.types = [];
        this.forward = null;
        this.maxWeight = 0;
    }

    addType( type, weight = WG.DEFAULT )
    {
        let forward;

        if ( this.maxWeight < weight )
        {
            this.maxWeight = weight;

            if ( this.types.length === 1 && this.types[ 0 ] === type ) return;

            this.types.length = 0;
        }
        else if ( this.maxWeight > weight || this.types.indexOf( type ) > -1 )
            return;

        this.signal( "addType", type );
        this.types.push( type );

        forward = this.forward;

        if ( forward )
            using.Worklist( function( add ) {
                for ( const fw of forward ) add( type, fw, weight );
            } );
    }

    propagate( target, weight )
    {
        let types;

        if ( target === ANull || ( target instanceof Type && this.forward && this.forward.length > 2 ) ) return;

        if ( weight && weight !== WG.DEFAULT ) target = new Muffle( target, weight );

        ( this.forward || ( this.forward = [] ) ).push( target );

        types = this.types;

        if ( types.length )
            using.Worklist( function( add ) {
                for ( const t of types ) add( t, target, weight );
            } );
    }

    getProp( prop )
    {
        let found;

        if ( misc.ignoredProp( prop ) ) return ANull;

        found = ( this.props || ( this.props = Object.create( null ) ) )[ prop ];

        if ( !found )
        {
            found = this.props[ prop ] = new AVal();
            this.propagate( new GetProp( prop, found ) );
        }

        return found;
    }

    forAllProps( c )
    {
        this.propagate( new ForAllProps( c ) );
    }

    hasType( type )
    {
        return this.types.indexOf( type ) > -1;
    }

    isEmpty()
    {
        return this.types.length === 0;
    }

    getFunctionType()
    {
        for ( let i = this.types.length - 1; i >= 0; --i )
            if ( this.types[ i ] instanceof Fn ) return this.types[ i ];
    }

    getObjType()
    {
        let seen = null;

        for ( let i = this.types.length - 1; i >= 0; --i )
        {
            let type = this.types[ i ];

            if ( !( type instanceof Obj ) ) continue;

            if ( type.name ) return type;
            if ( !seen ) seen = type;
        }

        return seen;
    }

    getSymbolType()
    {
        for ( let i = this.types.length - 1; i >= 0; --i )
            if ( this.types[ i ] instanceof Sym ) return this.types[ i ];
    }

    getType( guess )
    {
        if ( this.types.length === 0 && guess !== false ) return this.makeupType();
        if ( this.types.length === 1 ) return this.types[ 0 ];

        return misc.canonicalType( this.types );
    }

    toString( maxDepth, parent )
    {
        let simplified;

        if ( this.types.length === 0 ) return misc.toString( this.makeupType(), maxDepth, parent );
        if ( this.types.length === 1 ) return misc.toString( this.types[ 0 ], maxDepth, parent );

        simplified = misc.simplifyTypes( this.types );

        if ( simplified.length > 2 ) return "?";

        return simplified.map( function( tp ) { return misc.toString( tp, maxDepth, parent ); } ).join( "|" );
    }

    makeupPropType( obj )
    {
        let propName = this.propertyName,
            protoProp = obj.proto && obj.proto.hasProp( propName );

        if ( protoProp )
        {
            let fromProto = protoProp.getType();

            if ( fromProto ) return fromProto;
        }

        if ( propName !== "<i>" )
        {
            let computedProp = obj.hasProp( "<i>" );

            if ( computedProp ) return computedProp.getType();
        }
        else if ( obj.props[ "<i>" ] !== this )
        {
            for ( let prop of Object.keys( obj.props ) )
            {
                let val = obj.props[ prop ];

                if ( !val.isEmpty() ) return val.getType();
            }
        }
    }

    makeupType()
    {
        let computed = this.propertyOf && this.makeupPropType( this.propertyOf );

        if ( computed ) return computed;

        if ( !this.forward ) return null;

        for ( let i = this.forward.length - 1; i >= 0; --i )
        {
            let hint = this.forward[ i ].typeHint();

            if ( hint && !hint.isEmpty() )
            {
                misc.guessing = true;
                return hint;
            }
        }

        let props = Object.create( null ), foundProp = null;

        for ( let fw of this.forward )
        {
            let prop = fw.propHint();

            if ( prop && prop !== "length" && prop !== "<i>" && prop !== "✖" && prop !== cx.completingProperty )
            {
                props[ prop ] = true;
                foundProp = prop;
            }
        }

        if ( !foundProp ) return null;

        let objs = cx.props[ foundProp ];

        if ( objs )
        {
            let matches = [];

            search:
            for ( let i = 0; i < objs.length; ++i )
            {
                let obj = objs[ i ];

                for ( let prop of Object.keys( props ) )
                    if ( !obj.hasProp( prop ) ) continue search;

                if ( obj.hasCtor ) obj = misc.getInstance( obj );
                matches.push( obj );
            }

            let canon = misc.canonicalType( matches );

            if ( canon )
            {
                misc.guessing = true;
                return canon;
            }
        }
    }

    typeHint()
    {
        return this.types.length ? this.getType() : null;
    }

    propagatesTo()
    {
        return this;
    }

    gatherProperties( f, depth )
    {
        for ( let t of this.types )
            t.gatherProperties( f, depth );
    }

    guessProperties( f )
    {
        if ( this.forward )
        {
            for ( let i = 0; i < this.forward.length; ++i )
            {
                let prop = this.forward[ i ].propHint();

                if ( prop ) f( prop, null, 0 );
            }
        }

        let guessed = this.makeupType();

        if ( guessed ) guessed.gatherProperties( f );
    }
}

module.exports = AVal;
