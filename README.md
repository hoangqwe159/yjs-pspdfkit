Demo
![CleanShot 2024-12-05 at 11 23 17](https://github.com/user-attachments/assets/b622e9ef-c2e5-49ec-b3fe-36d9fd95cb0a)

Install bun
```
brew install oven-sh/bun/bun
```

Install
```
bun i
```

Copy pspdfkit to public folder
```
cp -R ./node_modules/pspdfkit/dist/ ./public
```

Client
```
bun dev
```

Websocket Server 
```
HOST=localhost PORT=1234 npx y-websocket
```

WebRTC Server (working)
```
PORT=4444 node node_modules/y-webrtc/bin/server.js
```

Document
- https://github.com/yjs/yjs
- https://github.com/yjs/y-websocket
- https://github.com/yjs/y-webrtc
