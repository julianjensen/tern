/** ****************************************************************************************************
 * File: retval (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    walk = require( 'acorn/dist/walk' ),
    cx = require( './context' ).cx,
    AVal = require( './aval' ),
    using = require( './with' ),
    Scope = require( './scope' ),
    Arr = require( './arr' ),
    Fn = require( './fn' ),
    misc = require( './misc' ),
    ANull = misc.ANull;

let NotSmaller = {};

function maybeInstantiate( scope, score )
{
    let fn = Scope.functionScope( scope ).fnType;

    if ( fn ) fn.instantiateScore = ( fn.instantiateScore || 0 ) + score;
}

function nodeSmallerThan( node, n )
{
    try
    {
        walk.simple( node, { Expression: function() { if ( --n <= 0 ) throw NotSmaller; } } );
        return true;
    }
    catch ( e )
    {
        if ( e === NotSmaller ) return false;
        throw e;
    }
}

function maybeTagAsInstantiated( node, fn )
{
    let score = fn.instantiateScore;

    if ( !cx.disabledComputing && score && fn.args.length && nodeSmallerThan( node, score * 5 ) )
    {
        maybeInstantiate( Scope.functionScope( fn.originNode.scope.prev ), score / 2 );
        setFunctionInstantiated( node, fn );
        return true;
    }
    else
        fn.instantiateScore = null;
}

function setFunctionInstantiated( node, fn )
{
    // Disconnect the arg avals, so that we can add info to them without side effects
    for ( var i = 0; i < fn.args.length; ++i ) fn.args[ i ] = new AVal();

    fn.self = new AVal();

    fn.computeRet = function( self, args ) {
        // Prevent recursion
        return using.DisabledComputing( fn, function() {
            let oldOrigin = cx.curOrigin;

            cx.curOrigin = fn.origin;
            let scope = node.scop,
                scopeCopy = new Scope( scope.prev, scope.originNode );

            for ( let v in scope.props )
            {
                let local = scopeCopy.defProp( v, scope.props[ v ].originNode );

                for ( let i = 0; i < args.length; ++i )
                    if ( fn.argNames[ i ] === v && i < args.length )
                        args[ i ].propagate( local );
            }

            let argNames = fn.argNames.length !== args.length ? fn.argNames.slice( 0, args.length ) : fn.argNames;

            while ( argNames.length < args.length ) argNames.push( "?" );

            scopeCopy.fnType = new Fn( fn.name, self, args, argNames, ANull, fn.generator );
            scopeCopy.fnType.originNode = fn.originNode;

            if ( fn.arguments )
            {
                //noinspection JSAnnotator
                let argset = scopeCopy.fnType.arguments = new AVal();

                scopeCopy.defProp( "arguments" ).addType( new Arr( argset ) );

                for ( var i = 0; i < args.length; ++i ) args[ i ].propagate( argset );
            }

            node.scope = scopeCopy;
            walk.recursive( node.body, scopeCopy, null, scopeGatherer );
            walk.recursive( node.body, scopeCopy, null, inferWrapper );
            cx.curOrigin = oldOrigin;
            return scopeCopy.fnType.retval;
        } );
    };
}

function maybeTagAsGeneric( fn )
{
    let target = fn.retval;

    if ( target === ANull ) return;

    let targetInner, asArray;

    if ( !target.isEmpty() && ( targetInner = target.getType() ) instanceof Arr )
        target = asArray = targetInner.getProp( "<i>" );

    function explore( aval, path, depth )
    {
        if ( depth > 3 || !aval.forward ) return;

        for ( let i = 0; i < aval.forward.length; ++i )
        {
            let prop = aval.forward[ i ].propagatesTo();

            if ( !prop ) continue;

            let newPath = path, dest;

            if ( prop instanceof AVal )
                dest = prop;
            else if ( prop.target instanceof AVal )
            {
                newPath += prop.pathExt;
                dest = prop.target;
            }
            else continue;

            if ( dest === target ) return newPath;

            let found = explore( dest, newPath, depth + 1 );

            if ( found ) return found;
        }
    }

    let foundPath = explore( fn.self, "!this", 0 );

    for ( let i = 0; !foundPath && i < fn.args.length; ++i )
        foundPath = explore( fn.args[ i ], "!" + i, 0 );

    if ( foundPath )
    {
        if ( asArray ) foundPath = "[" + foundPath + "]";

        let p = new TypeParser( foundPath ),
            parsed = p.parseType( true );

        fn.computeRet = parsed.apply ? parsed : function() { return parsed; };
        fn.computeRetSource = foundPath;
        return true;
    }
}

module.exports = {
    maybeInstantiate,
    nodeSmallerThan,
    maybeTagAsInstantiated,
    setFunctionInstantiated,
    maybeTagAsGeneric
};
