'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('../helloworld/dist/helloworld.cjs.js');
} else {
  module.exports = require('../helloworld/dist/helloworld.cjs.dev.js');
}
