'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @module module:opserver
 */

/**
 * Fastest Node EventEmitter
 * @type {EventEmitter}
 */
var EventEmitter3 = require('eventemitter3');

/**
 * The best Promise library for Node
 * @type {function|bluebird}
 */
var Promise = require('bluebird');

/**
 * Lodash function to lookup nested object properties by string path
 * @type {function}
 */
var get = require('lodash.get');

/**
 * Lodash function to check if an object is a POJO (Plain-old Javascript Object)
 * @type {function}
 */
var isPlainObject = require('lodash.isplainobject');

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

var Opserver = function (_EventEmitter) {
    _inherits(Opserver, _EventEmitter);

    function Opserver(oplog, connectionsMap, excludes, Logger) {
        _classCallCheck(this, Opserver);

        /**
         * An event emitter that emits mongo oplog transactions
         * @type {EventEmitter}
         */

        var _this = _possibleConstructorReturn(this, Object.getPrototypeOf(Opserver).call(this));

        _this.oplog = oplog;

        /**
         * Holds the excluded paths for the different MongoDB operations -- passed by user so still a POJO and not a Map
         * @readonly
         * @const{object}
         */
        _this.excludes = Object.assign({ insertPaths: [], deletePaths: [], updatePaths: [] }, excludes);

        /**
         * The logging functions for the different MongoDB operations
         * @readonly
         * @const {object}
         */
        _this.Logger = Object.assign({}, Logger);

        /**
         * A map of MongoDB connections
         * @readonly
         * @const {Map}
         */
        _this.connectionsMap = new Map(connectionsMap);

        /**
         * Mapping of Mongo oplog op types to full operation names
         * @readonly
         * @const {{i: string, d: string, u: string}}
         * @enum {string}
         */
        _this.opToNameEnum = {
            i: 'insert',
            d: 'delete',
            u: 'update'
        };

        // Setup Oplog event listeners
        _this.oplog.on('insert', _this.emitOpserverEvent.bind(_this));
        _this.oplog.on('update', _this.emitOpserverEvent.bind(_this));
        _this.oplog.on('delete', _this.emitOpserverEvent.bind(_this));
        _this.oplog.on('end', function () {
            return _this.Logger.error('Mongo-oplog stream ended.');
        });
        _this.oplog.on('error', function (error) {
            return _this.Logger.error(error);
        });
        return _this;
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


    _createClass(Opserver, [{
        key: 'onAny',
        value: function onAny(eventStrings, listener) {
            var _this2 = this;

            /**
             * Hold the event listeners
             * @type {Map}
             */
            var eventListeners = new Map();

            // Setup a bunch of event listeners on the event strings that were passed in
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = eventStrings[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var eventName = _step.value;


                    var boundListener = listener.bind(this, eventName);
                    eventListeners.set(eventName, boundListener);

                    this.on(eventName, boundListener);
                }

                // Return a function that removes all the listeners
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            return function () {
                return eventStrings.forEach(function (event) {
                    return _this2.removeListener(event, eventListeners.get(event));
                });
            };
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

    }, {
        key: 'onceMatched',
        value: function onceMatched(eventString, valuesToMatch, cb) {
            var _this3 = this;

            return new Promise(function (resolve, reject) {

                /**
                 * Event listener that checks event data for matches against the given key, value pairs
                 * @param {object} eventData - Opserver event data
                 */
                var listener = function listener(eventData) {

                    /**
                     * The keys that need to match the event data
                     * @type {Array}
                     */
                    var keysToMatch = Object.keys(valuesToMatch);

                    /**
                     * Number of key, value pairs that matched
                     * @type {number}
                     */
                    var numMatches = 0;

                    // Count number of matches
                    var _iteratorNormalCompletion2 = true;
                    var _didIteratorError2 = false;
                    var _iteratorError2 = undefined;

                    try {
                        for (var _iterator2 = keysToMatch[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                            var key = _step2.value;

                            var value = valuesToMatch[key];
                            var eventPropValue = get(eventData, key, undefined);

                            if (eventPropValue === value) {
                                numMatches += 1;
                            }
                        }

                        // Check the number of matches vs number of keys needed to match
                    } catch (err) {
                        _didIteratorError2 = true;
                        _iteratorError2 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion2 && _iterator2.return) {
                                _iterator2.return();
                            }
                        } finally {
                            if (_didIteratorError2) {
                                throw _iteratorError2;
                            }
                        }
                    }

                    if (numMatches === keysToMatch.length) {
                        _this3.removeListener(eventString, listener);
                        resolve(eventData);
                    }
                };

                // Setup event listener
                _this3.on(eventString, listener);
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

    }, {
        key: 'onMatched',
        value: function onMatched(eventString, valuesToMatch, listener) {
            var _this4 = this;

            /**
             * Event listener that checks event data for matches against the given key, value pairs
             * @param {object} eventData - Opserver event data
             */
            var listenerWrapper = function listenerWrapper(eventData) {

                /**
                 * The keys that need to match the event data
                 * @type {Array}
                 */
                var keysToMatch = Object.keys(valuesToMatch);

                /**
                 * Number of key, value pairs that matched
                 * @type {number}
                 */
                var numMatches = 0;

                // Count number of matches
                var _iteratorNormalCompletion3 = true;
                var _didIteratorError3 = false;
                var _iteratorError3 = undefined;

                try {
                    for (var _iterator3 = keysToMatch[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                        var key = _step3.value;

                        var value = valuesToMatch[key];
                        var eventPropValue = get(eventData, key, undefined);

                        if (eventPropValue === value) {
                            numMatches += 1;
                        }
                    }

                    // Check the number of matches vs number of keys needed to match
                } catch (err) {
                    _didIteratorError3 = true;
                    _iteratorError3 = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion3 && _iterator3.return) {
                            _iterator3.return();
                        }
                    } finally {
                        if (_didIteratorError3) {
                            throw _iteratorError3;
                        }
                    }
                }

                if (numMatches === keysToMatch.length) {
                    _this4.removeListener(eventString, listener);
                    listener(eventData);
                }
            };

            // Setup event listener
            this.on(eventString, listenerWrapper);

            // Return a function that removes the listener
            return function () {
                return _this4.removeListener(eventString, listenerWrapper);
            };
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

    }, {
        key: 'emitOpserverEvent',
        value: function emitOpserverEvent(oplogDoc) {
            var _this5 = this;

            // Build the opserver events based on the oplog document
            this.buildOpserverEvents(oplogDoc).then(function (events) {

                // 1. Filter out the events that use paths that are excluded
                // 2. Emit all the events with data
                events.filter(function (_ref) {
                    var event = _ref.event;
                    var data = _ref.data;
                    return !isEventInExcludedPath(event, _this5.excludes[data.type + 'Paths']);
                }).forEach(function (_ref2) {
                    var event = _ref2.event;
                    var data = _ref2.data;

                    _this5.emit(event, data);
                });
            }).catch(function (err) {
                return _this5.Logger.error('Error emit opserver event: ' + err.stack);
            });
        }

        /**
         * Build Opserver events from oplog document
         * @method module:opserver.Opserver#buildOpserverEvents
         * @private
         * @param {object} oplogDoc - Oplog document
         * @returns {Promise.<array>} - Returns
         */

    }, {
        key: 'buildOpserverEvents',
        value: function buildOpserverEvents(oplogDoc) {

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
                var data = {
                    oplogDoc: oplogDoc,

                    id: '',
                    type: this.opToNameEnum[oplogDoc.op],
                    doc: {},
                    operation: {},
                    setVal: null,
                    event: '',
                    query: {},
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
            } catch (err) {
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

    }, {
        key: 'buildInsertEvent',
        value: function buildInsertEvent(data, oplogDoc) {

            data.doc = oplogDoc.o;
            data.id = oplogDoc.o._id;
            data.operation = oplogDoc.o;
            data.event = eventString('insert', oplogDoc.ns);

            return Promise.resolve([{ data: data, event: data.event }]);
        }

        /**
         * Build the Opserver delete event
         * @method module:opserver.Opserver#buildDeleteEvent
         * @private
         * @param {object} data - The Opserver event data to modify
         * @param {object} oplogDoc - The MongoDB oplog doc
         * @returns {Promise.<array>}
         */

    }, {
        key: 'buildDeleteEvent',
        value: function buildDeleteEvent(data, oplogDoc) {

            data.doc = oplogDoc.o;
            data.id = oplogDoc.o._id;
            data.operation = oplogDoc.o;
            data.event = eventString('delete', oplogDoc.ns);

            return Promise.resolve([{ data: data, event: data.event }]);
        }

        /**
         * Build the Opserver update event
         * @method module:opserver.Opserver#buildUpdateEvents
         * @private
         * @param {object} data - The Opserver event data to modify
         * @param {object} oplogDoc - The MongoDB oplog doc
         * @returns {Promise.<array>|*}
         */

    }, {
        key: 'buildUpdateEvents',
        value: function buildUpdateEvents(data, oplogDoc) {
            var _this6 = this;

            return new Promise(function (resolve, reject) {

                data.operation = oplogDoc.o;
                data.query = oplogDoc.o2;
                data.id = oplogDoc.o2._id;

                // Check if any of the operation keys start with '$' which signifies a specific MongoDB operator
                var opKeysWithMoneyPrefix = Object.keys(data.operation).filter(function (key) {
                    return key.substring(0, 1) === '$';
                });

                // If there were no specific operators, do not emit events because it is not possible to tell
                // which part of the object was changed.
                if (opKeysWithMoneyPrefix.length === 0) {
                    return resolve([]);
                } else {
                    var _ret = function () {

                        // Get the dbName and collection name from the oplog document's namespace

                        var _oplogDoc$ns$split = oplogDoc.ns.split('.');

                        var _oplogDoc$ns$split2 = _slicedToArray(_oplogDoc$ns$split, 2);

                        var dbName = _oplogDoc$ns$split2[0];
                        var collectionName = _oplogDoc$ns$split2[1];

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

                        var events = Object.keys(data.operation).map(function (key) {
                            return data.operation[key];
                        }).reduce(function (accumulatedPaths, object) {
                            return accumulatedPaths.concat(Opserver.computeObjectPaths(object));
                        }, []).map(function (changedPropPath) {

                            // Create a copy of the data so we can mutate it for this specific event
                            var dataClone = Object.assign({}, data);

                            // Set event specific properties
                            dataClone.event = eventString('update', oplogDoc.ns, changedPropPath);
                            dataClone.changedPropPath = changedPropPath;

                            return { data: dataClone, event: dataClone.event };
                        });

                        var dbConn = _this6.connectionsMap.get(dbName);

                        // Check to see if Opserver was able to get a database connection to this database
                        // If it was, get the document that was updated and add extra properties to the event data
                        if (dbConn) {
                            // Get the collection
                            var Collection = undefined;

                            try {
                                Collection = dbConn.collection(collectionName);
                            } catch (err) {
                                _this6.Logger.error(err.stack);
                                return {
                                    v: resolve(events)
                                };
                            }

                            // Get the document that was updated
                            Collection.findOne({ _id: data.id }).then(function (foundDoc) {

                                // Set the doc and setVal properties for each event
                                var moddedEvents = events.map(function (eventInfo) {

                                    eventInfo.data.doc = foundDoc;
                                    eventInfo.data.setVal = get(foundDoc, eventInfo.data.changedPropPath);

                                    return eventInfo;
                                });

                                resolve(moddedEvents);
                            }).catch(function (err) {
                                _this6.Logger.error(err.stack);
                            });
                        } else {
                            // If there was no database connection, return the events as is
                            resolve(events);
                        }
                    }();

                    if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
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

    }], [{
        key: 'computeObjectPaths',
        value: function computeObjectPaths(POJO) {
            var path = arguments.length <= 1 || arguments[1] === undefined ? '' : arguments[1];


            // If 'thing' is a plain object...
            if (isPlainObject(POJO)) {

                // Recursively call this function on each key passing the value of thing[key] and the path to get to that
                // value
                return Object.keys(POJO).reduce(function (prev, curr) {
                    return prev.concat(Opserver.computeObjectPaths(POJO[curr], path + '.' + curr));
                }, []);
            }

            // This is a non-Object 'thing'
            // If path is empty return an empty array, otherwise return path in an array
            else {
                    return path === '' ? [] : [path];
                }
        }
    }]);

    return Opserver;
}(EventEmitter3);

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


function eventString(mongoOp, nameSpace) {
    var changedPropPath = arguments.length <= 2 || arguments[2] === undefined ? '' : arguments[2];

    return mongoOp + ':' + nameSpace + changedPropPath;
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

    var isEventExcluded = false;

    var _iteratorNormalCompletion4 = true;
    var _didIteratorError4 = false;
    var _iteratorError4 = undefined;

    try {
        for (var _iterator4 = substrings[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
            var substring = _step4.value;


            if (string.includes(substring)) {
                isEventExcluded = true;
                break;
            }
        }
    } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
    } finally {
        try {
            if (!_iteratorNormalCompletion4 && _iterator4.return) {
                _iterator4.return();
            }
        } finally {
            if (_didIteratorError4) {
                throw _iteratorError4;
            }
        }
    }

    return isEventExcluded;
}

module.exports = Opserver;