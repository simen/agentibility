/**
 * Simple test server that serves fixture files
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

const contentTypes: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

export function startTestServer(port: number): Promise<{ close: () => Promise<void>; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url || '/';
      const path = url === '/' ? '/search-page.html' : url;

      try {
        const filePath = join(fixturesDir, path);
        const content = await readFile(filePath, 'utf-8');
        const ext = extname(filePath);
        const contentType = contentTypes[ext] || 'text/plain';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.on('error', reject);

    server.listen(port, () => {
      resolve({
        port,
        close: () => new Promise<void>((resolveClose) => {
          server.close(() => resolveClose());
        }),
      });
    });
  });
}

// Run standalone if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.argv[2] || '3456', 10);
  startTestServer(port).then(({ port }) => {
    console.log(`Test server running on http://localhost:${port}`);
    console.log('Available fixtures:');
    console.log('  /search-page.html - Form with search');
    console.log('  /article.html     - Article with sections');
  });
}
