/** ****************************************************************************************************
 * File: misc (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    cx = require( './context' ).cx,
    ANull = require( './anull' ),
    Prim = require( './prim' ),
    Arr = require( './arr' ),
    Obj = require( './obj' ),
    Fn = require( './fn' ),
    Sym = require( './sym' );

let similarAVal, similarType, canonicalType;

module.exports.getSymbol = function( name, originNode ) {
    let cleanName = name.replace( /[^\w$\.]/g, "_" ),
        known = cx.symbols[ cleanName ];

    if ( known )
    {
        if ( originNode && !known.originNode ) known.originNode = originNode;
        return known;
    }

    return ( cx.symbols[ cleanName ] = new Sym( cleanName, originNode ) );
};


module.exports.toString = function( type, maxDepth, parent ) {
    if ( !type || type === parent || maxDepth && maxDepth < -3 ) return "?";
    return type.toString( maxDepth, parent );
};

module.exports.similarAVal = similarAVal = function( a, b, depth ) {
    let typeA = a.getType( false ),
        typeB = b.getType( false );

    if ( !typeA || !typeB ) return true;

    return similarType( typeA, typeB, depth );
};

module.exports.similarType = similarType = function( a, b, depth ) {
    if ( !a || depth >= 5 ) return b;

    if ( !a || a === b ) return a;

    if ( !b ) return a;

    if ( a.constructor !== b.constructor ) return false;

    if ( a.constructor === Arr )
    {
        let innerA = a.getProp( "<i>" ).getType( false );

        if ( !innerA ) return b;

        let innerB = b.getProp( "<i>" ).getType( false );

        if ( !innerB || similarType( innerA, innerB, depth + 1 ) ) return b;
    }
    else if ( a.constructor === Obj )
    {
        let propsA = 0,
            propsB = 0,
            same = 0;

        for ( let prop of Object.keys( a.props ) )
        {
            propsA++;
            if ( prop in b.props && similarAVal( a.props[ prop ], b.props[ prop ], depth + 1 ) )
                same++;
        }

        propsB += Object.keys( b.props ).length;

        if ( propsA && propsB && same < Math.max( propsA, propsB ) / 2 ) return false;

        return propsA > propsB ? a : b;
    }
    else if ( a.constructor === Fn )
    {
        if ( a.args.length !== b.args.length ||
             !a.args.every( ( tp, i ) => similarAVal( tp, b.args[ i ], depth + 1 ) ) ||
             !similarAVal( a.retval, b.retval, depth + 1 ) ||
             !similarAVal( a.self, b.self, depth + 1 )
        )
            return false;

        return a;
    }
    else
    {
        return false;
    }
};


module.exports.simplifyTypes = function( types ) {
    let found = [];

outer:
    for ( let tp of types )
    {
        for ( let j = 0; j < found.length; j++ )
        {
            let similar = similarType( tp, found[ j ], 0 );

            if ( similar )
            {
                found[ j ] = similar;
                continue outer;
            }
        }

        found.push( tp );
    }

    return found;
};

module.exports.canonicalType = canonicalType = function( types ) {
    let arrays = 0, fns = 0, objs = 0, prim = null;

    for ( let tp of types )
    {
        if ( tp instanceof Arr ) ++arrays;
        else if ( tp instanceof Fn ) ++fns;
        else if ( tp instanceof Obj ) ++objs;
        else if ( tp instanceof Prim )
        {
            if ( prim && tp.name !== prim.name ) return null;
            prim = tp;
        }
    }

    let kinds = ( arrays && 1 ) + ( fns && 1 ) + ( objs && 1 ) + ( prim && 1 );

    if ( kinds > 1 ) return null;

    if ( prim ) return prim;

    let maxScore = 0, maxTp = null;

    for ( let tp of types )
    {
        let score = 0;

        if ( arrays )
            score = tp.getProp( "<i>" ).isEmpty() ? 1 : 2;
        else if ( fns )
        {
            score = 1;

            for ( let a of tp.args ) if ( !a.isEmpty() ) ++score;
            if ( !tp.retval.isEmpty() ) ++score;
        }
        else if ( objs )
            score = tp.name ? 100 : 2;

        if ( score >= maxScore )
        {
            maxScore = score;
            maxTp = tp;
        }
    }

    return maxTp;
};

module.exports.getInstance = function( obj, ctor ) {

    if ( ctor === false ) return new Obj( obj );

    if ( !ctor ) ctor = obj.hasCtor;
    if ( !obj.instances ) obj.instances = [];

    for ( let cur of obj.instances )
        if ( cur.ctor === ctor ) return cur.instance;

    let instance = new Obj( obj, ctor && ctor.name );

    instance.origin = obj.origin;
    obj.instances.push( { ctor: ctor, instance: instance } );
    return instance;
};


module.exports.ignoredProp = name => name === "__proto__" || name === "✖" || geckoIterators && name === "__iterator__";

module.exports.guessing = false;

module.exports.WG = {
    DEFAULT: 100,
    NEW_INSTANCE: 90,
    MADEUP_PROTO: 10,
    MULTI_MEMBER: 6,
    CATCH_ERROR: 6,
    PHANTOM_OBJ: 1,
    GLOBAL_THIS: 90,
    SPECULATIVE_THIS: 2,
    SPECULATIVE_PROTO_THIS: 4
};

module.exports.ANull = new ANull();

module.exports.registerProp = function( prop, obj ) {
    let data = cx.props[ prop ] || ( cx.props[ prop ] = [] );

    data.push( obj );
};
