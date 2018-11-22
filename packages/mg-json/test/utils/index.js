/**
 * Test Utilities
 *
 * Shared utils for writing tests
 */
const path = require('path');

// Require overrides - these add globals for tests
require('./overrides');

// Require assertions - adds custom should assertions
require('./assertions');

module.exports.fixturesFilename = name => path.join(__dirname, '../', 'fixtures', name);
