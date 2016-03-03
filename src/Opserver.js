/**
 * @module module:opserver
 */

/**
 * Fastest Node EventEmitter
 * @type {EventEmitter}
 */
const EventEmitter3 = require('eventemitter3');

/**
 * The best Promise library for Node
 * @type {function|bluebird}
 */
const Promise = require('bluebird');

/**
 * Lodash function to lookup nested object properties by string path
 * @type {function}
 */
const get = require('lodash.get');

/**
 * Lodash function to check if an object is a POJO (Plain-old Javascript Object)
 * @type {function}
 */
const isPlainObject = require('lodash.isplainobject');


/**
 * @class Opserver
 * @extends EventEmitter3
 * @classdesc Inherits from the node
 * {@link https://github.com/primus/eventemitter3|EventEmitter} class.  This is a faster version of the native Node
 * EventEmitter, with some methods and events removed.  Please look at the EventEmitter3 documents for differences
 * between it and the native Node implementation.  This is an event aggregator for the MongoDB operation log that allows
 * you to listen to certain MongoDB transactions.
 * @memberof module:opserver
 */
class Opserver extends EventEmitter3 {

    constructor(oplog, connectionsMap, excludes, Logger) {
        super();

        /**
         * An event emitter that emits mongo oplog transactions
         * @type {EventEmitter}
         */
        this.oplog = oplog;

        /**
         * Holds the excluded paths for the different MongoDB operations -- passed by user so still a POJO and not a Map
         * @readonly
         * @const{object}
         */
        this.excludes = Object.assign({ insertPaths: [], deletePaths: [], updatePaths: [] }, excludes);

        /**
         * The logging functions for the different MongoDB operations
         * @readonly
         * @const {object}
         */
        this.Logger = Object.assign({}, Logger);

        /**
         * A map of MongoDB connections
         * @readonly
         * @const {Map}
         */
        this.connectionsMap = new Map(connectionsMap);

        /**
         * Mapping of Mongo oplog op types to full operation names
         * @readonly
         * @const {{i: string, d: string, u: string}}
         * @enum {string}
         */
        this.opToNameEnum = {
            i: 'insert',
            d: 'delete',
            u: 'update'
        };

        // Setup Oplog event listeners
        this.oplog.on('insert', this.emitOpserverEvent.bind(this));
        this.oplog.on('update', this.emitOpserverEvent.bind(this));
        this.oplog.on('delete', this.emitOpserverEvent.bind(this));
        this.oplog.on('end', () => this.Logger.error('Mongo-oplog stream ended.'));
        this.oplog.on('error', (error) => this.Logger.error(error));
    }

    //============================================================
    //
    //               EVENT TYPES
    //
    //============================================================

    /**
     * Insert event.  Listen on 'insert:DATABASE' to get insert events for that database.
     * @example 'insert:mydb.users'
     * @event Opserver#insert:DATABASE
     * @type {OpserverEventData}
     */

    /**
     * Delete event.  Listen on 'delete:DATABASE' to get delete events for that database.
     * @example 'delete:mydb.users'
     * @event Opserver#delete:DATABASE
     * @type {OpserverEventData}
     */

    /**
     * Update event.  Listen on 'update:DATABASE.PROPERTY_PATH' to get update events for that database.
     * @example 'update:mydb.users.preferences.timezone'
     * @event Opserver#update:DATABASE.PROPERTY_PATH
     * @type {OpserverEventData}
     */

    //============================================================
    //
    //               OPSERVER LISTENER METHODS
    //
    //============================================================

    /**
     * Listen to multiple event strings with a single callback
     * @method onAny
     * @memberof module:opserver#Opserver
     * @param {string[]} eventStrings
     * @param {function} listener
     * @returns {function} Calling the returned function will remove all the listeners that were setup by .onAny
     */
    onAny(eventStrings, listener) {

        /**
         * Hold the event listeners
         * @type {Map}
         */
        let eventListeners = new Map();

        // Setup a bunch of event listeners on the event strings that were passed in
        for (let eventName of eventStrings) {

            const boundListener = listener.bind(this, eventName);
            eventListeners.set(eventName, boundListener);

            this.on(eventName, boundListener);
        }

        // Return a function that removes all the listeners
        return () => eventStrings.forEach(event => this.removeListener(event, eventListeners.get(event)));
    }

    /**
     * Wait for an opserver event to match certain values one time
     * @method onceMatched
     * @memberof module:opserver#Opserver
     * @param {string} eventString - Opserver event
     * @param {object} valuesToMatch - Object with keys and values to match
     * @param {callback} [cb]
     * @returns {Promise.<object>} - Resolves with the event data
     */
    onceMatched(eventString, valuesToMatch, cb) {
        return new Promise((resolve, reject) => {

            /**
             * Event listener that checks event data for matches against the given key, value pairs
             * @param {object} eventData - Opserver event data
             */
            const listener = (eventData) => {

                /**
                 * The keys that need to match the event data
                 * @type {Array}
                 */
                const keysToMatch = Object.keys(valuesToMatch);

                /**
                 * Number of key, value pairs that matched
                 * @type {number}
                 */
                let numMatches = 0;

                // Count number of matches
                for (let key of keysToMatch) {
                    const value = valuesToMatch[ key ];
                    const eventPropValue = get(eventData, key, undefined);

                    if (eventPropValue === value) {
                        numMatches += 1;
                    }
                }

                // Check the number of matches vs number of keys needed to match
                if (numMatches === keysToMatch.length) {
                    this.removeListener(eventString, listener);
                    resolve(eventData);
                }
            };

            // Setup event listener
            this.on(eventString, listener);

        }).asCallback(cb);
    }

    /**
     * Wait for an opserver event to match certain values
     * @method onMatched
     * @memberof module:opserver#Opserver
     * @param {string} eventString - Opserver event
     * @param {object} valuesToMatch - Object with keys and values to match
     * @param {function} listener
     * @returns {function} - Return a function that removes the .onMatched listener
     */
    onMatched(eventString, valuesToMatch, listener) {

        /**
         * Event listener that checks event data for matches against the given key, value pairs
         * @param {object} eventData - Opserver event data
         */
        const listenerWrapper = (eventData) => {

            /**
             * The keys that need to match the event data
             * @type {Array}
             */
            const keysToMatch = Object.keys(valuesToMatch);

            /**
             * Number of key, value pairs that matched
             * @type {number}
             */
            let numMatches = 0;

            // Count number of matches
            for (let key of keysToMatch) {
                const value = valuesToMatch[ key ];
                const eventPropValue = get(eventData, key, undefined);

                if (eventPropValue === value) {
                    numMatches += 1;
                }
            }

            // Check the number of matches vs number of keys needed to match
            if (numMatches === keysToMatch.length) {
                this.removeListener(eventString, listener);
                listener(eventData);
            }
        };

        // Setup event listener
        this.on(eventString, listenerWrapper);

        // Return a function that removes the listener
        return () => this.removeListener(eventString, listenerWrapper);

    }

    //============================================================
    //
    //               OPSERVER EVENT BUILDERS
    //
    //============================================================

    /**
     * Take a MongoDB oplog record and emit developer friendly events
     * @method module:opserver.Opserver#emitOpserverEvent
     * @private
     * @fires Opserver#insert:DATABASE
     * @fires Opserver#delete:DATABASE
     * @fires Opserver#update:DATABASE.PROPERTY_PATH
     * @param {object} oplogDoc - oplog document
     */
    emitOpserverEvent(oplogDoc) {

        // Build the opserver events based on the oplog document
        this.buildOpserverEvents(oplogDoc)
            .then(events => {

                // 1. Filter out the events that use paths that are excluded
                // 2. Emit all the events with data
                events
                    .filter(({ event, data }) => !isEventInExcludedPath(event, this.excludes[ `${data.type}Paths` ]))
                    .forEach(({ event, data }) => {
                        this.emit(event, data);
                    })
                ;

            })
            .catch((err) => this.Logger.error(`Error emit opserver event: ${err.stack}`))
        ;
    }

    /**
     * Build Opserver events from oplog document
     * @method module:opserver.Opserver#buildOpserverEvents
     * @private
     * @param {object} oplogDoc - Oplog document
     * @returns {Promise.<array>} - Returns
     */
    buildOpserverEvents(oplogDoc) {

        try {

            /**
             * This is the structure of the data that is sent along with Opserver events
             * @typedef {object} OpserverEventData
             * @prop {object} oplogDoc - passed in oplogDoc
             * @prop {string} id - The _id of the mongo doc involved in the operation.
             * @prop {string} type - The type of MongoDB operation - e.g. insert, update, delete
             * @prop {object} doc - The actual mongo doc that was involved in the operation.
             * @prop {object} operation - For inserts/deletes this is the actual doc; for updates it is the command
             *     to update old document.
             * @prop {*} setVal - The value of the path that is being observed, only for updates.
             * @prop {string} event - The event that this data was attached to
             * @prop {object} query - Only for updates.  The selection query for the operation.
             * @prop {string} changedPropPath - Only for updates.  The path that is being observed.
             */


            /**
             * This is the initial scaffolding of the data object that will be sent with each Opserver event
             * @type {OpserverEventData}
             */
            let data = {
                oplogDoc,

                id:              '',
                type:            this.opToNameEnum[ oplogDoc.op ],
                doc:             {},
                operation:       {},
                setVal:          null,
                event:           '',
                query:           {},
                changedPropPath: ''
            };

            // Return different event depending on operation type
            switch (data.type) {

                case 'insert':
                {
                    return this.buildInsertEvent(data, oplogDoc);
                }

                case 'delete':
                {
                    return this.buildDeleteEvent(data, oplogDoc);
                }

                case 'update':
                {
                    return this.buildUpdateEvents(data, oplogDoc);
                }

                // some other event, do nothing
                default:
                {
                    this.Logger.debug(oplogDoc.op);
                    this.Logger.debug(data);
                    return Promise.reject('Incorrect MongoDB oplog event type');
                }
            }
        }
        catch (err) {
            return Promise.reject(err);
        }
    }

    /**
     * Build the Opserver insert vent
     * @method module:opserver.Opserver#buildInsertEvent
     * @private
     * @param {object} data - The Opserver event data to modify
     * @param {object} oplogDoc - The MongoDB oplog doc
     * @returns {Promise.<array>} - Resolves with array holding an Opserver event
     */
    buildInsertEvent(data, oplogDoc) {

        data.doc = oplogDoc.o;
        data.id = oplogDoc.o._id;
        data.operation = oplogDoc.o;
        data.event = eventString('insert', oplogDoc.ns);

        return Promise.resolve([ { data, event: data.event } ]);
    }

    /**
     * Build the Opserver delete event
     * @method module:opserver.Opserver#buildDeleteEvent
     * @private
     * @param {object} data - The Opserver event data to modify
     * @param {object} oplogDoc - The MongoDB oplog doc
     * @returns {Promise.<array>}
     */
    buildDeleteEvent(data, oplogDoc) {

        data.doc = oplogDoc.o;
        data.id = oplogDoc.o._id;
        data.operation = oplogDoc.o;
        data.event = eventString('delete', oplogDoc.ns);

        return Promise.resolve([ { data, event: data.event } ]);
    }

    /**
     * Build the Opserver update event
     * @method module:opserver.Opserver#buildUpdateEvents
     * @private
     * @param {object} data - The Opserver event data to modify
     * @param {object} oplogDoc - The MongoDB oplog doc
     * @returns {Promise.<array>|*}
     */
    buildUpdateEvents(data, oplogDoc) {

        return new Promise((resolve, reject) => {

            data.operation = oplogDoc.o;
            data.query = oplogDoc.o2;
            data.id = oplogDoc.o2._id;

            // Check if any of the operation keys start with '$' which signifies a specific MongoDB operator
            const opKeysWithMoneyPrefix = Object.keys(data.operation).filter(key => key.substring(0, 1) === '$');

            // If there were no specific operators, do not emit events because it is not possible to tell
            // which part of the object was changed.
            if (opKeysWithMoneyPrefix.length === 0) {
                return resolve([]);
            }
            else {

                // Get the dbName and collection name from the oplog document's namespace
                const [dbName, collectionName] = oplogDoc.ns.split('.');

                /**
                 * For each update command ($set, $inc, etc..) emit
                 *
                 * .keys    Get the keys of the oplogDoc.o, which will mongo operation commands
                 * like ($set, $inc, etc..)
                 *
                 * .map     Create new array that are the values of those keys, which represent
                 * the properties that were changed
                 *
                 * .reduce  Reduce each of those objects into an array of changed object path
                 * strings (see computeObjectPaths)
                 *
                 * .map For each changed property (ex. workflow.flows.relatedJobs) create an
                 * event object to be emitted with that path
                 */
                const events = Object.keys(data.operation)
                    .map(key => data.operation[ key ])
                    .reduce((accumulatedPaths, object) => accumulatedPaths.concat(Opserver.computeObjectPaths(object)), [])
                    .map(changedPropPath => {

                        // Create a copy of the data so we can mutate it for this specific event
                        const dataClone = Object.assign({}, data);

                        // Set event specific properties
                        dataClone.event = eventString('update', oplogDoc.ns, changedPropPath);
                        dataClone.changedPropPath = changedPropPath;

                        return { data: dataClone, event: dataClone.event };
                    });

                const dbConn = this.connectionsMap.get(dbName);

                // Check to see if Opserver was able to get a database connection to this database
                // If it was, get the document that was updated and add extra properties to the event data
                if (dbConn) {
                    // Get the collection
                    let Collection;

                    try {
                        Collection = dbConn.collection(collectionName);
                    }
                    catch (err) {
                        this.Logger.error(err.stack);
                        return resolve(events);
                    }

                    // Get the document that was updated
                    Collection.findOne({ _id: data.id })
                        .then((foundDoc) => {

                            // Set the doc and setVal properties for each event
                            const moddedEvents = events.map(eventInfo => {

                                eventInfo.data.doc = foundDoc;
                                eventInfo.data.setVal = get(foundDoc, eventInfo.data.changedPropPath);

                                return eventInfo;
                            });

                            resolve(moddedEvents);
                        })
                        .catch(err => {
                            this.Logger.error(err.stack);
                        })
                    ;
                }
                else {
                    // If there was no database connection, return the events as is
                    resolve(events);
                }

            }
        });
    }

    //============================================================
    //
    //               UTILITY FUNCTIONS
    //
    //============================================================

    /**
     * Compute all object dot notation paths needed to reach all the non-Object values in an object
     * @method module:opserver.Opserver.computeObjectPaths
     * @private
     * @param {object} POJO - Plain-old-Javascript-object
     * @param {string} [path] - The path to start the computation from
     * @returns {string[]}
     */
    static computeObjectPaths(POJO, path = '') {

        // If 'thing' is a plain object...
        if (isPlainObject(POJO)) {

            // Recursively call this function on each key passing the value of thing[key] and the path to get to that
            // value
            return Object
                .keys(POJO)
                .reduce((prev, curr) => prev.concat(Opserver.computeObjectPaths(POJO[ curr ], `${path}.${curr}`)), []);
        }

        // This is a non-Object 'thing'
        // If path is empty return an empty array, otherwise return path in an array
        else {
            return path === '' ? [] : [ path ];
        }
    }

}

//============================================================
//
//               PRIVATE FUNCTIONS
//
//============================================================

/**
 * Formats the event string that is emitted by Opserver
 * @method module:opserver.Opserver~eventString
 * @private
 * @param {string} mongoOp - The operation that was done (insert, delete, update)
 * @param {string} nameSpace - The path to the collection operation occurred on (database.collection)
 * @param {string} [changedPropPath] - The path from the collection to the property that was updated (only for updates)
 * @returns {string} - Example: 'workflow.flows.stepsTaken'
 */
function eventString(mongoOp, nameSpace, changedPropPath = '') {
    return `${mongoOp}:${nameSpace}${changedPropPath}`;
}

/**
 * Check if a string is a substring of any one of an array of strings
 * @method module:opserver.Opserver~isEventInExcludedPath
 * @private
 * @param {string} string - String value that could be a substring
 * @param {string[]} substrings - Strings that the string could be a substring of
 * @returns {boolean} - True if string is a substring of any strings
 */
function isEventInExcludedPath(string, substrings) {

    let isEventExcluded = false;

    for (let substring of substrings) {

        if (string.includes(substring)) {
            isEventExcluded = true;
            break;
        }
    }

    return isEventExcluded;
}

module.exports = Opserver;
