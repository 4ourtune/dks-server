process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.DATABASE_PATH = ':memory:';

global.beforeAll = global.beforeAll || (() => {});
global.afterAll = global.afterAll || (() => {});
global.beforeEach = global.beforeEach || (() => {});
global.afterEach = global.afterEach || (() => {});

global.expect = require('expect');
