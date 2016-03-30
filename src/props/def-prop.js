/** ****************************************************************************************************
 * File: def-prop (tern)
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

class DefProp extends ANull
{
    constructor( prop, type, originNode )
    {
        super();
        
        this.prop = prop;
        this.type = type;
        this.originNode = originNode;
    }

    addType( type, weight )
    {
        if ( !( type instanceof Obj ) ) return;

        let prop = type.defProp( this.prop, this.originNode );

        if ( !prop.origin ) prop.origin = this.origin;
        this.type.propagate( prop, weight );
    }

    propHint()
    {
        return this.prop;
    }
}

module.exports = DefProp;
