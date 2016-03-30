/** ****************************************************************************************************
 * File: type (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    ANull = require( './anull' );

class Type extends  ANull
{
    constructor()
    {
        super();
    }

    propagate( c, w )
    {
        c.addType( this, w );
    }

    hasType( other )
    {
        return other === this;
    }

    isEmpty()
    {
        return false;
    }

    typeHint()
    {
        return this;
    }

    getType()
    {
        return this;
    }
}

module.exports = Type;
