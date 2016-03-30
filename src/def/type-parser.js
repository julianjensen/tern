/** ****************************************************************************************************
 * File: type-parser (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';

const
    DefProp = require( '../props/def-prop' ),
    cx = require( '../context' ).cx,
    AVal = require( '../aval' ),
    Obj = require( '../obj' ),
    Fn = require( '../fn' ),
    Arr = require( '../arr' ),
    misc = require( '../misc' ),
    WG = misc.WG,
    is = require( '../is' ),
    using = require( '../with' ),
    CANull = require( '../anull' ),
    ANull = misc.ANull;

let currentTopScope;

class TypeParser
{
    constructor( spec, start, base, forceNew )
    {
        this.pos = start || 0;
        this.spec = spec;
        this.base = base;
        this.forceNew = forceNew;

        // Used to register custom logic for more involved effect or type
        // computation.
        TypeParser.customFunctions = Object.create( null );

    }

    static registerFunction( name, f )
    {
        TypeParser.customFunctions[ name ] = f;
    }

    static parse( data, origin, path )
    {
        if ( origin )
        {
            cx.origin = origin;
            cx.localDefs = cx.definitions[ origin ];
        }

        try
        {
            if ( typeof data === "string" )
                return TypeParser.parseType( data, path );
            else
                return passTwo( passOne( null, data, path ), data, path );
        }
        finally
        {
            if ( origin ) cx.origin = cx.localDefs = null;
        }
    }

    eat( str )
    {
        if ( str.length === 1 ? this.spec.charAt( this.pos ) === str : this.spec.indexOf( str, this.pos ) === this.pos )
        {
            this.pos += str.length;
            return true;
        }
    }

    word( _re )
    {
        let word = "",
            ch,
            re = _re || /[\w$]/;

        while ( ( ch = this.spec.charAt( this.pos ) ) && re.test( ch ) )
        {
            word += ch;
            ++this.pos;
        }

        return word;
    }

    error()
    {
        throw new Error( "Unrecognized type spec: " + this.spec + " (at " + this.pos + ")" );
    }

    parseFnType( comp, name, top, generator )
    {
        let args = [],
            names = [],
            computed = false,
            retType,
            computeRet,
            computeRetStart,
            fn;

        if ( !this.eat( ")" ) )
        {
            for ( var i = 0;; ++i )
            {
                let colon = this.spec.indexOf( ": ", this.pos ),
                    argname;

                if ( colon !== -1 )
                {
                    argname = this.spec.slice( this.pos, colon );

                    if ( /^[$\w?]+$/.test( argname ) )
                        this.pos = colon + 2;
                    else
                        argname = null;
                }

                names.push( argname );

                let argType = this.parseType( comp );

                if ( argType.call ) computed = true;

                args.push( argType );

                if ( !this.eat( ", " ) )
                {
                    // jshint -W030
                    this.eat( ")" ) || this.error();
                    break;
                }
            }
        }

        if ( this.eat( " -> " ) )
        {
            let retStart = this.pos;

            retType = this.parseType( true );

            if ( retType.call && !computed )
            {
                computeRet = retType;
                retType = ANull;
                computeRetStart = retStart;
            }
        }
        else
        {
            retType = ANull;
        }
        if ( computed ) return computedFunc( name, args, retType, generator );

        if ( top && ( fn = this.base ) )
            Fn.call( this.base, name, ANull, args, names, retType, generator );
        else
            fn = new Fn( name, ANull, args, names, retType, generator );

        if ( computeRet ) fn.computeRet = computeRet;
        if ( computeRetStart !== null ) fn.computeRetSource = this.spec.slice( computeRetStart, this.pos );

        return fn;
    }

    parseType( comp, name, top )
    {
        let main = this.parseTypeMaybeProp( comp, name, top );

        if ( !this.eat( "|" ) ) return main;

        let types = [ main ],
            computed = main.call;

        for ( ;; )// jscs:ignore disallowSpaceBeforeSemicolon
        {
            let next = this.parseTypeMaybeProp( comp, name, top );

            types.push( next );
            if ( next.call ) computed = true;
            if ( !this.eat( "|" ) ) break;
        }

        if ( computed ) return computedUnion( types );

        let union = new AVal();

        for ( let type of types ) type.propagate( union );

        union.maxWeight = 1e5;

        return union;
    }

    parseTypeMaybeProp( comp, name, top )
    {
        let result = this.parseTypeInner( comp, name, top );

        while ( comp && this.eat( "." ) ) result = this.extendWithProp( result );

        return result;
    }

    extendWithProp( base )
    {
        let propName = this.word( /[\w<>$!:]/ ) || this.error();

        if ( base.apply ) return function ( self, args ) {
            return extractProp( base( self, args ), propName );
        };

        return extractProp( base, propName );
    }

    static parsePath( path, scope )
    {
        let cached = cx.paths[ path ],
            origPath = path;

        if ( cached !== null ) return cached;

        cx.paths[ path ] = ANull;

        let base = scope || currentTopScope || cx.topScope;

        if ( cx.localDefs )
        {
            for ( let name of Object.keys( cx.localDefs ) )
            {
                if ( path.indexOf( name ) === 0 )
                {
                    if ( path === name )
                        return ( cx.paths[ path ] = cx.localDefs[ path ] );

                    if ( path.charAt( name.length ) === "." )
                    {
                        base = cx.localDefs[ name ];
                        path = path.slice( name.length + 1 );
                        break;
                    }
                }
            }
        }

        let result = descendProps( base, path.split( "." ) );
        // Uncomment this to get feedback on your poorly written .json files
        // if (result == infer.ANull) console.error("bad path: " + origPath + " (" + cx.curOrigin + ")")
        cx.paths[ origPath ] = result === ANull ? null : result;

        return result;
    }

    static parseEffect( effect, fn )
    {
        let m;

        if ( effect.indexOf( "propagate " ) === 0 )
        {
            let p = new TypeParser( effect, 10 ),
                origin = p.parseType( true );

            if ( !p.eat( " " ) ) p.error();

            let target = p.parseType( true );

            addEffect( fn, function ( self, args ) {
                unwrapType( origin, self, args ).propagate( unwrapType( target, self, args ) );
            } );
        }
        else if ( effect.indexOf( "call " ) === 0 )
        {
            let andRet = effect.indexOf( "and return ", 5 ) === 5,
                p = new TypeParser( effect, andRet ? 16 : 5 ),
                getCallee = p.parseType( true ), getSelf = null, getArgs = [];

            if ( p.eat( " this=" ) ) getSelf = p.parseType( true );

            while ( p.eat( " " ) ) getArgs.push( p.parseType( true ) );

            addEffect( fn, function ( self, args ) {
                let callee = unwrapType( getCallee, self, args ),
                    slf = getSelf ? unwrapType( getSelf, self, args ) : ANull,
                    as = [];

                for ( let arg of getArgs )
                    as.push( unwrapType( arg, self, args ) );

                let result = andRet ? new AVal() : ANull;

                callee.propagate( new is.Callee( slf, as, null, result ) );

                return result;

            }, andRet );
        }
        else if ( ( m = effect.match( /^custom (\S+)\s*(.*)/ ) ) )
        {
            let customFunc = TypeParser.customFunctions[ m[ 1 ] ];

            if ( customFunc ) addEffect( fn, m[ 2 ] ? customFunc( m[ 2 ] ) : customFunc );
        }
        else if ( effect.indexOf( "copy " ) === 0 )
        {
            let p = new TypeParser( effect, 5 ),
                getFrom = p.parseType( true );

            p.eat( " " );

            let getTo = p.parseType( true );

            addEffect( fn, function ( self, args ) {
                let from = unwrapType( getFrom, self, args ),
                    to = unwrapType( getTo, self, args );

                from.forAllProps( function ( prop, val, local ) {
                    if ( local && prop !== "<i>" )
                        to.propagate( new DefProp( prop, val ) );
                } );
            } );
        }
        else
            throw new Error( "Unknown effect type: " + effect );
    }

    parseTypeInner( comp, name, top )
    {
        let meals = [ "fn(", "fn*(", "[", "+", ":", "!", "?" ],
            menuItem = 0,
            next, name, inner, types, computed;

        for ( let m of meals )
        {
            if ( this.eat( m ) )
            {
                if ( m === "!" && !comp ) menuItem = meals.length + 1;
                break;
            }
        }

        switch ( menuItem )
        {
            case 1:
            case 0:     return this.parseFnType( comp, name, top, menuItem === 1 );

            case 2:     inner = this.parseType( comp );
                        computed = inner.call;

                        while ( this.eat( ", " ) )
                        {
                            types = types || [ inner ];

                            next = this.parseType( comp );

                            types.push( next );
                            computed = computed || next.call;
                        }

                        // jshint -W030
                        this.eat( "]" ) || this.error();

                        if ( computed )
                            return types ? computedTuple( types ) : computedArray( inner );

                        if ( top && this.base )
                        {
                            Arr.call( this.base, types || inner );

                            return this.base;
                        }

                        return new Arr( types || inner );

            case 3:     let path = this.word( /[\w$<>\.:!]/ ),
                            base = cx.localDefs[ path + ".prototype" ],
                            proto;

                        if ( !base )
                        {
                            base = TypeParser.parsePath( path );

                            if ( !( base instanceof Obj ) ) return base;

                            proto = descendProps( base, [ "prototype" ] );

                            if ( proto && ( proto = proto.getObjType() ) )
                                base = proto;
                        }

                        if ( comp && this.eat( "[" ) ) return this.parsePoly( base );

                        if ( top && this.base )
                        {
                            this.base.proto = base;

                            name = base.hasCtor && base.hasCtor.name || base.name;

                            if ( name ) this.base.name = name;

                            return this.base;
                        }

                        return ( top && this.forceNew ) ? new Obj( base ) : misc.getInstance( base );

            case 4:     return misc.getSymbol( this.word( /[\w$\.]/ ) );

            case 5:     let arg = this.word( /\d/ );

                        if ( arg )
                        {
                            arg = Number( arg );
                            return ( _self, args ) => args[ arg ] || ANull;
                        }
                        else if ( this.eat( "this" ) )
                            return self => self;
                        else if ( this.eat( "custom:" ) )
                            return TypeParser.customFunctions[ this.word( /[\w$]/ ) ] || () => ANull;

                        return this.fromWord( "!" + this.word( /[\w$<>\.!:]/ ) );

            case 6:     return ANull;

            default:    return this.fromWord( this.word( /[\w$<>\.!:`]/ ) );
        }
    }

    fromWord( spec )
    {
        switch ( spec )
        {
            case "number":      return cx.num;
            case "string":      return cx.str;
            case "bool":        return cx.bool;
            case "<top>":       return cx.topScope;
        }

        if ( cx.localDefs && spec in cx.localDefs )
            return cx.localDefs[ spec ];

        return TypeParser.parsePath( spec );
    }

    parsePoly( base )
    {
        let propName = "<i>", match;

        if ( ( match = this.spec.slice( this.pos ).match( /^\s*([\w$:]+)\s*=\s*/ ) ) )
        {
            propName = match[ 1 ];
            this.pos += match[ 0 ].length;
        }

        let value = this.parseType( true );

        if ( !this.eat( "]" ) ) this.error();

        if ( value.call ) return function ( self, args ) {
            let instance = new Obj( base );

            value( self, args ).propagate( instance.defProp( propName ) );

            return instance;
        };

        let instance = new Obj( base );

        value.propagate( instance.defProp( propName ) );
        return instance;
    }

    static load( data, scope )
    {
        let oldScope = currentTopScope;

        if ( !scope ) scope = cx.topScope;

        currentTopScope = scope;

        try
        {
            doLoadEnvironment( data, scope );
        }
        finally
        {
            currentTopScope = oldScope;
        }
    }
}

module.exports = TypeParser;

// Type description parser
//
// Type description JSON files (such as ecma5.json and browser.json)
// are used to
//
// A) describe types that come from native code
//
// B) to cheaply load the types for big libraries, or libraries that
//    can't be inferred well

function parseType( spec, name, base, forceNew )
{
    let type = new TypeParser( spec, null, base, forceNew ).parseType( false, name, true );

    if ( /^fn\(/.test( spec ) )
    {
        for ( let i = 0; i < type.args.length; ++i )
        {
            let arg = type.args[ i ];

            if ( arg instanceof Fn && arg.args && arg.args.length )
            // jshint -W083
                addEffect( type, function ( _self, fArgs ) {
                    let fArg = fArgs[ i ];

                    if ( fArg )
                        fArg.propagate( new is.Callee( cx.topScope, arg.args, null, ANull ) );
                } );
        }
    }

    return type;
}

function emptyObj( Ctor )
{
    let empty = new Ctor();

    empty.props = Object.create( null );
    empty.isShell = true;
    return empty;
}

function isSimpleAnnotation( spec )
{
    if ( !spec[ "!type" ] || /^(fn\(|\[|\+)/.test( spec[ "!type" ] ) ) return false;

    for ( let prop of Object.keys( spec ) )
        if ( prop !== "!type" && prop !== "!doc" && prop !== "!url" && prop !== "!span" && prop !== "!data" )
            return false;

    return true;
}

function passOne( base, spec, path )
{
    if ( !base )
    {
        let tp = spec[ "!type" ];

        if ( tp )
        {
            if ( /^fn\(/.test( tp ) ) base = emptyObj( Fn );
            else if ( tp.charAt( 0 ) === "[" ) base = emptyObj( Arr );
            else if ( tp.charAt( 0 ) === "+" ) base = emptyObj( Obj );
            else throw new Error( "Invalid !type spec: " + tp );
        }
        else if ( spec[ "!stdProto" ] )
            base = cx.protos[ spec[ "!stdProto" ] ];
        else
            base = emptyObj( Obj );

        base.name = path;
    }

    for ( let name of Object.keys( spec ) )
    {
        if ( hop( spec, name ) && name.charCodeAt( 0 ) !== 33 )
        {
            let inner = spec[ name ];

            if ( typeof inner === "string" || isSimpleAnnotation( inner ) ) continue;

            let prop = base.defProp( name );

            passOne( prop.getObjType(), inner, path ? path + "." + name : name ).propagate( prop );
        }
    }

    return base;
}

function passTwo( base, spec, path )
{
    if ( base.isShell )
    {
        delete base.isShell;

        let tp = spec[ "!type" ];

        if ( tp )
            parseType( tp, path, base );
        else
        {
            let proto = spec[ "!proto" ] && parseType( spec[ "!proto" ] );

            Obj.call( base, proto instanceof Obj ? proto : true, path );
        }
    }

    let effects = spec[ "!effects" ];

    if ( effects && base instanceof Fn )
    {
        for ( let effect of effects )
            TypeParser.parseEffect( effect, base );
    }

    copyInfo( spec, base );

    for ( let name of Object.keys( spec ) )
    {
        if ( hop( spec, name ) && name.charCodeAt( 0 ) !== 33 )
        {
            let inner     = spec[ name ],
                known     = base.defProp( name ),
                innerPath = path ? path + "." + name : name;

            if ( typeof inner === "string" )
                if ( known.isEmpty() ) parseType( inner, innerPath ).propagate( known );
                else
                {
                    if ( !isSimpleAnnotation( inner ) )
                        passTwo( known.getObjType(), inner, innerPath );
                    else if ( known.isEmpty() )
                        parseType( inner[ "!type" ], innerPath, null, true ).propagate( known );
                    else
                        continue;

                    if ( inner[ "!doc" ] ) known.doc = inner[ "!doc" ];
                    if ( inner[ "!url" ] ) known.url = inner[ "!url" ];
                    if ( inner[ "!span" ] ) known.span = inner[ "!span" ];
                }
        }
    }

    return base;
}

function copyInfo( spec, type )
{
    if ( spec[ "!doc" ] ) type.doc = spec[ "!doc" ];
    if ( spec[ "!url" ] ) type.url = spec[ "!url" ];
    if ( spec[ "!span" ] ) type.span = spec[ "!span" ];
    if ( spec[ "!data" ] ) type.metaData = spec[ "!data" ];
}

function addEffect( fn, handler, replaceRet )
{
    let oldCmp = fn.computeRet,
        rv     = fn.retval;

    fn.computeRet = function ( self, args, argNodes ) {
        let handled = handler( self, args, argNodes ),
            old     = oldCmp ? oldCmp( self, args, argNodes ) : rv;

        return replaceRet ? handled : old;
    };
}

function descendProps( base, parts )
{
    for ( var i = 0; i < parts.length && base !== ANull; ++i )
    {
        let prop = parts[ i ];

        if ( prop.charAt( 0 ) === "!" )
        {
            if ( prop === "!proto" )
                base = ( base instanceof Obj && base.proto ) || ANull;
            else
            {
                let fn = base.getFunctionType();

                if ( !fn )
                    base = ANull;
                else if ( prop === "!ret" )
                    base = fn.retval && fn.retval.getType( false ) || ANull;
                else
                {
                    let arg = fn.args && fn.args[ Number( prop.slice( 1 ) ) ];

                    base = ( arg && arg.getType( false ) ) || ANull;
                }
            }
        }
        else if ( base instanceof Obj && ( prop === "prototype" && base instanceof Fn || base.hasProp( prop ) ) )
        {
            let propVal = base.getProp( prop );

            if ( !propVal || propVal.isEmpty() )
                base = ANull;
            else
                base = propVal.types[ 0 ];
        }
        else
            base = ANull;
    }

    return base;
}

function hop( obj, prop )
{
    return Object.prototype.hasOwnProperty.call( obj, prop );
}

function unwrapType( type, self, args )
{
    return type.call ? type( self, args ) : type;
}

function extractProp( type, prop )
{
    if ( prop === "!ret" )
    {
        if ( type.retval ) return type.retval;

        let rv = new AVal();

        type.propagate( new is.Callee( ANull, [], null, rv ) );
        return rv;
    }
    else
    {
        return type.getProp( prop );
    }
}

function computedFunc( name, args, retType, generator )
{
    return function ( self, cArgs ) {
        let realArgs = [];

        for ( let arg of args )
            realArgs.push( unwrapType( arg, self, cArgs ) );

        return new Fn( name, ANull, realArgs, unwrapType( retType, self, cArgs ), generator );
    };
}

function computedUnion( types )
{
    return function ( self, args ) {
        let union = new AVal();

        for ( let type of types )
            unwrapType( type, self, args ).propagate( union );

        union.maxWeight = 1e5;
        return union;
    };
}

function computedArray( inner )
{
    return function ( self, args ) {
        return new Arr( inner( self, args ) );
    };
}
function computedTuple( types )
{
    return function ( self, args ) {
        return new Arr( types.map( tp => unwrapType( tp, self, args ) ) );
    };
}

function doLoadEnvironment( data, scope )
{
    let server = cx.parent;

    using.addOrigin( cx.curOrigin = data[ "!name" ] || "env#" + cx.origins.length );

    cx.localDefs = cx.definitions[ cx.curOrigin ] = Object.create( null );

    if ( server ) server.signal( "preLoadDef", data );

    passOne( scope, data );

    let def = data[ "!define" ];

    if ( def )
    {
        for ( let name of Object.keys( def ) )
        {
            let spec = def[ name ];

            cx.localDefs[ name ] = typeof spec === "string" ? TypeParser.parsePath( spec ) : passOne( null, spec, name );
        }

        for ( let name of Object.keys( def ) )
        {
            let spec = def[ name ];

            if ( typeof spec !== "string" ) passTwo( cx.localDefs[ name ], def[ name ], name );
        }
    }

    passTwo( scope, data );

    if ( server ) server.signal( "postLoadDef", data );

    cx.curOrigin = cx.localDefs = null;
}


TypeParser.registerFunction( "Object_create", function ( _self, args, argNodes ) {

    if ( argNodes && argNodes.length && argNodes[ 0 ].type === "Literal" && argNodes[ 0 ].value === null )
        return new Obj();

    let result = new AVal();

    if ( args[ 0 ] ) args[ 0 ].propagate( new is.Created( 0, result, args[ 1 ] ) );

    return result;
} );

class PropSpec extends CANull
{
    constructor( target )
    {
        this.target = target;
    }

    addType( tp )
    {
        if ( !( tp instanceof Obj ) ) return;

        if ( tp.hasProp( "value" ) )
            tp.getProp( "value" ).propagate( this.target );
        else if ( tp.hasProp( "get" ) )
            tp.getProp( "get" ).propagate( new is.Callee( ANull, [], null, this.target ) );
    }
}

TypeParser.registerFunction( "Object_defineProperty", function ( _self, args, argNodes ) {
    if ( argNodes && argNodes.length >= 3 && argNodes[ 1 ].type === "Literal" && typeof argNodes[ 1 ].value === "string" )
    {
        let obj = args[ 0 ], connect = new AVal();

        obj.propagate( new DefProp( argNodes[ 1 ].value, connect, argNodes[ 1 ] ) );

        args[ 2 ].propagate( new PropSpec( connect ) );
    }

    return ANull;
} );

TypeParser.registerFunction( "Object_defineProperties", function ( _self, args, argNodes ) {
    if ( args.length >= 2 )
    {
        let obj = args[ 0 ];

        args[ 1 ].forAllProps( function ( prop, val, local ) {
            if ( !local ) return;

            let connect = new AVal();

            obj.propagate( new DefProp( prop, connect, argNodes && argNodes[ 1 ] ) );

            val.propagate( new PropSpec( connect ) );
        } );
    }

    return ANull;
} );


TypeParser.registerFunction( "Function_bind", function ( self, args ) {
    if ( !args.length ) return ANull;

    let result = new AVal();

    self.propagate( new is.Bound( args[ 0 ], args.slice( 1 ), result ) );

    return result;
} );

TypeParser.registerFunction( "Array_ctor", function ( _self, args ) {
    let arr = new Arr();

    if ( args.length !== 1 || !args[ 0 ].hasType( cx.num ) )
    {
        let content = arr.getProp( "<i>" );

        for ( let i = 0; i < args.length; ++i ) args[ i ].propagate( content );
    }

    return arr;
} );

TypeParser.registerFunction( "Promise_ctor", function ( _self, args, argNodes ) {
    let defs6 = cx.definitions.ecma6;

    if ( !defs6 || args.length < 1 ) return ANull;

    let self = new Obj( defs6[ "Promise.prototype" ] ),
        valProp = self.defProp( ":t", argNodes && argNodes[ 0 ] ),
        valArg = new AVal();

    valArg.propagate( valProp );

    let exec = new Fn( "execute", ANull, [ valArg ], [ "value" ], ANull ),
        reject = defs6.Promise_reject;

    args[ 0 ].propagate( new is.Callee( ANull, [ exec, reject ], null, ANull ) );

    return self;
} );

class PromiseResolvesTo extends CANull
{
    constructor( output )
    {
        this.output = output;
    }

    addType( tp )
    {
      if ( tp.constructor === Obj && tp.name === "Promise" && tp.hasProp( ":t" ) )
          tp.getProp( ":t" ).propagate( this.output );
      else
          tp.propagate( this.output );
    }
}

WG.PROMISE_KEEP_VALUE = 50;

TypeParser.registerFunction( "Promise_then", function ( self, args, argNodes ) {
    let fn = args.length && args[ 0 ].getFunctionType(),
        defs6 = cx.definitions.ecma6;

    if ( !fn || !defs6 ) return self;

    let result = new Obj( defs6[ "Promise.prototype" ] ),
        value = result.defProp( ":t", argNodes && argNodes[ 0 ] ), ty;

    if ( fn.retval.isEmpty() && ( ty = self.getType() ) instanceof Obj && ty.hasProp( ":t" ) )
        ty.getProp( ":t" ).propagate( value, WG.PROMISE_KEEP_VALUE );

    fn.retval.propagate( new PromiseResolvesTo( value ) );

    return result;
} );

TypeParser.registerFunction( "getOwnPropertySymbols", function ( _self, args ) {
    if ( !args.length ) return ANull;

    let result = new AVal();

    args[ 0 ].forAllProps( function ( prop, _val, local ) {
        if ( local && prop.charAt( 0 ) === ":" ) result.addType( misc.getSymbol( prop.slice( 1 ) ) );
    } );

    return result;
} );

TypeParser.registerFunction( "getSymbol", function ( _self, _args, argNodes ) {

    if ( argNodes.length && argNodes[ 0 ].type === "Literal" && typeof argNodes[ 0 ].value === "string" )
        return misc.getSymbol( argNodes[ 0 ].value );
    else
        return ANull;
} );
