// Mock for socket.io-client
class SocketMock {
  constructor() {
    this.handlers = {};
    this.emittedEvents = [];
    this.id = 'test-socket-id';
    this.connected = true;
    this.disconnected = false;
    
    // Convert emit to a jest.fn so it can be spied on
    this.emit = jest.fn((event, ...args) => {
      this.emittedEvents.push({ event, args });
      return this;
    });
  }

  on(event, callback) {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(callback);
    return this;
  }

  once(event, callback) {
    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      callback(...args);
    };
    return this.on(event, onceWrapper);
  }

  off(event, callback) {
    if (this.handlers[event]) {
      this.handlers[event] = this.handlers[event].filter(cb => cb !== callback);
    }
    return this;
  }

  // Helper methods for testing
  triggerEvent(event, ...args) {
    if (this.handlers[event]) {
      this.handlers[event].forEach(callback => {
        callback(...args);
      });
    }
  }

  getEmittedEvents(eventName = null) {
    if (eventName === null) {
      return this.emittedEvents;
    }
    return this.emittedEvents.filter(e => e.event === eventName);
  }

  clearEmittedEvents() {
    this.emittedEvents = [];
  }

  // Helper method to check if a specific event was emitted
  hasEmitted(eventName) {
    return this.emittedEvents.some(e => e.event === eventName);
  }

  connect() {
    this.connected = true;
    this.disconnected = false;
    this.triggerEvent('connect');
  }

  disconnect() {
    this.connected = false;
    this.disconnected = true;
    this.triggerEvent('disconnect');
  }
}

// Mock the io function that creates a socket
const io = jest.fn(() => {
  const socket = new SocketMock();
  io.socket = socket; // Store reference for testing
  return socket;
});

// Export default and named exports to match the original module
export default io;
export { io };
