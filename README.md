[![npm version](https://badge.fury.io/js/opserver.svg)](https://badge.fury.io/js/opserver)
[![bitHound Overall Score](https://www.bithound.io/github/samhagman/opserver/badges/score.svg)](https://www.bithound.io/github/samhagman/opserver)

# Opserver
> A developer-friendly MongoDB oplog event aggregator

## About
The MongoDB oplog stores a record of all transactions (i.e., changes) that occur on your MongoDB server.  These records are designed to have a minimal footprint including shorthand key names and strange and changing values depending on transaction type.  Inevitably any developer attempting to tail the oplog for their own purposes will spend a lot of time googling around for what the keys mean and why the values change.  Opserver was created to hopefully ease this pain.

Put simply, Opserver is an event emitter that tails the MongoDB oplog and emits developer-friendly events.  Besides attempting to normalize and expand the key, value naming and values for oplog events, Opserver has a few tricks up its sleeve.  It can also do **up-front filtering based on database, collection, and/or properties of collection records** and **automatic record retrieval for all transaction types.**

> To use the MongoDB oplog you must be running your MongoDB instance as a replica set, even if you are not actually replicating your instance.

## Table of Contents
- [Examples](https://github.com/samhagman/opserver#examples)
- [Initialization](https://github.com/samhagman/opserver#initialization)
- [Event Types](https://github.com/samhagman/opserver#event-types)
- [Event Data](https://github.com/samhagman/opserver#event-data)
- [Methods](https://github.com/samhagman/opserver#methods)
- [TODO](https://github.com/samhagman/opserver#todo)

## Examples
```node
// Get an opserver factory back
var opserverFactory = require(‘opserver’);

var opserverOptions = {
    mongoAdminURI: ‘mongodb://127.0.0.1:27017/admin?replicaSet=test’,
    mongoAdminOptions: { user: ‘admin’, pass: ‘adminPass’ },
    mongoReadOnlyOptions: { user: ‘readUser’, pass: ‘readPass’ }
};

// Get the opserver via callback or Promise (omit the callback argument)
opserverBuilder(opserverOptions, function(opserver) {

    // Listen for new inserts into a collection
    opserver.on(‘insert:mydb.users’, function(eventData) {

        //  Access the id of the inserted document
        console.log(eventData.id);
    
        //  Access the full inserted document
        console.log(eventData.doc.firstName);
    
        //  Access the doc that was sent in the insert
        console.log(eventData.operation);
    
    });

    // Update events give you even more useful information
    opserver.on(‘update:mydb.users.email’, function(eventData) {

        //  `eventData.operation` for update events is the MongoDB update command that was executed
        console.log(eventData.operation);
    
        //  Also have access to the raw MongoDB oplog document
        console.log(oplogDoc);
    
        //  Quick access to the property that was updated
        //  (the last value after the dot — e.g. email, firstName)
        console.log(eventData.setVal);
    
        //  You can also look at the exact query used to update
        console.log(eventData.query);
    
    });

});

```

## Initialization
Initializing an Opserver requires three key arguments:

- A mongo connection string for the admin database of your MongoDB installation

- The options needed to authenticate and connect to that database (either in object or connection string format)

- The options needed to authenticate as a read only user to the databases you want to listen for events on.  This would
just be the same user/pass setup on all your databases that you want Opserver to be able to access

Opserver will initialize in the following way:

1. Connect to your admin database using the given admin credentials
2. List all the databases that are in your MongoDB installation
3. Attempt to connect to all the databases with the read only user credentials
4. Begin to tail the Mongo oplog
5. Start emitting events

> Note: The admin user must have the 'clusterAdmin' role on the admin database


## Event Types

There are two types of events in Opserver: **Insert/Delete** and **Update**.

- Insert/Delete event strings are formatted like so:
`'insert:DATABASE_NAME.COLLECTION'` / `'delete:DATABASE_NAME.COLLECTION'`

These are straightforward, you have the name of the operation, a colon, the name of the database, and then a collection
within that database.

- Update event strings are formatted like so:
`'update:DATABASE_NAME.COLLECTION.PATH.TO.FIELD'`

These are more interesting and let you listen for updates to specific fields or subdocuments within a collection.  Using
update events combined with [`Opserver#onMatched`](https://github.com/samhagman/opserver#opserveronmatchedstring-eventstring-object-valuestomatch-function-listener--function) you are able to construct powerful triggers on changes to your data
fairly easily.

Here are the event types taken straight from the code's JSDoc comments:

```node

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

```

## Event Data

Your promise or callback returned by any of Opserver's APIs will come with Event Data.  This data will include the following
fields:

```node

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

```

## Methods

> [EventEmitter3](https://github.com/primus/eventemitter3) (which Opserver extends) gives most of the usual [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter) functions such as `.on`, `.removeListener`, etc.  Please refer to the [EventEmitter3](https://github.com/primus/eventemitter3) and Node [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter) docs for these methods standard Node Event methods.  The methods below are in addition to those standard methods.

### `Opserver#onAny(<String[]> eventStrings, <Function> listener) => {Function}`
> `onAny()` allows you to register multiple different event listeners that share the same callback.  This returns a function that when called will remove all the event listeners.

### `Opserver#onceMatched(<String> eventString, <Object> valuesToMatch, <Function> [cb]) => {Promise<EventData>}`
> Register a listener which will only trigger when the EventData of an event matches the `valuesToMatch` object.  The `valuesToMatch` object must be constructed in the form  `{ 'OBJECT.PATH': VALUE }` e.g., `{ 'doc.firstName': 'Sam' }`

### `Opserver#onMatched(<String> eventString, <Object> valuesToMatch, <Function> listener) => {Function}`
> Same as `Opserver#onceMatched` but will trigger multiple times until the listener is removed.  Returns a function that when called will remove the listener from the event.


## TODO

- [x] Completely document code in JSDoc format
- [ ] Build and serve JSDoc output on github.io
- [ ] Write tests
- [ ] Optimize further
- [ ] ???
