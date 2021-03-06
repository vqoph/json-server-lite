const path = require('path');
const express = require('express');
const chokidar = require('chokidar');
const bodyParser = require('body-parser');

const cors = require('./cors');
const database = require('./db/database');
const router = require('./router/router');
const logger = require('./logger/logger');
const loggerMiddleware = require('./logger/logger-middleware');
const createActionsFromDB = require('./actions/reducer');
const startupLog = require('./startup-log');

module.exports = (config) => {
  const { source, port, host, watch, watchFiles, 'no-cors': noCors, quiet } = config;

  if (quiet) logger.transports.forEach((t) => (t.silent = true));

  let server = null;

  const api = require(path.resolve(process.cwd() + '/' + source));

  const db = database(api);
  const actions = createActionsFromDB(db, config);
  const app = express();

  if (!noCors) {
    app.use(cors());
  }

  app.use([
    bodyParser.json({ limit: '10mb', extended: false }),
    bodyParser.urlencoded({ extended: false }),
  ]);

  app.use(loggerMiddleware);

  app.use('/api', router({ actions }));

  function start() {
    server = app.listen(port, () => {
      startupLog({ host, port, actions });
    });
  }

  function restart() {
    server.close(() => {
      logger.info('Server restart', { scope: 'server' });
      start();
    });
  }

  if (watch || watchFiles) {
    const watcher = chokidar.watch((watchFiles && watchFiles.toString()) || source, {
      ignored: [/(^|[/\\])\../, (path) => path.includes('node_modules')],
      persistent: true,
    });

    watcher.on('all', (event, path) => {
      switch (event) {
        case 'add':
          logger.info(`Watching for ${path}`, { scope: 'watcher' });
          break;

        case 'change':
          logger.info(`${path} changed`, { scope: 'watcher' });
          restart();
          break;

        default:
          break;
      }
    });
  }

  logger.info('Start server', { scope: 'server' });
  start();
};
