/** ****************************************************************************************************
 * File: signal (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    cx = require( './context' ).cx;

class Signal
{
    constructor()
    {
        this._handlers = Object.create( null );
        this.origin = cx.curOrigin;
    }

    on( type, f )
    {
        ( this._handlers[ type ] || ( this._handlers[ type ] = [] ) ).push( f );
    }

    off( type, f )
    {
        let arr = this._handlers[ type ];

        if ( arr )
        {
            for ( let i = 0; i < arr.length; ++i )
            {
                if ( arr[ i ] === f )
                {
                    arr.splice( i, 1 );
                    break;
                }
            }
        }
    }

    getHandlers( emitter, type )
    {
        let arr = emitter._handlers && emitter._handlers[ type ];

        return arr && arr.length ? arr.slice() : [];
    }

    signal( type, a1, a2, a3, a4 )
    {
        let arr = this.getHandlers( this, type );

        for ( let a of arr )
            a.call( this, a1, a2, a3, a4 );
    }

    signalReturnFirst( type, a1, a2, a3, a4 )
    {
        let arr = this.getHandlers( this, type );

        for ( let a of arr )
        {
            let result = a.call( this, a1, a2, a3, a4 );
            if ( result ) return result;
        }
    }

    hasHandler( type )
    {
        let arr = this._handlers && this._handlers[ type ];

        return arr && arr.length > 0 && arr;
    }
}

module.exports = Signal;
