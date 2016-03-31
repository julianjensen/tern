/** ****************************************************************************************************
 * File: infer (tern)
 * @author julian on 3/31/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    walk = require( 'acorn/dist/walk' ),
    misc = require( './misc' ),
    is = require( './is' ),
    cx = require( './context' ).cx,
    Scope = require( './scope' ),
    DefProp = require( './props/def-prop' ),
    GetProp = require( './props/get-prop' ),
    Constraint = require( './constraint' ),
    RetVal = require( './retval' ),
    Fn = require( './fn' ),
    FnPrototype = require( './fn-prototype' ),
    Arr = require( './arr' ),
    Obj = require( './obj' ),
    AVal = require( './aval' ),
    WG = misc.WG,
    using = require( './with' );

let inferWrapper,

//<editor-fold desc="inferPatternVisitor: Acorn Pattern Visitor">
    inferPatternVisitor = {
    Identifier:         function( node, scope, source )
                        {
                            source.propagate( Constraint.ensureVar( node, scope ) );
                        },

    MemberExpression:   function( node, scope, source )
                        {
                            let obj = infer( node.object, scope ),
                                pName = Constraint.propName( node, scope );

                            obj.propagate( new DefProp( pName, source, node.property ) );
                        },

    RestElement:        function( node, scope, source )
                        {
                            connectPattern( node.argument, scope, new Arr( source ) );
                        },

    ObjectPattern:      function( node, scope, source )
                        {
                            for ( var i = 0; i < node.properties.length; ++i )
                            {
                                let prop = node.properties[ i ];

                                connectPattern( prop.value, scope, source.getProp( prop.key.name ) );
                            }
                        },

    ArrayPattern:       function( node, scope, source )
                        {
                            for ( let i = 0; i < node.elements.length; i++ )
                                if ( node.elements[ i ] )
                                    connectPattern( node.elements[ i ], scope, source.getProp( String( i ) ) );
                        },

    AssignmentPattern: function( node, scope, source )
                        {
                            connectPattern( node.left, scope, Constraint.join( source, infer( node.right, scope ) ) );
                        }
};
//</editor-fold>

function connectPattern( node, scope, source )
{
    let connecter = inferPatternVisitor[ node.type ];

    if ( connecter ) connecter( node, scope, source );
}

function getThis( scope )
{
    let fnScope = Scope.functionScope( scope );

    return fnScope.fnType ? fnScope.fnType.self : fnScope;
}

function maybeAddPhantomObj( obj )
{
    if ( !obj.isEmpty() || !obj.propertyOf ) return;

    obj.propertyOf.getProp( obj.propertyName ).addType( new Obj(), WG.PHANTOM_OBJ );
    maybeAddPhantomObj( obj.propertyOf );
}

function inferClass( node, scope, name )
{
    if ( !name && node.id ) name = node.id.name;

    let sup = cx.protos.Object,
        supCtor,
        delayed;

    if ( node.superClass )
    {
        if ( node.superClass.type === "Literal" && node.superClass.value === null )
            sup = null;
        else
        {
            let supVal = infer( node.superClass, scope ),
                supProto;

            supCtor = supVal.getFunctionType();

            if ( supCtor && ( supProto = supCtor.getProp( "prototype" ).getObjType() ) )
                sup = supProto;
            else
            {
                supCtor = supVal;
                delayed = supVal.getProp( "prototype" );
            }
        }
    }

    let proto = new Obj( sup, name && name + ".prototype" );

    if ( delayed ) delayed.propagate( new FnPrototype.HasProto( proto ) );

    return using.Super( supCtor, delayed || sup, function() {
        let ctor,
            body = node.body.body;

        for ( let b of body )
            if ( b.kind === "constructor" ) ctor = b.value;

        let fn = node.objType = ctor ? infer( ctor, scope ) : new Fn( name, misc.ANull, [], null, misc.ANull );

        fn.originNode = node.id || ctor || node;

        let inst = misc.getInstance( proto, fn );

        fn.self.addType( inst );

        fn.defProp( "prototype", node ).addType( proto );

        for ( let method of body )
        {
            let target;

            if ( method.kind === "constructor" ) continue;

            let pName = Constraint.propName( method, scope );

            if ( pName === "<i>" || method.kind === "set" )
                target = misc.ANull;
            else
            {
                target = ( method.static ? fn : proto ).defProp( pName, method.key );
                target.initializer = true;
                if ( method.kind === "get" ) target = new is.Callee( inst, [], null, target );
            }

            infer( method.value, scope, target );
            let methodFn = target.getFunctionType();

            if ( methodFn ) methodFn.self.addType( inst );
        }

        return fn;
    } );
}

function arrayLiteralType( elements, scope, inner )
{
    let tuple = elements.length > 1 && elements.length < 6;

    if ( tuple )
    {
        let homogenous = true, litType;

        for ( let elt of elements )
        {
            if ( !elt )
                tuple = false;
            else if ( elt.type !== "Literal" || ( litType && litType !== typeof elt.value ) )
                homogenous = false;
            else
                litType = typeof elt.value;
        }
        if ( homogenous ) tuple = false;
    }

    if ( tuple )
    {
        let types = [];

        for ( let i = 0; i < elements.length; ++i )
            types.push( inner( elements[ i ], scope ) );

        return new Arr( types );
    }
    else if ( elements.length < 2 )
        return new Arr( elements[ 0 ] && inner( elements[ 0 ], scope ) );
    else
    {
        let eltVal = new AVal();

        for ( let elt of elements )
            if ( elt ) inner( elt, scope ).propagate( eltVal );

        return new Arr( eltVal );
    }
}

function ret( f )
{
    return function( node, scope, out, name ) {
        let r = f( node, scope, name );

        if ( out ) r.propagate( out );

        return r;
    };
}

function fill( f )
{
    return function( node, scope, out, name ) {
        if ( !out ) out = new AVal();
        f( node, scope, out, name );
        return out;
    };
}

//<editor-fold desc="inferExprVisitor: Acorn Visitor">
let inferExprVisitor = {
    ArrayExpression:    ret( function( node, scope ) {
                            return arrayLiteralType( node.elements, scope, infer );
                        } ),

    ObjectExpression:   ret( function( node, scope, name ) {
                            let proto = true, waitForProto;

                            for ( let prop of node.properties )
                            {
                                if ( prop.key.name === "__proto__" )
                                {
                                    if ( prop.value.type === "Literal" && prop.value.value === null )
                                        proto = null;
                                    else
                                    {
                                        let protoVal = infer( prop.value, scope ),
                                            known = protoVal.getObjType();

                                        if ( known ) proto = known;
                                        else waitForProto = protoVal;
                                    }
                                }
                            }

                            let obj = node.objType = new Obj( proto, name );

                            if ( waitForProto ) waitForProto.propagate( new FnPrototype.HasProto( obj ) );
                            obj.originNode = node;

                            using.Super( null, waitForProto || proto, function() {
                                for ( let prop of node.properties )
                                {
                                    let key = prop.key;

                                    if ( misc.ignoredProp( prop.key.name ) ) continue;

                                    let name = Constraint.propName( prop, scope ),
                                        target;

                                    if ( name === "<i>" || prop.kind === "set" )
                                        target = misc.ANull;
                                    else
                                    {
                                        // jshint -W120
                                        let val = target = obj.defProp( name, key );

                                        val.initializer = true;
                                        if ( prop.kind === "get" )
                                            target = new is.Callee( obj, [], null, val );
                                    }

                                    infer( prop.value, scope, target, name );

                                    if ( prop.value.type === "FunctionExpression" )
                                        prop.value.scope.fnType.self.addType( obj, WG.SPECULATIVE_THIS );
                                }
                            } );

                            return obj;
                        } ),

    FunctionExpression: ret( function( node, scope, name ) {
                            let inner = node.scope,
                                fn = inner.fnType;

                            if ( name && !fn.name ) fn.name = name;

                            Constraint.connectParams( node, inner );

                            if ( node.expression )
                                infer( node.body, inner, inner.fnType.retval = new AVal() );
                            else
                                walk.recursive( node.body, inner, null, inferWrapper, "Statement" );

                            if ( node.type === "ArrowFunctionExpression" )
                            {
                                getThis( scope ).propagate( fn.self );
                                fn.self = misc.ANull;
                            }

                            // jshint -W030
                            RetVal.maybeTagAsInstantiated( node, fn ) || RetVal.maybeTagAsGeneric( fn );

                            if ( node.id ) inner.getProp( node.id.name ).addType( fn );

                            return fn;
                        } ),

    ClassExpression:    ret( inferClass ),

    SequenceExpression: ret( function( node, scope ) {
                            for ( var i = 0, l = node.expressions.length - 1; i < l; ++i )
                                infer( node.expressions[ i ], scope, misc.ANull );

                            return infer( node.expressions[ l ], scope );
                        } ),

    UnaryExpression:    ret( function( node, scope ) {
                            infer( node.argument, scope, misc.ANull );

                            return Constraint.unopResultType( node.operator );
                        } ),

    UpdateExpression:   ret( function( node, scope ) {
                            infer( node.argument, scope, misc.ANull );
                            return cx.num;
                        } ),

    BinaryExpression:   ret( function( node, scope ) {
                            if ( node.operator === "+" )
                            {
                                let lhs = infer( node.left, scope ),
                                    rhs = infer( node.right, scope );

                                if ( lhs.hasType( cx.str ) || rhs.hasType( cx.str ) ) return cx.str;
                                if ( lhs.hasType( cx.num ) && rhs.hasType( cx.num ) ) return cx.num;

                                let result = new AVal();

                                lhs.propagate( new is.Added( rhs, result ) );
                                rhs.propagate( new is.Added( lhs, result ) );
                                return result;
                            }
                            else
                            {
                                infer( node.left, scope, misc.ANull );
                                infer( node.right, scope, misc.ANull );

                                return Constraint.binopIsBoolean( node.operator ) ? cx.bool : cx.num;
                            }
                        } ),
    AssignmentExpression:
                        ret( function( node, scope, name ) {
                            let rhs, pName;

                            if ( node.left.type === "MemberExpression" )
                            {
                                pName = Constraint.propName( node.left, scope );

                                if ( !name )
                                    name = node.left.object.type === "Identifier" ? node.left.object.name + "." + pName : pName;
                            }
                            else if ( !name && node.left.type === "Identifier" )
                                name = node.left.name;

                            if ( node.operator && node.operator !== "=" && node.operator !== "+=" )
                            {
                                infer( node.right, scope, misc.ANull );
                                rhs = cx.num;
                            }
                            else
                                rhs = infer( node.right, scope, null, name );

                            if ( node.left.type === "MemberExpression" )
                            {
                                let obj = infer( node.left.object, scope );

                                if ( pName === "prototype" ) RetVal.maybeInstantiate( scope, 20 );

                                if ( pName === "<i>" )
                                {
                                    // This is a hack to recognize for/in loops that copy
                                    // properties, and do the copying ourselves, insofar as we
                                    // manage, because such loops tend to be relevant for type
                                    // information.
                                    let v = node.left.property.name,
                                        local = scope.props[ v ],
                                        over = local && local.iteratesOver;

                                    if ( over )
                                    {
                                        RetVal.maybeInstantiate( scope, 20 );

                                        let fromRight = node.right.type === "MemberExpression" && node.right.computed && node.right.property.name === v;

                                        over.forAllProps( function( prop, val, local ) {
                                            if ( local && prop !== "prototype" && prop !== "<i>" )
                                                obj.propagate( new DefProp( prop, fromRight ? val : misc.ANull ) );
                                        } );

                                        return rhs;
                                    }
                                }

                                obj.propagate( new DefProp( pName, rhs, node.left.property ) );

                                maybeAddPhantomObj( obj );
                                if ( node.right.type === "FunctionExpression" )
                                    obj.propagate( node.right.scope.fnType.self, WG.SPECULATIVE_THIS );
                            }
                            else
                                connectPattern( node.left, scope, rhs );

                            return rhs;
                        } ),

    LogicalExpression: fill( function( node, scope, out ) {
                            infer( node.left, scope, out );
                            infer( node.right, scope, out );
                        } ),

    ConditionalExpression:
                        fill( function( node, scope, out ) {
                            infer( node.test, scope, misc.ANull );
                            infer( node.consequent, scope, out );
                            infer( node.alternate, scope, out );
                        } ),

    NewExpression:      fill( function( node, scope, out, name ) {
                            if ( node.callee.type === "Identifier" && node.callee.name in scope.props )
                                RetVal.maybeInstantiate( scope, 20 );

                            for ( var i = 0, args = []; i < node.arguments.length; ++i )
                                args.push( infer( node.arguments[ i ], scope ) );

                            let callee = infer( node.callee, scope ),
                                self = new AVal();

                            callee.propagate( new is.Ctor( self, name && /\.prototype$/.test( name ) ) );
                            self.propagate( out, WG.NEW_INSTANCE );
                            callee.propagate( new is.Callee( self, args, node.arguments, new FnPrototype.IfObj( out ) ) );
                        } ),

    CallExpression:     fill( function( node, scope, out ) {
                            for ( var i = 0, args = []; i < node.arguments.length; ++i )
                                args.push( infer( node.arguments[ i ], scope ) );

                            let outerFn = Scope.functionScope( scope ).fnType;

                            if ( node.callee.type === "MemberExpression" )
                            {
                                let self = infer( node.callee.object, scope ),
                                    pName = Constraint.propName( node.callee, scope );

                                if ( outerFn && ( pName === "call" || pName === "apply" ) && outerFn.args.indexOf( self ) > -1 )
                                    RetVal.maybeInstantiate( scope, 30 );

                                self.propagate( new is.MethodCall( pName, args, node.arguments, out ) );
                            }
                            else if ( node.callee.type === "Super" && cx.curSuperCtor )
                                cx.curSuperCtor.propagate( new is.Callee( getThis( scope ), args, node.arguments, out ) );
                            else
                            {
                                let callee = infer( node.callee, scope );

                                if ( outerFn && outerFn.args.indexOf( callee ) > -1 )
                                    RetVal.maybeInstantiate( scope, 30 );

                                let knownFn = callee.getFunctionType();

                                if ( knownFn && knownFn.instantiateScore && outerFn )
                                    RetVal.maybeInstantiate( scope, knownFn.instantiateScore / 5 );

                                callee.propagate( new is.Callee( cx.topScope, args, node.arguments, out ) );
                            }
                        } ),

    MemberExpression:   fill( function( node, scope, out ) {
                            let name = Constraint.propName( node ),
                                wg;

                            if ( name === "<i>" )
                            {
                                let propType = infer( node.property, scope ),
                                    symName = Constraint.symbolName( propType );

                                if ( symName )
                                    name = node.propName = symName;
                                else if ( !propType.hasType( cx.num ) )
                                    wg = WG.MULTI_MEMBER;
                            }

                            infer( node.object, scope ).getProp( name ).propagate( out, wg );
                        } ),

    Identifier:         ret( function( node, scope ) {
                            if ( node.name === "arguments" )
                            {
                                let fnScope = Scope.functionScope( scope );

                                if ( fnScope.fnType && !( node.name in fnScope.props ) )
                                {
                                    //noinspection JSAnnotator
                                    scope.defProp( node.name, fnScope.fnType.originNode ).addType( new Arr( fnScope.fnType.arguments = new AVal() ) );
                                }
                            }

                            return scope.getProp( node.name );
                        } ),

    ThisExpression:     ret( function( _node, scope ) {
                            return getThis( scope );
                        } ),

    Super:              ret( function( node ) {
                            return (  node.superType = cx.curSuper || misc.ANull );
                        } ),

    Literal:            ret( function( node ) {
                            return Constraint.literalType( node );
                        } ),

    TemplateLiteral:    ret( function( node, scope ) {
                            for ( let n of node.expressions )
                                infer( n, scope, misc.ANull );

                            return cx.str;
                        } ),

    TaggedTemplateExpression:
                        fill( function( node, scope, out ) {
                            let args = [ new Arr( cx.str ) ];

                            for ( let expr of node.quasi.expressions ) //var i = 0; i < node.quasi.expressions.length; ++i )
                                args.push( infer( expr, scope ) );

                            infer( node.tag, scope, new is.Callee( cx.topScope, args, node.quasi.expressions, out ) );
                        } ),

    YieldExpression:    ret( function( node, scope ) {
                            let output = misc.ANull,
                                fn = Scope.functionScope( scope ).fnType;

                            if ( fn )
                            {
                                if ( fn.retval === misc.ANull ) fn.retval = new AVal();
                                if ( !fn.yieldval ) fn.yieldval = new AVal();
                                output = fn.retval;
                            }

                            if ( node.argument )
                            {
                                if ( node.delegate )
                                {
                                    infer( node.argument, scope, new is.MethodCall( "next", [], null,
                                        new GetProp( "value", output ) ) );
                                }
                                else
                                    infer( node.argument, scope, output );
                            }

                            return fn ? fn.yieldval : misc.ANull;
                        } )
};

inferExprVisitor.ArrowFunctionExpression = inferExprVisitor.FunctionExpression;
//</editor-fold>

function infer( node, scope, out, name )
{
    let handler = inferExprVisitor[ node.type ];

    return handler ? handler( node, scope, out, name ) : misc.ANull;
}

function loopPattern( init )
{
    return init.type === "VariableDeclaration" ? init.declarations[ 0 ].id : init;
}

//<editor-fold desc="inferWrapper: Acorn Visitor">
inferWrapper = walk.make( {
     Expression:            function( node, scope )
                            {
                                infer( node, node.scope || scope, misc.ANull );
                            },

     FunctionDeclaration:   function( node, scope, c )
                            {
                                 let inner = node.scope,
                                     fn = inner.fnType;

                                 Constraint.connectParams( node, inner );
                                 c( node.body, inner, "Statement" );
                                 // jshint -W030
                                 RetVal.maybeTagAsInstantiated( node, fn ) || RetVal.maybeTagAsGeneric( fn );
                                 scope.getProp( node.id.name ).addType( fn );
                            },

     Statement:             function( node, scope, c )
                            {
                                c( node, node.scope || scope );
                            },

     VariableDeclaration:   function( node, scope )
                            {
                                for ( var i = 0; i < node.declarations.length; ++i )
                                {
                                    let decl = node.declarations[ i ];

                                    if ( decl.id.type === "Identifier" )
                                    {
                                        let prop = scope.getProp( decl.id.name );

                                        if ( decl.init )
                                            infer( decl.init, scope, prop, decl.id.name );
                                    }
                                    else if ( decl.init )
                                        connectPattern( decl.id, scope, infer( decl.init, scope ) );
                                }
                            },

     ClassDeclaration:      function( node, scope ) {
                                scope.getProp( node.id.name ).addType( inferClass( node, scope, node.id.name ) );
                            },

     ReturnStatement:       function( node, scope )
                            {
                                if ( !node.argument ) return;

                                let output = misc.ANull,
                                    fn = Scope.functionScope( scope ).fnType;

                                if ( fn )
                                {
                                    if ( fn.retval === misc.ANull ) fn.retval = new AVal();
                                    output = fn.retval;
                                }

                                infer( node.argument, scope, output );
                            },

     ForInStatement:        function( node, scope, c )
                            {
                                let source = infer( node.right, scope );

                                if ( ( node.right.type === "Identifier" && node.right.name in scope.props ) ||
                                     ( node.right.type === "MemberExpression" && node.right.property.name === "prototype" ) )
                                {
                                    RetVal.maybeInstantiate( scope, 5 );

                                    let pattern = loopPattern( node.left );

                                    if ( pattern.type === "Identifier" )
                                    {
                                        if ( pattern.name in scope.props )
                                            scope.getProp( pattern.name ).iteratesOver = source;

                                        source.getProp( "<i>" ).propagate( Constraint.ensureVar( pattern, scope ) );
                                    }
                                    else
                                        connectPattern( pattern, scope, source.getProp( "<i>" ) );
                                }

                                c( node.body, scope, "Statement" );
                            },

     ForOfStatement:        function( node, scope, c )
                            {
                                let pattern = loopPattern( node.left ),
                                    target;

                                if ( pattern.type === "Identifier" )
                                    target = Constraint.ensureVar( pattern, scope );
                                else
                                    connectPattern( pattern, scope, target = new AVal() );

                                infer( node.right, scope, new is.MethodCall( ":Symbol.iterator", [], null,
                                    new is.MethodCall( "next", [], null,
                                        new GetProp( "value", target ) ) ) );

                                c( node.body, scope, "Statement" );
                            }
 } );
//</editor-fold>

module.exports.connectPattern = connectPattern;
module.exports.inferPatternVisitor = inferPatternVisitor;
module.exports.inferExprVisitor = inferExprVisitor;
module.exports.inferWrapper = inferWrapper;
