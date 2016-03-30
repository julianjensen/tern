/** ****************************************************************************************************
 * File: scope (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    Obj = require( './obj' );


class Scope extends Obj
{
    constructor( prev, originNode, isBlock )
    {
        super( prev || true );
        this.prev = prev;
        this.originNode = originNode;
        this.isBlock = !!isBlock;
    }

    defVar( name, originNode )
    {
        for ( let _this = this;; _this = _this.proto )
        {
            let found = _this.props[ name ];

            if ( found ) return found;
            if ( !_this.prev ) return _this.defProp( name, originNode );
        }
    }

    static functionScope( scope ) {
        while ( scope.isBlock ) scope = scope.prev;

        return scope;
    }
}

module.exports = Scope;
