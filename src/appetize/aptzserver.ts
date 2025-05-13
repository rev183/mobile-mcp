import { server as WebSocketServer } from 'websocket';
import express from 'express';
import http from 'http';
import fs from 'fs/promises';
import path, { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { error, trace } from "../logger.js";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clients = new Map();
const pendingRequests = new Map();

const app = express();
app.use(express.static(path.join(__dirname, '../../src/appetize/public')));
app.use(express.json()); // Middleware to parse JSON request bodies

var server = http.createServer(app);

app.get('/launch.html', (req, res) => {
    trace("Received GET request for / or /launch.html");
    fs.readFile(path.join(__dirname, '/public/launch.html'), 'utf8')
        .then(content => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        })
        .catch(err => {
            res.status(404).send('404 Not Found');
            error("Error serving launch.html:" + JSON.stringify(err));
        });
});

app.post('/actions', async (req, res) => {
    trace("Received POST request for /actions");
    const { actions } = req.body;
    for (const action of actions) {
        trace("Action:" + action);
        await sendRequestToClient(action.clientId, action.action, action.payload)
        .then((data: { screenshot: string }) => {
            
        })
        .catch(err => {
            trace("Error sending action to client: " + JSON.stringify(err));
        });
    }
    res.status(200).send("Action sent to client");
});

export function startAppetizeHttpServer(): Promise<void> {
    return new Promise((resolve) => {
        server.listen(8080, function () {
            resolve();
        });
    });
}

export function stopAppetizeHttpServer(): Promise<void> {
    if (server.listening) {
        return new Promise((resolve) => {
            server.close(() => {
                resolve();
            });
        });
    }
    return Promise.resolve();
}

var wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false,
    maxReceivedFrameSize: 100 * 1024 * 1024,
    maxReceivedMessageSize: 10 * 1024 * 1024,
    keepalive: true,
});

wsServer.on('request', function(request) {    
    const connection = request.accept(null, request.origin);
    let clientId: string;
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            trace("Received Message: " + message.utf8Data);
            try {
                const data = JSON.parse(message.utf8Data.toString());
                if (data.type === 'register_client' && data.clientId) {
                    clientId = data.clientId;
                    clients.set(clientId, connection);
                    trace("Client registered with ID: " + clientId + " from " + request.origin + ".");
                }
                if (data.requestId) {
                    const requestId = data.requestId;
                    const err = data.error;
                    const pending = pendingRequests.get(requestId);
                    if (pending) {
                        if (err) {
                            pending.reject(err);
                            pendingRequests.delete(requestId);
                            return;
                        }
                        pending.resolve(data.payload);
                        pendingRequests.delete(requestId);
                    } else {
                        trace(`Received response for unknown request ID: ${requestId}`);
                    }
                } else {
                    trace(`Received message from ${clientId}: ${JSON.stringify(data)}`);
                }
            } catch (err) {
                error(`Failed to parse message from ${clientId}: ${err}`);
            }
        } 
        else if (message.type === 'binary') {
            trace("Received Binary Message of " + message.binaryData.length + " bytes");
            // connection.sendBytes(message.binaryData);
        }
    });

    connection.on('close', function(reasonCode, description) {
        clients.delete(clientId);
        trace("Peer " + connection.remoteAddress + " disconnected for client " + clientId + " with reason: " + reasonCode + " - " + description);
        for (const [requestId, pending] of pendingRequests.entries()) {
            if (pending.clientId === clientId) {
                pending.reject("Client disconnected");
                pendingRequests.delete(requestId);
            }
        }
    });

    connection.on('error', function(err) {
        error(`WebSocket error for client ${clientId}: ${err}`);
        clients.delete(clientId);
        for (const [requestId, pending] of pendingRequests.entries()) {
            if (pending.clientId === clientId) {
                pending.reject("WebSocket error");
                pendingRequests.delete(requestId);
            }
        }
    });
});

export function sendRequestToClient(clientId: string, action: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const requestId = uuidv4();
        const request = { request_id: requestId, action, payload };
        const client = clients.get(clientId.toString());
        if (!client) {
            return reject(`Client ${clientId} not found`);
        }

        if (client.connected) {
            client.send(JSON.stringify(request));
            trace(`Server sent request ${requestId} to ${clientId}:, ${request}`);
            pendingRequests.set(requestId, { resolve, reject, clientId });
            setTimeout(() => {
                if (pendingRequests.has(requestId)) {
                    pendingRequests.delete(requestId);
                    reject("Timeout waiting for client response");
                }
            }, 30000); // 30 seconds timeout
        } else {
            reject("Client WebSocket is not open");
        }
    });
}