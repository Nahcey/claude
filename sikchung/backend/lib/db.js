'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME;

const rawClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const client = DynamoDBDocumentClient.from(rawClient);

// TODO: async function getItem({ PK, SK }) { ... }
// TODO: async function putItem(item) { ... }
// TODO: async function deleteItem({ PK, SK }) { ... }
// TODO: async function queryItems({ PK, skPrefix }) { ... }

// TODO: module.exports = { getItem, putItem, deleteItem, queryItems, TABLE_NAME }

module.exports = { client, TABLE_NAME };
