/** ****************************************************************************************************
 * File: muffle (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    ANull = require( './anull' );

class Muffle extends ANull
{
    constructor( inner, weight )
    {
        this.inner = inner;
        this.weight = weight;
    }

    addType( tp, weight )
    {
        this.inner.addType( tp, Math.min( weight, this.weight ) );
    }

    propagatesTo()
    {
        return this.inner.propagatesTo();
    }

    typeHint()
    {
        return this.inner.typeHint();
    }

    propHint()
    {
        return this.inner.propHint();
    }
}

module.exports = Muffle;
