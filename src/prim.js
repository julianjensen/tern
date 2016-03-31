/** ****************************************************************************************************
 * File: prim (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    ANull = require( './anull' ),
    Type = require( './type' );

class Prim extends Type
{
    constructor( proto, name )
    {
        super();
        this.name = name;
        this.proto = proto;
    }

    toString()
    {
        return this.name;
    }

    getProp( prop )
    {
        return this.proto.hasProp( prop ) || ANull;
    }

    gatherProperties( f, depth )
    {
        if ( this.proto ) this.proto.gatherProperties( f, depth );
    }

    reached()
    {
        return true;
    }
}

module.exports = Prim;
