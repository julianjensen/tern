/** ****************************************************************************************************
 * File: state (tern)
 * @author julian on 3/31/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    cx = require( '../context' ).cx;

class State
{
    constructor( origins, name, options )
    {
        this.origins = origins;
        this.cx = cx;
        this.server = options.server || this.cx.parent || { signal: function() {} };
        this.maxOrigin = -Infinity;
        for ( let org of origins )
          this.maxOrigin = Math.max( this.maxOrigin, this.cx.origins.indexOf( org ) );
        this.output = { "!name": name, "!define": {} };
        this.options = options;
        this.types = Object.create( null );
        this.altPaths = Object.create( null );
        this.patchUp = [];
        this.roots = Object.create( null );
    }

    isTarget( origin )
    {
        return this.origins.indexOf( origin ) > -1;
    }

    getSpan( node )
    {
        if ( this.options.spans == false || !this.isTarget( node.origin ) ) return null;
        if ( node.span ) return node.span;

        let srv = this.cx.parent,
            file;

        if ( !srv || !node.originNode || !( file = srv.findFile( node.origin ) ) ) return null;

        let start = node.originNode.start,
            end = node.originNode.end,
            pStart = file.asLineChar( start ),
            pEnd = file.asLineChar( end );

        return `${start}[${pStart.line}:${pStart.ch}]-${end}[${pEnd.line}:${pEnd.ch}]`;
    }
}

module.exports = State;
