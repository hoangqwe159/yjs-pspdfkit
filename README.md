Install bun
```
brew install oven-sh/bun/bun
```

Install
```
bun i
```

Client
```
bun dev
```

Websocket Server 
```
HOST=localhost PORT=1234 npx y-websocket
```

WebRTC Server (only this one is working now)
```
PORT=4444 node node_modules/y-webrtc/bin/server.js
```

Document
- https://github.com/yjs/yjs
- https://github.com/yjs/y-websocket
- https://github.com/yjs/y-webrtc