/** ****************************************************************************************************
 * File: for-all-props (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    ANull = require( '../anull' ),
    Obj = require( '../obj' );

class ForAllProps extends ANull
{
    constructor( c )
    {
        super();
        
        this.c = c;
    }

    addType( type )
    {
        if ( !( type instanceof Obj ) ) return;

        type.forAllProps( this.c );
    }
}

module.exports = ForAllProps;
