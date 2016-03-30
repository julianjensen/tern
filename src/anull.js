/** ****************************************************************************************************
 * File: anull (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    Signal = require( './signal' );

let instance;

class ANull extends Signal
{
    constructor()
    {
        super();
    }

    addType() {}
    propagate() {}

    getProp()
    {
        return instance;
    }

    forAllProps()
    {

    }

    hasType()
    {
        return false;
    }

    isEmpty()
    {
        return true;
    }

    getFunctionType() {}
    getObjType() {}
    getSymbolType() {}
    getType() {}
    gatherProperties() {}
    propagatesTo() {}
    typeHint() {}
    propHint() {}
    toString() { return "?"; }
}

module.exports = ANull;
