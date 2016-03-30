/** ****************************************************************************************************
 * File: arr (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    cx = require( './context' ).cx,
    misc = require( './misc' ),
    Obj = require( './obj' );

class Arr extends Obj
{
    constructor( contentType )
    {
        super( cx.protos.Array );

        let content = this.defProp( "<i>" );

        if ( Array.isArray( contentType ) )
        {
            this.tuple = contentType.length;

            for ( let i = 0; i < contentType.length; i++ )
            {
                let prop = this.defProp( String( i ) );

                contentType[ i ].propagate( prop );

                prop.propagate( content );
            }
        }
        else if ( contentType )
        {
            this.tuple = 0;
            contentType.propagate( content );
        }
    }

    toString( maxDepth )
    {
        if ( maxDepth === null ) maxDepth = 0;
        if ( maxDepth <= -3 ) return "[?]";

        let content = "";

        if ( this.tuple )
        {
            let similar;

            for ( let i = 0; i in this.props; i++ )
            {
                let type = misc.toString( this.getProp( String( i ) ), maxDepth - 1, this );

                if ( similar === null )
                    similar = type;
                else if ( similar !== type )
                    similar = false;
                else
                    similar = type;

                content += ( content ? ", " : "" ) + type;
            }

            if ( similar ) content = similar;
        }
        else
            content = misc.toString( this.getProp( "<i>" ), maxDepth - 1, this );

        return "[" + content + "]";
    }

    normalizeIntegerProp( prop )
    {
        if ( +prop < this.tuple ) return prop;
        else return "<i>";
    }

}

module.exports = Arr;
