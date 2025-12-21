"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var http_1 = require("http");
var ws_1 = require("ws");
var node_pty_1 = require("node-pty");
var crypto_1 = require("crypto");
var app = (0, express_1.default)();
var server = http_1.default.createServer(app);
var wss = new ws_1.default.Server({ server: server });
var PORT = 3000;
var terminals = new Map();
app.get('/health', function (req, res) {
    res.json({ status: 'ok' });
});
function createTerminal() {
    var id = crypto_1.default.randomUUID();
    var shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';
    var ptyProcess = node_pty_1.default.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME,
        env: process.env
    });
    terminals.set(id, ptyProcess);
    ptyProcess.on('exit', function () {
        terminals.delete(id);
    });
    return { id: id, ptyProcess: ptyProcess };
}
wss.on('connection', function (ws) {
    ws.on('message', function (raw) {
        var msg;
        try {
            msg = JSON.parse(raw.toString());
        }
        catch (_a) {
            return;
        }
        var type = msg.type, terminalId = msg.terminalId, data = msg.data, cols = msg.cols, rows = msg.rows;
        if (type === 'create') {
            var _b = createTerminal(), id_1 = _b.id, ptyProcess = _b.ptyProcess;
            ptyProcess.on('data', function (output) {
                if (ws.readyState === ws_1.default.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'output',
                        terminalId: id_1,
                        data: output
                    }));
                }
            });
            ws.send(JSON.stringify({
                type: 'created',
                terminalId: id_1
            }));
        }
        if (type === 'input' && terminals.has(terminalId)) {
            terminals.get(terminalId).write(data);
        }
        if (type === 'resize' &&
            terminals.has(terminalId) &&
            Number.isInteger(cols) &&
            Number.isInteger(rows)) {
            terminals.get(terminalId).resize(cols, rows);
        }
        if (type === 'close' && terminals.has(terminalId)) {
            terminals.get(terminalId).kill();
            terminals.delete(terminalId);
        }
    });
});
server.listen(PORT, function () {
    console.log("server listening on :".concat(PORT));
});
