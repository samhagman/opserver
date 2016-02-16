'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.default = buildOpserver;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * Native MongoDB Driver for Node
 * @type {class|MongoClient}
 */
var mClient = require('mongodb').MongoClient;

/**
 * Helper library for setting up MongoDB oplog tail
 * @type {function|MongoOplog}
 */
var MongoOplog = require('mongo-oplog');

/**
 * The best Promise library for Node
 * @type {function|bluebird}
 */
var Promise = require('bluebird');

/**
 * Build the opserver
 * @param {string} mongoURI - The mongo connection string
 * @param {object} mongoAdminOptions - The options (including user and password) to authenticate to the admin database
 * @param {object} mongoReadOnlyOptions - The connection options to authenticate a readOnly user for other databases
 * @param {{insertPaths: [], deletePaths: [], updatePaths: []}} excludes - Paths to exclude from the three event types
 * @param {boolean} debugMode - Whether or not to enable debug mode (currently only turns on logging)
 * @param {{info: function, warn: function, debug: function, error: function}} [loggerFunctions] - Custom user logger
 * @param {callback} [cb] - Optional callback interface
 * @returns {Promise.<Opserver>}
 */
function buildOpserver() {
    var _ref = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    var mongoURI = _ref.mongoURI;
    var _ref$mongoAdminOption = _ref.mongoAdminOptions;
    var mongoAdminOptions = _ref$mongoAdminOption === undefined ? {} : _ref$mongoAdminOption;
    var _ref$mongoReadOnlyOpt = _ref.mongoReadOnlyOptions;
    var mongoReadOnlyOptions = _ref$mongoReadOnlyOpt === undefined ? {} : _ref$mongoReadOnlyOpt;
    var _ref$excludes = _ref.excludes;
    var excludes = _ref$excludes === undefined ? {} : _ref$excludes;
    var _ref$debugMode = _ref.debugMode;
    var debugMode = _ref$debugMode === undefined ? false : _ref$debugMode;
    var _ref$loggerFunctions = _ref.loggerFunctions;
    var loggerFunctions = _ref$loggerFunctions === undefined ? {
        info: function info() {
            var _console;

            (_console = console).log.apply(_console, arguments);
        },
        warn: function warn() {
            var _console2;

            (_console2 = console).log.apply(_console2, arguments);
        },
        debug: function debug() {
            var _console3;

            (_console3 = console).log.apply(_console3, arguments);
        },
        error: function error() {
            var _console4;

            (_console4 = console).log.apply(_console4, arguments);
        }
    } : _ref$loggerFunctions;
    var cb = arguments[1];


    return new Promise(function (resolve, reject) {

        // Setup the Logger
        var logger = new DebugLogger(loggerFunctions, debugMode);

        /**
         * Setup the options to pass to the connection to the Admin Database
         * @type {object}
         */
        var mongoDbAdminOptions = Object.assign({}, mongoAdminOptions);

        // Use the bluebird library for promises
        mongoDbAdminOptions.promiseLibrary = Promise;

        return mClient.connect(mongoURI, mongoDbAdminOptions).then(function (db) {

            var adminDb = db.admin();

            // List all databases and then attempt to connect to them using the readOnly credentials
            return adminDb.listDatabases().tap(function (dbs) {
                return logger.debug(dbs);
            }).then(function (_ref2) {
                var databases = _ref2.databases;

                var dbConnectPromises = databases.map(function (database) {
                    var uri = mongoURI.slice(0, mongoURI.lastIndexOf('/')) + '/' + database.name;
                    logger.debug(uri);
                    // .reflect() => PromiseInspections http://bluebirdjs.com/docs/api/promiseinspection.html
                    return Promise.all([database.name, mClient.connect(uri, mongoReadOnlyOptions).reflect()]);
                });

                return Promise.all(dbConnectPromises);
            }).then(function (dbConnectionTuples) {

                /**
                 * Holds the MongoDB connections
                 * @type {Map}
                 */
                var connectionsMap = new Map();

                // If the connection to the database was successful, add it to the connections map
                dbConnectionTuples.forEach(function (tuple) {
                    var dbName = tuple[0];
                    var dbConnPromiseInspection = tuple[1];

                    if (dbConnPromiseInspection.isFulfilled()) {
                        var dbConn = dbConnPromiseInspection.value();
                        connectionsMap.set(dbName, dbConn);
                    } else if (debugMode) {
                        logger.warn('Connection to database failed:');
                        logger.warn(tuple.reason());
                        connectionsMap.set(dbName, null);
                    }
                });

                // Start to tail the MongoDB oplog
                var oplog = MongoOplog(db.db('local'), {}).tail(function () {

                    // Instantiate the Opserver class
                    var Opserver = require('./Opserver');
                    var opserver = new Opserver(oplog, connectionsMap, excludes, logger);

                    return resolve(opserver);
                });
            });
        });
    }).asCallback(cb);
}

/**
 * @class DebugLogger
 * @classdesc Class that handles debug logging
 * @private
 */

var DebugLogger = function () {
    function DebugLogger(_ref3, debugMode) {
        var info = _ref3.info;
        var debug = _ref3.debug;
        var warn = _ref3.warn;
        var error = _ref3.error;

        _classCallCheck(this, DebugLogger);

        this.info = debugMode && info ? info : function () {};
        this.debug = debugMode && debug ? debug : function () {};
        this.warn = debugMode && warn ? warn : function () {};
        this.error = debugMode && error ? error : function () {};
    }

    /**
     * Logs info messages
     * @memberof DebugLogger
     * @instance
     * @type {Function}
     */


    _createClass(DebugLogger, [{
        key: 'info',
        value: function info() {}

        /**
         * Logs debug messages
         * @memberof DebugLogger
         * @instance
         * @type {Function}
         */

    }, {
        key: 'debug',
        value: function debug() {}

        /**
         * Logs warning messages
         * @memberof DebugLogger
         * @instance
         * @type {Function}
         */

    }, {
        key: 'warn',
        value: function warn() {}

        /**
         * Logs error messages
         * @memberof DebugLogger
         * @instance
         * @type {Function}
         */

    }, {
        key: 'error',
        value: function error() {}
    }]);

    return DebugLogger;
}();

//db.authenticate(adminUser, adminPass, function(err, result) {
//    if (err) {
//        throw new Error(err);
//    }
//    else if (result) {
//        const localDB = db.db('local');
//        const oplog = MongoOplog(localDB).tail(() => {
//
//            const Opserver = require('./opserver');
//
//            const opserver = new Opserver(oplog, excludes, Logger);
//
//            opserver.setMaxListeners(maxListeners);
//
//            oplog.on('insert', emitChangedPropBuilder(opserver, excludes.insertPaths || [], Logger));
//
//            oplog.on('update', emitChangedPropBuilder(opserver, excludes.updatePaths || [], Logger));
//
//            oplog.on('delete', emitChangedPropBuilder(opserver, excludes.deletePaths || [], Logger));
//
//            oplog.on('end', () => Logger.error('Mongo-oplog stream ended.'));
//
//            oplog.on('error', (error) => Logger.error(error));
//
//            return resolve(opserver);
//
//        });
//    }
//    else {
//        throw new Error('Failed to authenticate to admin database.');
//    }
//});


module.exports = exports['default'];