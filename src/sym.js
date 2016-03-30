/** ****************************************************************************************************
 * File: sym (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    cx = require( './context' ).cx,
    Prim = require( './prim' );

class Sym extends Prim
{
    constructor( name, originNode )
    {
        super( cx.protos.Symbol, "Symbol" );

        this.symName = name;
        this.originNode = originNode;
    }

    asPropName()
    {
        return ":" + this.symName;
    }

    getSymbolType()
    {
        return this;
    }
}

module.exports = Sym;
