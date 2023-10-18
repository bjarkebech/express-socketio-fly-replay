var express = require('express');
var router = express.Router();
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var http = require("http");
var debug = require("debug")("socketio:server");

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

var indexRouter = router.get("/", function (req, res, next) {
  const FLY_INSTANCE = process.env.FLY_ALLOC_ID
    ? process.env.FLY_ALLOC_ID.split("-")[0]
    : null;
  res.render("index", { fly_instance_id: FLY_INSTANCE });
});

app.use("/", indexRouter);
var port = normalizePort(process.env.PORT || '3000');
app.set('port', port);
var server = http.createServer(app);

/**
 * =======================================================================
 * 
 * This is where the magic happens - Replay requests with `fly_instance_id`
 * to the originating Fly.io instance.
 * 
 * =======================================================================
 */

const FLY_INSTANCE_ID = process.env.FLY_ALLOC_ID
  ? process.env.FLY_ALLOC_ID.split("-")[0]
  : null;

server.on("upgrade", function (req, socket, head) {
  // No-op on localhost/non-Fly environments.
  if (!FLY_INSTANCE_ID) return;

  // No-op on other HTTP upgrades.
  if (req.headers["upgrade"] !== "websocket") return;

  // Get target fly instance via URL pattern matching.
  const instanceIdMatches = req.url.match(/fly_instance_id=(.*?)(?:&|$)/);
  // No matches, bail.
  if (!instanceIdMatches) return;
  const TARGET_INSTANCE = instanceIdMatches[1];

  if (FLY_INSTANCE_ID === TARGET_INSTANCE) return;
  console.log("Mismatch detected, replaying");

  // Create a raw HTTP response with the fly-replay header.
  // HTTP code 101 must be used to make the response replay correctly.
  const headers = [
    "HTTP/1.1 101 Switching Protocols",
    `fly-replay: instance=${TARGET_INSTANCE}`,
  ];

  // Send new headers and close the socket.
  socket.end(headers.concat("\r\n").join("\r\n"));
});

// Start socket.io
const io = require("socket.io")(server);

// respond to "click" events for testing
io.on("connection", (socket) => {
  console.log(`socket ${socket.id} connected`);
  socket.on("click", (data) => {
    
    // Send a random string back for testing.
    io.emit("heyyo", String(Math.random() * 1000));
  });
});

/**
 * =======================================================================
 */

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
}
