/**
 * Multiplayer WebSocket relay server for Project Flowerbed
 * Minimal relay for real-time presence sync and planting events
 */

import { WebSocketServer } from 'ws';

const PORT = process.env.MULTIPLAYER_PORT || 8090;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

class MultiplayerServer {
  constructor() {
    this.wss = new WebSocketServer({ port: PORT });
    this.rooms = new Map(); // roomId -> Set<client>
    this.clients = new Map(); // client -> { clientId, room, lastPing }

    console.log(`🌻 Multiplayer server starting on port ${PORT}`);
    this.setupServer();
    this.startHeartbeat();
  }

  setupServer() {
    this.wss.on('connection', (ws) => {
      console.log('New connection established');

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.warn('Invalid message format:', error.message);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (error) => {
        console.warn('WebSocket error:', error.message);
      });

      // Send ping immediately for connection verification
      ws.ping();
    });
  }

  handleMessage(ws, message) {
    const { v: version, type } = message;

    // Version check
    if (version !== 1) {
      this.sendError(ws, 'Unsupported message version');
      return;
    }

    switch (type) {
      case 'hello':
        this.handleHello(ws, message);
        break;
      case 'snapshot':
        this.handleSnapshot(ws, message);
        break;
      case 'event:plant':
        this.handlePlantEvent(ws, message);
        break;
      case 'pong':
        this.handlePong(ws);
        break;
      default:
        console.warn(`Unknown message type: ${type}`);
    }
  }

  handleHello(ws, message) {
    const { clientId, room = 'default' } = message;

    if (!clientId) {
      this.sendError(ws, 'clientId required');
      return;
    }

    // Clean up any existing connection for this client
    this.cleanupClient(ws);

    // Register client
    this.clients.set(ws, {
      clientId,
      room,
      lastPing: Date.now(),
    });

    // Add to room
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room).add(ws);

    console.log(`Client ${clientId} joined room ${room}`);

    // Notify others in the room
    this.broadcastToRoom(
      room,
      {
        v: 1,
        type: 'join',
        clientId,
        timestamp: Date.now(),
      },
      ws,
    );

    // Confirm connection
    this.send(ws, {
      v: 1,
      type: 'hello_ack',
      clientId,
      room,
    });
  }

  handleSnapshot(ws, message) {
    const client = this.clients.get(ws);
    if (!client) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    // Rate limit: max 25 Hz (40ms intervals)
    const now = Date.now();
    if (client.lastSnapshot && now - client.lastSnapshot < 40) {
      return; // Drop message
    }
    client.lastSnapshot = now;

    // Validate and sanitize snapshot data
    const sanitized = this.sanitizeSnapshot(message);
    if (!sanitized) return;

    // Add client ID and broadcast
    sanitized.clientId = client.clientId;
    this.broadcastToRoom(client.room, sanitized, ws);
  }

  handlePlantEvent(ws, message) {
    const client = this.clients.get(ws);
    if (!client) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    // Validate plant event
    const { plantType, pos, quat, t } = message;
    if (!plantType || !pos || !quat) {
      this.sendError(ws, 'Invalid plant event data');
      return;
    }

    // Sanitize position and rotation
    const sanitized = {
      v: 1,
      type: 'event:plant',
      clientId: client.clientId,
      plantType,
      pos: this.clampVector3(pos),
      quat: this.clampQuaternion(quat),
      t: t || Date.now(),
    };

    this.broadcastToRoom(client.room, sanitized, ws);
  }

  handlePong(ws) {
    const client = this.clients.get(ws);
    if (client) {
      client.lastPing = Date.now();
    }
  }

  handleDisconnect(ws) {
    const client = this.clients.get(ws);
    if (!client) return;

    const { clientId, room } = client;
    console.log(`Client ${clientId} disconnected from room ${room}`);

    // Remove from room
    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.delete(ws);
      if (roomClients.size === 0) {
        this.rooms.delete(room);
      } else {
        // Notify others
        this.broadcastToRoom(room, {
          v: 1,
          type: 'leave',
          clientId,
          timestamp: Date.now(),
        });
      }
    }

    // Clean up client
    this.clients.delete(ws);
  }

  cleanupClient(ws) {
    const client = this.clients.get(ws);
    if (client) {
      const room = this.rooms.get(client.room);
      if (room) {
        room.delete(ws);
      }
      this.clients.delete(ws);
    }
  }

  sanitizeSnapshot(message) {
    const { t, head, lh, rh } = message;

    if (!head || !lh || !rh) return null;

    return {
      v: 1,
      type: 'snapshot',
      t: t || Date.now(),
      head: {
        p: this.clampVector3(head.p),
        q: this.clampQuaternion(head.q),
      },
      lh: {
        p: this.clampVector3(lh.p),
        q: this.clampQuaternion(lh.q),
      },
      rh: {
        p: this.clampVector3(rh.p),
        q: this.clampQuaternion(rh.q),
      },
    };
  }

  clampVector3(vec) {
    if (!vec || typeof vec.x !== 'number') return { x: 0, y: 0, z: 0 };
    return {
      x: Math.max(-1000, Math.min(1000, Math.round(vec.x * 1000) / 1000)),
      y: Math.max(-1000, Math.min(1000, Math.round(vec.y * 1000) / 1000)),
      z: Math.max(-1000, Math.min(1000, Math.round(vec.z * 1000) / 1000)),
    };
  }

  clampQuaternion(quat) {
    if (!quat || typeof quat.x !== 'number') return { x: 0, y: 0, z: 0, w: 1 };
    return {
      x: Math.max(-1, Math.min(1, Math.round(quat.x * 1000) / 1000)),
      y: Math.max(-1, Math.min(1, Math.round(quat.y * 1000) / 1000)),
      z: Math.max(-1, Math.min(1, Math.round(quat.z * 1000) / 1000)),
      w: Math.max(-1, Math.min(1, Math.round(quat.w * 1000) / 1000)),
    };
  }

  broadcastToRoom(roomId, message, exclude = null) {
    const roomClients = this.rooms.get(roomId);
    if (!roomClients) return;

    const messageStr = JSON.stringify(message);
    roomClients.forEach((client) => {
      if (client !== exclude && client.readyState === client.OPEN) {
        client.send(messageStr);
      }
    });
  }

  send(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, error) {
    this.send(ws, {
      v: 1,
      type: 'error',
      error,
      timestamp: Date.now(),
    });
  }

  startHeartbeat() {
    setInterval(() => {
      const now = Date.now();

      this.wss.clients.forEach((ws) => {
        const client = this.clients.get(ws);

        if (!client) return;

        // Check if client is stale (no pong in 60 seconds)
        if (now - client.lastPing > 60000) {
          console.log(`Terminating stale connection for client ${client.clientId}`);
          ws.terminate();
          return;
        }

        // Send ping
        ws.ping();
      });
    }, HEARTBEAT_INTERVAL);
  }
}

// Start server
new MultiplayerServer();

