/** ****************************************************************************************************
 * File: scope-collection (tern)
 * @author julian on 3/31/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';

const
    cx = require( './context' ).cx,
    misc = require( './misc' ),
    walk = require( 'acorn/dist/walk' ),
    Scope = require( './scope' ),
    Fn = require( './fn' ),
    AVal = require( './aval' );

class ScopeCollection
{
    static addVar( scope, nameNode )
    {
        return scope.defProp( nameNode.name, nameNode );
    }

    static patternName( node )
    {
        switch ( node.type )
        {
            case "Identifier":          return node.name;

            case "AssignmentPattern":   return ScopeCollection.patternName( node.left );

            case "ObjectPattern":       return "{" + node.properties.map( function ( e ) { return ScopeCollection.patternName( e.value ); } ).join( ", " ) + "}";

            case "ArrayPattern":        return "[" + node.elements.map( ScopeCollection.patternName ).join( ", " ) + "]";

            case "RestElement":         return "..." + ScopeCollection.patternName( node.argument );
        }

        return "_";
    }

    static isBlockScopedDecl( node )
    {
        return node.type === "VariableDeclaration" && node.kind !== "var" ||
               node.type === "FunctionDeclaration" ||
               node.type === "ClassDeclaration";
    }

    static patternScopes( inner, outer )
    {
        return { inner: inner, outer: outer || inner };
    }

    static gatherScope()
    {
        ScopeCollection.scopeGatherer = walk.make( {
                       VariablePattern: function ( node, scopes )
                       {
                           if ( scopes.inner ) ScopeCollection.addVar( scopes.inner, node );
                       },

                       AssignmentPattern: function ( node, scopes, c )
                       {
                           c( node.left, scopes, "Pattern" );
                           c( node.right, scopes.outer, "Expression" );
                       },

                       AssignmentExpression: function ( node, scope, c )
                       {
                           if ( node.left.type === "MemberExpression" )
                               c( node.left, scope, "Expression" );
                           else
                               c( node.left, ScopeCollection.patternScopes( false, scope ), "Pattern" );

                           c( node.right, scope, "Expression" );
                       },

                       Function: function ( node, scope, c )
                       {
                           if ( scope.inner ) throw new Error( "problem at " + node.start + " " + node.type );

                           let inner = node.scope = new Scope( scope, node ),
                               argVals = [], argNames = [];

                           for ( let param of node.params )
                           {
                               argNames.push( ScopeCollection.patternName( param ) );

                               if ( param.type === "Identifier" )
                                   argVals.push( ScopeCollection.addVar( inner, param ) );
                               else
                               {
                                   let arg = new AVal();

                                   argVals.push( arg );
                                   arg.originNode = param;
                                   c( param, ScopeCollection.patternScopes( inner ), "Pattern" );
                               }
                           }

                           inner.fnType = new Fn( node.id && node.id.name, new AVal(), argVals, argNames, misc.ANull, node.generator );
                           inner.fnType.originNode = node;

                           if ( node.id )
                           {
                               let decl = node.type === "FunctionDeclaration";

                               ScopeCollection.addVar( decl ? scope : inner, node.id );
                           }

                           c( node.body, inner, node.expression ? "Expression" : "Statement" );
                       },

                       BlockStatement: function ( node, scope, c )
                       {
                           if ( !node.scope && node.body.some( ScopeCollection.isBlockScopedDecl ) )
                               scope = node.scope = new Scope( scope, node, true );

                           walk.base.BlockStatement( node, scope, c );
                       },

                       TryStatement: function ( node, scope, c )
                       {
                           c( node.block, scope, "Statement" );

                           if ( node.handler )
                           {
                               if ( node.handler.param.type === "Identifier" )
                               {
                                   let v = ScopeCollection.addVar( scope, node.handler.param );

                                   c( node.handler.body, scope, "Statement" );

                                   let e5 = cx.definitions.ecma5;

                                   if ( e5 && v.isEmpty() ) misc.getInstance( e5[ "Error.prototype" ] ).propagate( v, misc.WG.CATCH_ERROR );
                               }
                               else
                                   c( node.handler.param, ScopeCollection.patternScopes( scope ), "Pattern" );
                           }

                           if ( node.finalizer ) c( node.finalizer, scope, "Statement" );
                       },

                       VariableDeclaration: function ( node, scope, c )
                       {
                           let targetScope = node.kind === "var" ? Scope.functionScope( scope ) : scope;

                           for ( let decl of node.declarations )
                           {
                               c( decl.id, ScopeCollection.patternScopes( targetScope, scope ), "Pattern" );
                               if ( decl.init ) c( decl.init, scope, "Expression" );
                           }
                       },

                       ClassDeclaration: function ( node, scope, c )
                       {
                           ScopeCollection.addVar( scope, node.id );

                           if ( node.superClass ) c( node.superClass, scope, "Expression" );

                           for ( let body of node.body.body )
                               c( body, scope );
                       },

                       ForInStatement: function ( node, scope, c )
                       {
                           if ( !node.scope && ScopeCollection.isBlockScopedDecl( node.left ) )
                               scope = node.scope = new Scope( scope, node, true );

                           walk.base.ForInStatement( node, scope, c );
                       },

                       ForStatement: function ( node, scope, c )
                       {
                           if ( !node.scope && node.init && ScopeCollection.isBlockScopedDecl( node.init ) )
                               scope = node.scope = new Scope( scope, node, true );

                           walk.base.ForStatement( node, scope, c );
                       },

                       ImportDeclaration: function ( node, scope )
                       {
                           for ( let n of node.specifiers )
                               ScopeCollection.addVar( scope, n.local );
                       }
                   } );

        ScopeCollection.scopeGatherer.ForOfStatement = ScopeCollection.scopeGatherer.ForInStatement;
    }
}

ScopeCollection.gatherScope();

module.exports = ScopeCollection;
