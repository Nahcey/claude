'use strict';
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME;

const raw = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const client = DynamoDBDocumentClient.from(raw);

// TODO: async function getItem(PK, SK) { ... }        // GetCommand
// TODO: async function putItem(item) { ... }          // PutCommand
// TODO: async function deleteItem(PK, SK) { ... }     // DeleteCommand
// TODO: async function queryByPK(PK, opts) { ... }    // QueryCommand, SK 내림차순 옵션 포함

// TODO: module.exports = { getItem, putItem, deleteItem, queryByPK, TABLE_NAME };
module.exports = { client, TABLE_NAME };
