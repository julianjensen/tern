/** ****************************************************************************************************
 * File: condense (tern)
 * @author julian on 3/31/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';

// Condensing an inferred set of types to a JSON description document.

// This code can be used to, after a library has been analyzed,
// extract the types defined in that library and dump them as a JSON
// structure (as parsed by def.js).

// The idea being that big libraries can be analyzed once, dumped, and
// then cheaply included in later analysis.

const
    _ = require( 'lodash' ),
    misc = require( '../misc' ),
    AVal = require ( '../aval' ),
    Obj = require ( '../obj' ),
    Arr = require ( '../arr' ),
    Prim = require ( '../prim' ),
    Fn = require ( '../fn' ),
    Sym = require ( '../sym' ),
    cx = require( '../context' ).cx,
    State = require( './state' ),
    Type = require( '../type' );

class Condense
{
    constructor( origins, name, options )
    {
        if ( !Condense.typeNameStack ) Condense.typeNameStack = [];

        if ( typeof origins === "string" ) origins = [ origins ];

        let state = new State( origins, name || origins[ 0 ], options || {} );

        state.server.signal( "preCondenseReach", state );

        state.cx.topScope.path = "<top>";
        state.cx.topScope.reached( "", state );

        for ( let path of Object.keys( state.roots ) )
            Condense.reach( state.roots[ path ], null, path, state );

        for ( let pu of state.patchUp )
            Condense.patchUpSimpleInstance( pu, state );

        state.server.signal( "postCondenseReach", state );

        for ( let path of Object.keys( state.types ) )
            Condense.store( Condense.createPath( path.split( "." ), state ), state.types[ path ], state );

        for ( let path of Object.keys( state.altPaths ) )
            Condense.storeAlt( path, state.altPaths[ path ], state );

        if ( state.output[ "!define" ] && Object.keys( state.output[ "!define" ] ).length > 0 )
            delete state.output[ "!define" ];

        state.server.signal( "postCondense", state );

        return Condense.simplify( state.output, state.options.sortOutput );
    }

    static pathLen( path ) {
        let len = 1, pos = 0, dot;

        while ( ( dot = path.indexOf( ".", pos ) ) !== -1 )
        {
            pos = dot + 1;
            len += path.charAt( pos ) === "!" ? 10 : 1;
        }

        return len;
    }

    static hop( obj, prop )
    {
        return Object.prototype.hasOwnProperty.call( obj, prop );
    }

    static isSimpleInstance( o )
    {
        return o.proto && !( o instanceof Fn ) && o.proto !== cx.protos.Object && o.proto.hasCtor && !o.hasCtor;
    }

    static reach( type, path, id, state, byName )
    {
        let actual = type.getType( false );

        if ( !actual ) return;

        let orig = type.origin || actual.origin,
            relevant = false;

        if ( orig )
        {
            let origPos = state.cx.origins.indexOf( orig );

            // This is a path that is newer than the code we are interested in.
            if ( origPos > state.maxOrigin ) return;

            relevant = state.isTarget( orig );
        }

        let newPath = path ? path + "." + id : id,
            oldPath = actual.path,
            shorter = !oldPath || Condense.pathLen( oldPath ) > Condense.pathLen( newPath );

        if ( shorter )
        {
            if ( !( actual instanceof Prim ) ) actual.path = newPath;

            if ( actual.reached( newPath, state, !relevant ) && relevant )
            {
                let data = state.types[ oldPath ];

                if ( data )
                {
                    delete state.types[ oldPath ];
                    state.altPaths[ oldPath ] = actual;
                }
                else data = { type: actual };

                data.span = state.getSpan( type ) || ( actual !== type && state.isTarget( actual.origin ) && state.getSpan( actual ) ) || data.span;
                data.doc = type.doc || ( actual !== type && state.isTarget( actual.origin ) && actual.doc ) || data.doc;
                data.data = actual.metaData;
                data.byName = data.byName === null ? !!byName : data.byName && byName;
                state.types[ newPath ] = data;
            }
        }
        else if ( relevant )
            state.altPaths[ newPath ] = actual;
    }

    static reachByName( aval, path, id, state )
    {
        let type = aval.getType();

        if ( type ) Condense.reach( type, path, id, state, true );
    }

    static patchUpSimpleInstance( obj, state )
    {
        let path = obj.proto.hasCtor.path;

        if ( path )
            obj.nameOverride = "+" + path;
        else
            path = obj.path;

        for ( let prop of Object.keys( obj.props ) )
            Condense.reach( obj.props[ prop ], path, prop, state );
    }

    static createPath( parts, state )
    {
        let base = state.output,
            defs = state.output[ "!define" ],
            path;

        for ( let part of parts )
        {
            path = path ? path + "." + part : part;

            let me = state.types[ path ];

            if ( part.charAt( 0 ) === "!" || me && me.byName )
            {
                if ( Condense.hop( defs, path ) ) base = defs[ path ];
                else defs[ path ] = base = {};
            }
            else
            {
                if ( Condense.hop( base, part ) ) base = base[ part ];
                else base = base[ part ] = {};
            }
        }

        return base;
    }

    static store( out, info, state )
    {
        let name = Condense.typeName( info.type );

        if ( name !== info.type.path && name !== "?" )
            out[ "!type" ] = name;
        else if ( info.type.proto && info.type.proto !== state.cx.protos.Object )
        {
            let protoName = Condense.typeName( info.type.proto );

            if ( protoName !== "?" ) out[ "!proto" ] = protoName;
        }

        if ( info.span ) out[ "!span" ] = info.span;
        if ( info.doc ) out[ "!doc" ] = info.doc;
        if ( info.data ) out[ "!data" ] = info.data;
    }

    static storeAlt( path, type, state )
    {
        let parts = path.split( "." ),
            last = parts.pop();

        if ( last[ 0 ] === "!" ) return;

        let known = state.types[ parts.join( "." ) ],
            base = Condense.createPath( parts, state );

        if ( known && known.type.constructor !== Obj ) return;
        if ( !Condense.hop( base, last ) )
            base[ last ] = type.nameOverride || type.path;
    }

    static simplify( data, sort )
    {
        if ( typeof data !== "object" ) return data;

        let sawType = false,
            sawOther = false;

        for ( let prop of Object.keys( data ) )
        {
            if ( prop === "!type" )
                sawType = true;
            else
                sawOther = true;

            if ( prop !== "!data" )
                data[ prop ] = Condense.simplify( data[ prop ], sort );
        }

        if ( sawType && !sawOther ) return data[ "!type" ];

        return sort ? Condense.sortObject( data ) : data;
    }

    static sortObject( obj )
    {
        let out = {};

        _.each( Object.keys( obj ).sort(), key => out[ key ] = obj[ key ] );

        return out;
    }

    static typeName( value )
    {
        let isType = value instanceof Type;

        if ( isType )
        {
            if ( Condense.typeNameStack.indexOf( value ) > -1 )
                return value.path || "?";

            Condense.typeNameStack.push( value );
        }

        let name = value.typeName();

        if ( isType ) Condense.typeNameStack.pop();

        return name;
    }
}

Arr.prototype.reached = function ( path, state, concrete ) {
    if ( concrete ) return true;

    if ( this.tuple )
    {
        for ( let i = 0; i < this.tuple; i++ )
            Condense.reachByName( this.getProp( String( i ) ), path, String( i ), state );
    }
    else
        Condense.reachByName( this.getProp( "<i>" ), path, "<i>", state );

    return true;
};

Fn.prototype.reached = function( path, state, concrete ) {

    Obj.prototype.reached.call( this, path, state, concrete );

    if ( !concrete )
    {
        for ( let i = 0; i < this.args.length; ++i )
            Condense.reachByName( this.args[ i ], path, "!" + i, state );

        Condense.reachByName( this.retval, path, "!ret", state );
    }

    return true;
};

Obj.prototype.reached = function( path, state, concrete ) {

    if ( Condense.isSimpleInstance( this ) && !this.condenseForceInclude )
    {
        if ( state.patchUp.indexOf( this ) === -1 ) state.patchUp.push( this );
        return true;
    }
    else if ( this.proto && !concrete )
        Condense.reach( this.proto, path, "!proto", state );

    let hasProps = false;

    for ( let prop of Object.keys( this.props ) )
    {
        Condense.reach( this.props[ prop ], path, prop, state );
        hasProps = true;
    }

    if ( !hasProps && !this.condenseForceInclude && !( this instanceof Fn ) )
    {
        this.nameOverride = "?";
        return false;
    }

    return true;
};

AVal.prototype.typeName = function () {
    if ( this.types.length === 0 ) return "?";

    if ( this.types.length === 1 ) return Condense.typeName( this.types[ 0 ] );

    let simplified = misc.simplifyTypes( this.types );

    if ( simplified.length > 2 ) return "?";

    return _.map( simplified, Condense.typeName ).join( "|" );
};

misc.ANull.typeName = function() { return "?"; };

Prim.prototype.typeName = function() { return this.name; };

Sym.prototype.typeName = function() { return this.asPropName; };

Arr.prototype.typeName = function() {

    if ( !this.tuple )
        return "[" + Condense.typeName( this.getProp( "<i>" ) ) + "]";

    let content = [];

    for ( let i = 0; i < this.tuple; i++ )
      content.push( Condense.typeName( this.getProp( String( i ) ) ) );

    return "[" + content.join( ", " ) + "]";
};

Fn.prototype.typeName = function() {

    let out = this.generator ? "fn*(" : "fn(";

    for ( let i = 0; i < this.args.length; ++i )
    {
        if ( i ) out += ", ";

        let name = this.argNames[ i ];

        if ( name && name !== "?" ) out += name + ": ";

        out += Condense.typeName( this.args[ i ] );
    }

    out += ")";

    if ( this.computeRetSource )
        out += " -> " + this.computeRetSource;
    else if ( !this.retval.isEmpty() )
        out += " -> " + Condense.typeName( this.retval );

    return out;
};

Obj.prototype.typeName = function() {
    if ( this.nameOverride ) return this.nameOverride;
    if ( !this.path ) return "?";
    return this.path;
};
