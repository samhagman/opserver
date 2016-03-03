/**
 * Native MongoDB Driver for Node
 * @type {class|MongoClient}
 */
const mClient = require('mongodb').MongoClient;

/**
 * Helper library for setting up MongoDB oplog tail
 * @type {function|MongoOplog}
 */
const MongoOplog = require('mongo-oplog');

/**
 * The best Promise library for Node
 * @type {function|bluebird}
 */
const Promise = require('bluebird');

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
export default function buildOpserver({
    mongoURI,
    mongoAdminOptions = {},
    mongoReadOnlyOptions = {},
    excludes = {},
    debugMode = false,
    loggerFunctions = {
        info() {
            console.log(...arguments);
        },
        warn() {
            console.log(...arguments);
        },
        debug() {
            console.log(...arguments);
        },
        error() {
            console.log(...arguments);
        }
    }
} = {}, cb) {

    return new Promise((resolve, reject) => {

        // Setup the Logger
        let logger = new DebugLogger(loggerFunctions, debugMode);

        /**
         * Setup the options to pass to the connection to the Admin Database
         * @type {object}
         */
        const mongoDbAdminOptions = Object.assign({}, mongoAdminOptions);

        // Use the bluebird library for promises
        mongoDbAdminOptions.promiseLibrary = Promise;

        return mClient
            .connect(mongoURI, mongoDbAdminOptions)
            .then(db => {

                const adminDb = db.admin();

                adminDb.authenticate(mongoDbAdminOptions.user, mongoDbAdminOptions.pass)
                    .then(result => {
                        if (!result) throw new Error('Unable to authenticate with the given Admin username and password.');

                        // List all databases and then attempt to connect to them using the readOnly credentials
                        return adminDb.listDatabases()
                            .tap(dbs => logger.debug(dbs))
                            .then(({ databases }) => {
                                const dbConnectPromises = databases.map(database => {

                                    const uri = `${mongoURI.slice(0, mongoURI.lastIndexOf('/'))}/${database.name}`;
                                    logger.debug(uri);

                                    // .reflect() => PromiseInspections http://bluebirdjs.com/docs/api/promiseinspection.html
                                    return Promise.all([ database.name, mClient.connect(uri, mongoReadOnlyOptions).reflect() ]);
                                });

                                return Promise.all(dbConnectPromises);
                            })
                            .then((dbConnectionTuples) => {

                                /**
                                 * Holds the MongoDB connections
                                 * @type {Map}
                                 */
                                const connectionsMap = new Map();

                                // If the connection to the database was successful, add it to the connections map
                                dbConnectionTuples.forEach(tuple => {
                                    const dbName = tuple[ 0 ];
                                    const dbConnPromiseInspection = tuple[ 1 ];

                                    if (dbConnPromiseInspection.isFulfilled()) {
                                        const dbConn = dbConnPromiseInspection.value();
                                        connectionsMap.set(dbName, dbConn);
                                    }
                                    else if (debugMode) {
                                        logger.warn('Connection to database failed:');
                                        logger.warn(tuple.reason());
                                        connectionsMap.set(dbName, null);
                                    }
                                });

                                // Start to tail the MongoDB oplog
                                const oplog = MongoOplog(db.db('local'), {}).tail(() => {

                                    // Instantiate the Opserver class
                                    const Opserver = require('./Opserver');
                                    const opserver = new Opserver(oplog, connectionsMap, excludes, logger);

                                    return resolve(opserver);

                                });

                            });
                    })
                ;
            });


    }).asCallback(cb);
}

/**
 * @class DebugLogger
 * @classdesc Class that handles debug logging
 * @private
 */
class DebugLogger {

    constructor({ info, debug, warn, error }, debugMode) {

        this.info = debugMode && info ? info : (() => {});
        this.debug = debugMode && debug ? debug : (() => {});
        this.warn = debugMode && warn ? warn : (() => {});
        this.error = debugMode && error ? error : (() => {});

    }

    /**
     * Logs info messages
     * @memberof DebugLogger
     * @instance
     * @type {Function}
     */
    info() {}

    /**
     * Logs debug messages
     * @memberof DebugLogger
     * @instance
     * @type {Function}
     */
    debug() {}

    /**
     * Logs warning messages
     * @memberof DebugLogger
     * @instance
     * @type {Function}
     */
    warn() {}

    /**
     * Logs error messages
     * @memberof DebugLogger
     * @instance
     * @type {Function}
     */
    error() {}
}

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


