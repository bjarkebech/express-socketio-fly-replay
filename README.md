# Using multiple Fly.io instances with socket.io and Express.js

Adapted to Node.js and Express from @zauberzeug's Python implementation [fly_fastapi_socketio](https://github.com/zauberzeug/fly_fastapi_socketio).

## Run Locally

```bash
npm i
npm start
```

## Run on fly.io

```bash
fly launch
fly scale count 2 # let two machines run in the same region to reproduce the error
fly deploy
fly logs
```

## The Problem

If you have an interactive app running on fly.io with multiple instances
you may need to make sure that your websocket is connecting back to exactly the instance where the website was served from due some local state.
This can not exclusively be achieved with the `fly-force-instance-id` header, because it is not possible to add custom headers to websockets in the browser.

## The Solution

Inspired by https://fly.io/blog/replicache-machines-demo/ we use the `fly-replay` header in the response 
to tell the load balancer to run the request once again to the right instance.
But how do we know the right instance? The blog from fly.io suggests a database in the backend.
To minimize infrastructure and potential bottlenecks the implementation here takes an alternative route: 
The instance simply injects its fly id into the served page so the socket connection can provide it as a query parameter.
A middleware can then decide if the requested instance id matches the one handling the request.
If not a replay must be performed.

## The JavaScript fix

The Socket.io server-side API doesn't provide a way to intercept and modify HTTP headers for the WebSocket `upgrade` request. So we need to hook into the Node.js server directly, and handle `upgrade` requests manually. This is [the same approach taken by Fly.io](https://github.com/fly-apps/replicache-websocket/blob/63cc00ad4875ce1a20780b7705ad72a4fd7c62f3/replicache-express/src/index.ts#L123) in the Replicache example that inspired this solution.

The fix is as follows. See app.js for a complete example.
```js
server.on("upgrade", function (req, socket, head) {
  if(req.headers["upgrade"] !== "websocket") return;
  
  // Get target fly instance via URL pattern matching.
  const matches = req.url.match(/fly_instance_id=(.*?)(?:&|$)/);
  if(!matches) return;
  const TARGET_INSTANCE = matches[1];

  // No-op if we're on the correct fly machine.
  if(FLY_INSTANCE_ID === TARGET_INSTANCE) return;

  // We have a mismatch.
  // Create a raw HTTP response with the fly-replay header.
  // HTTP 101 must be used to make replays work
  const headers = [
    "HTTP/1.1 101 Switching Protocols",
    `fly-replay: instance=${TARGET_INSTANCE}`,
  ];
  
  socket.end(headers.concat("\r\n").join("\r\n"));
});
```