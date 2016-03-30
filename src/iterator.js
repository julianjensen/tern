/** ****************************************************************************************************
 * File: iterator (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    ANull = require( './anull' ),
    cx = require( './context' ).cx,
    Obj = require( './obj' ),
    Fn = require( './fn' );

let generatorResult = function( input, output ) {
        let retObj = new Obj( true );

        retObj.defProp( "done" ).addType( cx.bool );

        output.propagate( retObj.defProp( "value" ) );

        let method = new Fn( null, ANull, input ? [ input ] : [], input ? [ "?" ] : [], retObj ),
            result = new Obj( cx.definitions.ecma6 && cx.definitions.ecma6.generator_prototype || true );

        result.defProp( "next" ).addType( method );
        return result;
    };

module.exports.maybeIterator = function( fn, output ){
    if ( !fn.generator ) return output;

    if ( !fn.computeRet )
    { // Reuse iterator objects for non-computed return types
        if ( fn.generator === true ) fn.generator = generatorResult( fn.yieldval, output );

        return fn.generator;
    }

    return generatorResult( fn.yieldval, output );
};

module.exports.generatorResult = generatorResult;
