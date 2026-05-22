const repo = require('../src/repositories/ticketRepository');
const classificationLog = require('../src/classification/classificationLog');

afterEach(() => {
  repo.clear();
  classificationLog.clear();
});
