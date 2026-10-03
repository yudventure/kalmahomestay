'use strict';

const { createMysqlRepo } = require('./mysql');
const { createFileRepo } = require('./file');

/** MySQL when database settings are present, otherwise a JSON file in DATA_DIR (development only). */
function createRepo(config) {
  if (config.db) return createMysqlRepo(config.db, { autoMigrate: config.dbAutoMigrate });
  return createFileRepo(config.dataDir);
}

module.exports = { createRepo };
