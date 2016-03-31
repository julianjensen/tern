/** ****************************************************************************************************
 * File: constraint (tern)
 * @author julian on 3/31/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';

    // CONSTRAINT GATHERING PASS

const
    cx = require( './context' ).cx,
    misc = require( './misc' ),
    AVal = require( './aval' ),
    infer = require( './infer' );

class Constraint
{
    static propName( node, inferInScope )
    {
        let key = node.property || node.key;

        if ( !node.computed && key.type === "Identifier" ) return key.name;

        if ( key.type === "Literal" )
        {
            if ( typeof key.value === "string" ) return key.value;
            if ( typeof key.value === "number" ) return String( key.value );
        }

        if ( inferInScope )
        {
            let symName =  Constraint.symbolName( infer( key, inferInScope ) );

            if ( symName ) return ( node.propName = symName );
        }
        else if ( node.propName )
            return node.propName;

        return "<i>";
    }

    static symbolName( val )
    {
        let sym = val.getSymbolType();

        if ( sym ) return sym.asPropName();
    }

    static unopResultType( op )
    {
        switch ( op )
        {
            case "+":
            case "-":
            case "~":       return cx.num;

            case "!":       return cx.bool;

            case "typeof":  return cx.str;

            case "void":
            case "delete":  return misc.ANull;
        }
    }

    static binopIsBoolean( op )
    {
        switch ( op )
        {
            case "==":
            case "!=":
            case "===":
            case "!==":
            case "<":
            case ">":
            case ">=":
            case "<=":
            case "in":
            case "instanceof":  return true;
        }
    }

    static literalType( node )
    {
        if ( node.regex ) return misc.getInstance( cx.protos.RegExp );

        switch ( typeof node.value )
        {
            case "boolean":     return cx.bool;
            case "number":      return cx.num;
            case "string":      return cx.str;
            case "object":
            case "function":    if ( !node.value ) return misc.ANull;
                                return misc.getInstance( cx.protos.RegExp );
        }
    }

    static join( a, b )
    {
        if ( a === b || b === misc.ANull ) return a;

        if ( a === misc.ANull ) return b;

        let joined = new AVal();

        a.propagate( joined );
        b.propagate( joined );
        return joined;
    }

    static connectParams( node, scope )
    {
        for ( let i = 0; i < node.params.length; i++ )
        {
            let param = node.params[ i ];

            if ( param.type === "Identifier" ) continue;

            infer.connectPattern( param, scope, node.scope.fnType.args[ i ] );
        }
    }
    static ensureVar( node, scope )
    {
        return scope.hasProp( node.name ) || cx.topScope.defProp( node.name, node );
    }

}



