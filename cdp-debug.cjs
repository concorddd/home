const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/0F4F336154606688D96E1F1AEF572293');

ws.on('open', () => {
  // Habilita console e runtime
  ws.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
  ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
  ws.send(JSON.stringify({ id: 3, method: 'Page.navigate', params: { url: 'http://localhost:8080/amigos' } }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.method === 'Console.messageAdded') {
    const m = msg.params.message;
    console.log(`[${m.level.toUpperCase()}] ${m.text}`);
  }
  if (msg.method === 'ConsoleAPICalled') {
    const args = msg.params.args || [];
    const text = args.map(a => a.value || a.description || '').join(' ');
    console.log(`[${msg.params.type.toUpperCase()}] ${text}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const exc = msg.params.exceptionDetails;
    console.log('[EXCEPTION]', exc.exception?.description || exc.text);
  }
});

setTimeout(() => { ws.close(); process.exit(0); }, 15000);
