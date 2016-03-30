/** ****************************************************************************************************
 * File: get-prop (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    ANull = require( '../anull' );

class GetProp extends ANull
{
    constructor( prop, target )
    {
        super();
        
        this.prop = prop;
        this.target = target;
    }

    addType( type, weight )
    {
        if ( type.getProp )
            type.getProp( this.prop ).propagate( this.target, weight );
    }

    propHint()
    {
        return this.prop;
    }

    propagatesTo()
    {
        if ( this.prop === "<i>" || !/[^\w_]/.test( this.prop ) )
            return { target: this.target, pathExt: "." + this.prop };
    }
}

module.exports = GetProp;
