/**
 * WebSocket transport with reconnection logic and message queuing
 */

export class TransportWebSocket {
	constructor(url) {
		this.url = url;
		this.ws = null;
		this.isConnecting = false;
		this.isConnected = false;
		this.reconnectAttempts = 0;
		this.maxReconnectAttempts = 10;
		this.reconnectDelay = 1000; // Start at 1 second
		this.maxReconnectDelay = 30000; // Max 30 seconds
		this.messageQueue = [];
		this.maxQueueSize = 100;
		this.listeners = new Map();
		this.reconnectTimer = null;

		// Bind methods
		this.onOpen = this.onOpen.bind(this);
		this.onClose = this.onClose.bind(this);
		this.onError = this.onError.bind(this);
		this.onMessage = this.onMessage.bind(this);
	}

	connect() {
		if (this.isConnecting || this.isConnected) {
			return;
		}

		this.isConnecting = true;
		console.log(`Connecting to multiplayer server: ${this.url}`);

		try {
			this.ws = new WebSocket(this.url);
			this.ws.addEventListener('open', this.onOpen);
			this.ws.addEventListener('close', this.onClose);
			this.ws.addEventListener('error', this.onError);
			this.ws.addEventListener('message', this.onMessage);
		} catch (error) {
			console.error('Failed to create WebSocket:', error);
			this.scheduleReconnect();
		}
	}

	disconnect() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.ws) {
			this.ws.removeEventListener('open', this.onOpen);
			this.ws.removeEventListener('close', this.onClose);
			this.ws.removeEventListener('error', this.onError);
			this.ws.removeEventListener('message', this.onMessage);

			if (this.ws.readyState === WebSocket.OPEN) {
				this.ws.close();
			}
			this.ws = null;
		}

		this.isConnecting = false;
		this.isConnected = false;
		this.messageQueue.length = 0;
	}

	send(message) {
		const messageStr = JSON.stringify(message);

		if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
			try {
				this.ws.send(messageStr);
				return true;
			} catch (error) {
				console.warn('Failed to send message:', error);
				this.queueMessage(messageStr);
				return false;
			}
		} else {
			this.queueMessage(messageStr);
			return false;
		}
	}

	queueMessage(messageStr) {
		if (this.messageQueue.length >= this.maxQueueSize) {
			this.messageQueue.shift(); // Remove oldest message
		}
		this.messageQueue.push(messageStr);
	}

	flushQueue() {
		while (this.messageQueue.length > 0 && this.isConnected) {
			const messageStr = this.messageQueue.shift();
			try {
				this.ws.send(messageStr);
			} catch (error) {
				console.warn('Failed to send queued message:', error);
				// Put it back at the front
				this.messageQueue.unshift(messageStr);
				break;
			}
		}
	}

	on(event, callback) {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, []);
		}
		this.listeners.get(event).push(callback);
	}

	off(event, callback) {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			const index = callbacks.indexOf(callback);
			if (index !== -1) {
				callbacks.splice(index, 1);
			}
		}
	}

	emit(event, ...args) {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			callbacks.forEach((callback) => {
				try {
					callback(...args);
				} catch (error) {
					console.error(`Error in ${event} callback:`, error);
				}
			});
		}
	}

	onOpen() {
		console.log('WebSocket connected');
		this.isConnecting = false;
		this.isConnected = true;
		this.reconnectAttempts = 0;
		this.reconnectDelay = 1000;

		this.flushQueue();
		this.emit('open');
	}

	onClose(event) {
		console.log('WebSocket closed:', event.code, event.reason);
		this.isConnecting = false;
		this.isConnected = false;

		this.emit('close', event);

		// Attempt to reconnect unless it was a clean close
		if (event.code !== 1000) {
			this.scheduleReconnect();
		}
	}

	onError(error) {
		console.error('WebSocket error:', error);
		this.emit('error', error);
	}

	onMessage(event) {
		try {
			const message = JSON.parse(event.data);
			this.emit('message', message);
		} catch (error) {
			console.warn('Failed to parse WebSocket message:', error);
		}
	}

	scheduleReconnect() {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.error('Max reconnect attempts reached');
			this.emit('maxReconnectAttemptsReached');
			return;
		}

		const delay = Math.min(
			this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
			this.maxReconnectDelay,
		);

		console.log(
			`Scheduling reconnect in ${delay}ms (attempt ${
				this.reconnectAttempts + 1
			}/${this.maxReconnectAttempts})`,
		);

		this.reconnectTimer = setTimeout(() => {
			this.reconnectAttempts++;
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	getConnectionState() {
		return {
			isConnected: this.isConnected,
			isConnecting: this.isConnecting,
			reconnectAttempts: this.reconnectAttempts,
			queuedMessages: this.messageQueue.length,
		};
	}
}

