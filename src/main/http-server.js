const http = require('http');

class LocalServer {
  constructor(mainWindow, port = 11025) {
    this.mainWindow = mainWindow;
    this.port = port;
    this.server = null;
  }

  start() {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      // Handle CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'POST' && req.url === '/add') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.url && this.mainWindow) {
              // Bring window to front
              if (this.mainWindow.isMinimized()) this.mainWindow.restore();
              this.mainWindow.focus();
              
              // Send to renderer
              this.mainWindow.webContents.send('external:add-url', data.url);
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } else {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'No URL provided' }));
            }
          } catch (e) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`Local server listening on port ${this.port}`);
    });
    
    this.server.on('error', (err) => {
      console.error(`Local server error: ${err.message}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
  
  isRunning() {
    return this.server !== null;
  }
}

module.exports = { LocalServer };
