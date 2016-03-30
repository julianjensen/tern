/** ****************************************************************************************************
 * File: with (tern)
 * @author julian on 3/30/16
 * @version 1.0.0
 * @copyright Planet3, Inc.
 * $Id$
 *******************************************************************************************************/
'use strict';
//@formatter:off

const
    BASE_MAX_WORK_DEPTH = 20,
    REDUCE_MAX_WORK_DEPTH = 0.0001;

let Context = require( './context' ),
    cx = Context.cx,
    timeout;

module.exports.Context = Context.using;

module.exports.TimedOut = function() {
    this.message = "Timed out";
    this.stack = ( new Error() ).stack;
};

module.exports.TimedOut.prototype = Object.create( Error.prototype );
module.exports.TimedOut.prototype.name = "infer.TimedOut";

module.exports.Timeout = function( ms, f ) {
    let end = +new Date() + ms,
            oldEnd = timeout;

    if ( oldEnd && oldEnd < end ) return f();
    timeout = end;

    try
    {
        return f();
    }
    finally
    {
        timeout = oldEnd;
    }
};

module.exports.addOrigin = function( origin ) {
    if ( cx.origins.indexOf( origin ) < 0 ) cx.origins.push( origin );
};



module.exports.Worklist = function( f ) {

    if ( cx.workList ) return f( cx.workList );

    let list = [],
        depth = 0,
        add = cx.workList = function( type, target, weight ) {
            if ( depth < BASE_MAX_WORK_DEPTH - REDUCE_MAX_WORK_DEPTH * list.length )
                list.push( type, target, weight, depth );
        },
        ret = f( add );

    for ( let i = 0; i < list.length; i += 4 )
    {
        if ( timeout && +new Date() >= timeout )
            throw new exports.TimedOut();

        depth = list[ i + 3 ] + 1;
        list[ i + 1 ].addType( list[ i ], list[ i + 2 ] );
    }

    cx.workList = null;
    return ret;
};

module.exports.Super = function( ctor, obj, f ) {
    let oldCtor = cx.curSuperCtor,
        oldObj = cx.curSuper;

    cx.curSuperCtor = ctor;
    cx.curSuper = obj;

    let result = f();

    cx.curSuperCtor = oldCtor;
    cx.curSuper = oldObj;
    return result;
};

module.exports.DisabledComputing = function( fn, body ) {
    cx.disabledComputing = { fn: fn, prev: cx.disabledComputing };

    let result = body();

    cx.disabledComputing = cx.disabledComputing.prev;
    return result;
};

